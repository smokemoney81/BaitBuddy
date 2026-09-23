import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { integrations, entities, api, community } from "@/api/frontendClient";
import TabBar from "@/components/layout/TabBar";
import { auth } from "@/api/auth";
import { User } from "@/entities/User";
import { toast } from "sonner";
import { Heart, MessageCircle, Send, Camera, AlertTriangle, User as UserIcon, Loader2, X, Globe, Facebook, Trophy, Fish, TrendingUp, Award, Zap, Droplet, Star } from "lucide-react";
import CompetitionCard from "@/components/community/CompetitionCard";
import LeaderboardCard from "@/components/community/LeaderboardCard";
import CompetitionsSection from "@/components/community/CompetitionsSection";
import PlanGuard from "@/components/premium/PlanGuard";
import ChatWidget from "@/components/community/ChatWidget";
import PageContainer from "@/components/layout/PageContainer";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

const CommentInput = memo(function CommentInput({ onSubmit }) {
  const [text, setText] = useState("");
  const submit = () => {
    const value = text.trim();
    if (!value) {
      toast.error("Kommentar darf nicht leer sein");
      return;
    }
    setText("");
    onSubmit(value);
  };
  return (
    <div className="flex gap-2 pt-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Dein Kommentar..."
        className="bg-gray-800/50 border-gray-700 text-white"
        onKeyPress={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button onClick={submit} className="bb-action px-3 py-1.5">
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
});

// User-Badges: hilfreiche Gewässerinformationen, gute Guides, bestätigte Daten
function UserBadges({ userEmail, userCache }) {
  const user = userCache[userEmail];
  if (!user || !user.badges) return null;

  const badgeConfig = {
    'water_expert': { icon: Droplet, label: 'Gewässer-Experte', color: 'text-cyan-400' },
    'guide_creator': { icon: Award, label: 'Guide-Autor', color: 'text-amber-400' },
    'verified_data': { icon: Star, label: 'Verifizierte Daten', color: 'text-green-400' },
    'helpful': { icon: Zap, label: 'Hilfreicher Angler', color: 'text-emerald-400' }
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {(user.badges || []).map(badge => {
        const config = badgeConfig[badge];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <div key={badge} title={config.label} className={`${config.color} inline-flex items-center gap-1`}>
            <Icon size={14} />
          </div>
        );
      })}
    </div>
  );
}

// Gewässer-spezifische Community-Räume
function WaterBodyRooms() {
  const [waterBodies, setWaterBodies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWaterBodies = async () => {
      try {
        const spots = await entities.Spot.list('', 20);
        const bodies = spots.slice(0, 6).map(spot => ({
          id: spot.id,
          name: spot.name || 'Unbekanntes Gewässer',
          postCount: Math.floor(Math.random() * 50) + 1,
          members: Math.floor(Math.random() * 200) + 10,
          type: spot.water_type || 'Stillgewässer'
        }));
        setWaterBodies(bodies);
      } catch (error) {
        console.error('Fehler beim Laden der Gewässer:', error);
      }
      setLoading(false);
    };
    loadWaterBodies();
  }, []);

  if (loading) return <div className="text-center py-8 text-slate-400">Gewässer werden geladen...</div>;

  return (
    <div className="space-y-3">
      {waterBodies.map(body => (
        <div key={body.id} className="bb-card group cursor-pointer hover:bg-slate-700/40 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-100 group-hover:text-cyan-300">{body.name}</h3>
              <p className="text-xs text-slate-400">{body.type}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-cyan-300">{body.postCount} Beiträge</p>
              <p className="text-xs text-slate-400">{body.members} Mitglieder</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Community-Challenges: zeitlich begrenzte Aufgaben
function CommunityChallenge({ challenge, userCache: _userCache }) {
  const daysLeft = Math.ceil((new Date(challenge.end_date) - Date.now()) / (1000 * 60 * 60 * 24));
  const progress = Math.min(100, (challenge.submissions || 0) / (challenge.target || 10) * 100);

  return (
    <div className="bb-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-100">{challenge.title}</h3>
          <p className="text-xs text-slate-400 mt-1">{challenge.description}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded ${
          daysLeft > 3 ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'
        }`}>
          {daysLeft} Tage
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{challenge.submissions || 0}/{challenge.target || 10} Beiträge</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-cyan-300 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <button className="bb-secondary mt-3 w-full">Challenge annehmen</button>
    </div>
  );
}

// Memoisierte Post-Karte: rendert nur neu, wenn sich ihre eigenen Props ändern.
// So lösen unabhängige Re-Renders des Feeds (z.B. der 30s-Aktive-Nutzer-Tick
// oder das Tippen in der Suche) kein Neurendern aller Karten mehr aus.
const PostCard = memo(function PostCard({
  post, userCache, isOwnPost, isCommenting, isDeleting, isReported,
  onLike, onToggleComment, onReport, onDelete, onSubmitComment,
}) {
  const authorOf = (email) => userCache[email] || null;
  const nameOf = (email) => {
    const u = authorOf(email);
    return u?.full_name || u?.nickname || email?.split('@')[0] || 'Anonym';
  };
  const picOf = (email) => authorOf(email)?.profile_picture_url || null;

  const profilePic = picOf(post.created_by);
  const displayName = nameOf(post.created_by);

  return (
    <div className="bb-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {profilePic ? (
            <img src={profilePic} alt={displayName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid var(--bb-cyan)' }} />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,229,255,.15)', border: '2px solid rgba(0,229,255,.3)' }}>
              <UserIcon className="w-5 h-5" style={{ color: 'var(--bb-cyan)' }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{displayName}</p>
              <UserBadges userEmail={post.created_by} userCache={userCache} />
            </div>
            <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
              {new Date(post.created_at).toLocaleDateString('de-DE', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>
        </div>

        {isOwnPost && (
          <button
            type="button"
            onClick={() => onDelete(post.id)}
            disabled={isDeleting}
            className="bb-header-icon-btn"
            style={{ color: 'var(--bb-red)' }}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </button>
        )}
      </div>

      {post.text && <p className="whitespace-pre-wrap mb-3" style={{ color: '#dce8f2' }}>{post.text}</p>}

      {post.photo_url && (
        <img src={post.photo_url} alt="Post" className="w-full rounded-xl max-h-96 object-cover mb-3" />
      )}

      <div className="flex items-center gap-4 pt-3" style={{ borderTop: '1px solid var(--bb-border)' }}>
        <button type="button" onClick={() => onLike(post.id, post.likes || 0)} className="flex items-center gap-1 text-sm" style={{ color: 'var(--bb-muted)' }}>
          <Heart size={16} />
          {post.likes || 0}
        </button>

        <button type="button" onClick={() => onToggleComment(post.id)} className="flex items-center gap-1 text-sm" style={{ color: 'var(--bb-muted)' }}>
          <MessageCircle size={16} />
          {post.comments?.length || 0}
        </button>

        {!isOwnPost && (
          <button
            type="button"
            onClick={() => onReport(post.id)}
            className="ml-auto flex items-center text-sm"
            style={{ color: isReported ? 'var(--bb-orange)' : 'var(--bb-muted)' }}
            title={isReported ? 'Bereits gemeldet' : 'Post melden'}
          >
            <AlertTriangle size={16} />
          </button>
        )}
      </div>

      {post.comments && post.comments.length > 0 && (
        <div className="space-y-2 pt-3 mt-3" style={{ borderTop: '1px solid var(--bb-border)' }}>
          {post.comments.map((comment) => {
            const commentProfilePic = picOf(comment.created_by);
            const commentDisplayName = nameOf(comment.created_by);
            return (
              <div key={comment.id} className="flex gap-2">
                {commentProfilePic ? (
                  <img src={commentProfilePic} alt={commentDisplayName} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,229,255,.12)' }}>
                    <UserIcon className="w-4 h-4" style={{ color: 'var(--bb-cyan)' }} />
                  </div>
                )}
                <div className="flex-1 rounded-xl p-2" style={{ background: 'rgba(0,0,0,.2)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--bb-cyan)' }}>{commentDisplayName}</p>
                  <p className="text-sm" style={{ color: '#c0d8e4' }}>{comment.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCommenting && <CommentInput onSubmit={(text) => onSubmitComment(post.id, text)} />}
    </div>
  );
});

export default function Community() {
  useFeatureTracking("community");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPostText, setNewPostText] = useState("");
  const [newPostImage, setNewPostImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [commenting, setCommenting] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userCache, setUserCache] = useState({});
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [reportedPostIds, setReportedPostIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('reported_posts') || '[]'); } catch { return []; }
  });
  const [competitions, setCompetitions] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [_isRefreshing, setIsRefreshing] = useState(false);
  const [_pullStart, setPullStart] = useState(0);
  const [_pullDistance, setPullDistance] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [activeTab, setActiveTab] = useState("competitions");
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadCurrentUser();
    loadPosts();
    loadCompetitions();
    loadRecentActivity();
    loadActiveUserCount();
    const interval = setInterval(loadActiveUserCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let startY = 0;
    let currentDistance = 0;

    const handleTouchStart = (e) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (startY > 0) {
        const distance = e.touches[0].clientY - startY;
        if (distance > 0 && distance < 150) {
          currentDistance = distance;
          setPullDistance(distance);
        }
      }
    };

    const handleTouchEnd = async () => {
      if (currentDistance > 80) {
        setIsRefreshing(true);
        await loadPosts();
        await loadCompetitions();
        await loadRecentActivity();
        setIsRefreshing(false);
      }
      startY = 0;
      currentDistance = 0;
      setPullStart(0);
      setPullDistance(0);
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await auth.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Fehler beim Laden des Users:", error);
      toast.error("Authentifizierung erforderlich. Bitte melden Sie sich an.");
    }
  };

  const loadCompetitions = async () => {
    try {
      // Lade alte Community-Wettbewerbe
      const comps = await entities.Competition.list('-created_date', 20);
      const oldComps = comps.filter(c => c.is_active);

      // Lade neue Events
      const events = await (async () => {
        try {
          const eventsData = await api.get('/api/events');
          if (!Array.isArray(eventsData)) return [];
          return eventsData.map(e => ({
            id: e.id,
            title: e.name,
            description: e.description,
            competition_type: 'event',
            target_species: e.target_species,
            start_date: e.start_date,
            end_date: e.end_date,
            created_by: e.created_by,
            is_active: true
          }));
        } catch (err) {
          console.error('Fehler beim Laden der Events:', err);
          return [];
        }
      })();

      // Kombiniere beide
      setCompetitions([...events, ...oldComps]);
    } catch (error) {
      console.error("Fehler beim Laden der Wettbewerbe:", error);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const activeComps = await entities.Competition.filter({ is_active: true });
      setRecentActivity(activeComps);
    } catch (error) {
      console.error("Fehler beim Laden der Aktivitaten:", error);
    }
  };

  const loadActiveUserCount = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const sessions = await entities.ChatSession.filter({ is_active: true });
      const active = sessions.filter(s => new Date(s.last_activity) > new Date(fiveMinutesAgo));
      setActiveUserCount(active.length);
    } catch (error) {
      console.error("Fehler beim Laden aktiver User:", error);
    }
  };

  const votingCompetitions = competitions.filter(c => c.competition_type === 'photo_contest');
  const teamCompetitions = competitions.filter(c => c.competition_type === 'most_catches');
  const eventCompetitions = competitions.filter(c => c.competition_type === 'event');
  const otherCompetitions = competitions.filter(c => c.competition_type !== 'photo_contest' && c.competition_type !== 'most_catches' && c.competition_type !== 'event');

  const getUserDisplayName = useCallback((email) => {
    const user = userCache[email];
    return user?.full_name || user?.nickname || email?.split('@')[0] || 'Anonym';
  }, [userCache]);

  const filteredPosts = posts.filter(post => {
    const query = searchQuery.toLowerCase();
    const matchesText = (post.text || "").toLowerCase().includes(query);
    const matchesCreator = getUserDisplayName(post.created_by).toLowerCase().includes(query);
    return matchesText || matchesCreator;
  });

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const [postsData, allComments] = await Promise.all([
        entities.Post.list("-created_at", 50),
        entities.Comment.list('', 1000)
      ]);

      const newCache = { ...userCache };
      const allEmails = new Set();

      postsData.forEach(post => allEmails.add(post.created_by));
      allComments.forEach(comment => allEmails.add(comment.created_by));

      const missingEmails = Array.from(allEmails).filter(email => !newCache[email]);

      if (missingEmails.length > 0) {
        try {
          const allUsers = await User.list('', 1000);

          missingEmails.forEach(email => {
            const foundUser = allUsers.find(u => u.email === email);
            newCache[email] = foundUser || {
              email,
              nickname: null,
              full_name: null,
              profile_picture_url: null
            };
          });
        } catch (err) {
          console.error("Fehler beim Laden der Users:", err);
          missingEmails.forEach(email => {
            newCache[email] = {
              email,
              nickname: null,
              full_name: null,
              profile_picture_url: null
            };
          });
        }
      }

      setUserCache(newCache);

      const commentMap = {};
      allComments.forEach(comment => {
        if (!commentMap[comment.post_id]) {
          commentMap[comment.post_id] = [];
        }
        commentMap[comment.post_id].push(comment);
      });

      const postsWithComments = postsData.map(post => ({
        ...post,
        comments: commentMap[post.id] || []
      }));

      setPosts(postsWithComments);
    } catch (error) {
      console.error("Fehler beim Laden der Posts:", error);
      toast.error("Posts konnten nicht geladen werden");
    }
    setLoading(false);
  }, [userCache]);


  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Bild ist zu groß (max 5MB)");
      return;
    }

    setNewPostImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePost = async () => {
    if (!newPostText.trim() && !newPostImage) {
      toast.error("Bitte Text oder Bild hinzufügen");
      return;
    }

    setUploading(true);
    let photoUrl = null;

    try {
      if (newPostImage) {
        const response = await integrations.Core.UploadFile({ file: newPostImage });
        photoUrl = response.file_url;
      }

      await entities.Post.create({
        text: newPostText.trim(),
        photo_url: photoUrl,
        likes: 0,
        reported: false
      });

      setNewPostText("");
      setNewPostImage(null);
      setImagePreview(null);
      toast.success("Post erstellt");
      await loadPosts();
      window.scrollTo(0, 0);
    } catch (error) {
      console.error("Fehler beim Erstellen des Posts:", error);
      toast.error("Post konnte nicht erstellt werden");
    } finally {
      setUploading(false);
    }
  };

  const handleLike = useCallback(async (postId, currentLikes) => {
    // Optimistic update (funktionales setState → Handler bleibt referenzstabil)
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: currentLikes + 1 } : p
    ));

    try {
      await community.likePost(postId);
    } catch (error) {
      console.error("Fehler beim Liken:", error);
      // Revert on error
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, likes: currentLikes } : p
      ));
      toast.error("Like fehlgeschlagen");
    }
  }, []);

  const handleComment = useCallback(async (postId, rawText) => {
    const text = (rawText || "").trim();
    if (!text) {
      toast.error("Kommentar darf nicht leer sein");
      return;
    }

    if (!currentUser?.email) {
      toast.error("Bitte melde dich an");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      id: tempId,
      post_id: postId,
      text,
      created_by: currentUser.email,
      created_date: new Date().toISOString()
    };

    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, comments: [...(p.comments || []), optimisticComment] }
        : p
    ));

    try {
      const newComment = await entities.Comment.create({
        post_id: postId,
        text
      });

      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, comments: (p.comments || []).map(c => c.id === tempId ? newComment : c) }
          : p
      ));
    } catch (error) {
      console.error("Fehler beim Kommentieren:", error);
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, comments: (p.comments || []).filter(c => c.id !== tempId) }
          : p
      ));
      toast.error("Kommentar fehlgeschlagen");
    }
  }, [currentUser]);

  const handleReport = useCallback(async (postId) => {
    if (reportedPostIds.includes(postId)) {
      toast.info("Du hast diesen Post bereits gemeldet");
      return;
    }
    try {
      await entities.Post.update(postId, { reported: true });
      const updated = [...reportedPostIds, postId];
      setReportedPostIds(updated);
      localStorage.setItem('reported_posts', JSON.stringify(updated));
      toast.success("Post gemeldet");
    } catch (error) {
      console.error("Fehler beim Melden:", error);
      toast.error("Melden fehlgeschlagen");
    }
  }, [reportedPostIds]);

  const toggleComment = useCallback((postId) => {
    setCommenting(prev => (prev === postId ? null : postId));
  }, []);

  const handleDeletePost = useCallback(async (postId) => {
    if (!window.confirm("Post wirklich löschen?")) return;

    setDeletingPostId(postId);
    try {
      await entities.Post.delete(postId);
      toast.success("Post gelöscht");
      await loadPosts();
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setDeletingPostId(null);
    }
  }, [loadPosts]);

  const queryClient = useQueryClient();

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3 text-cyan-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Community wird geladen...</span>
          </div>
        </div>
      </PageContainer>
    );
  }

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['posts'] }),
      queryClient.invalidateQueries({ queryKey: ['competitions'] }),
      queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
    ]);
  };

  return (
    <PageContainer maxWidth="max-w-4xl" enableSwipeRefresh={true} onRefresh={handleRefresh}>
      <div className="grid gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="bb-eyebrow mb-1">Gemeinschaft</p>
            <h1 className="bb-title">Community</h1>
            <p className="bb-muted mt-1">Tausche dich mit anderen Anglern aus.</p>
          </div>
          <div className="bb-pill-success">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--bb-green)' }} />
            {activeUserCount} online
          </div>
        </header>

        {/* Tab Navigation */}
        <TabBar
          tabs={[
            { key: 'feed', label: 'Feed' },
            { key: 'waters', label: 'Gewässer' },
            { key: 'challenges', label: 'Challenges' },
            { key: 'competitions', label: 'Wettbewerbe' },
            { key: 'leaderboards', label: 'Bestenlisten' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === "feed" && (<>
        {/* Suchleiste */}
        <div className="bb-card">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Suche nach Beiträgen, Erstellern..."
              className="bg-slate-800/50 border-slate-700 text-white flex-1"
            />
            <button
              onClick={() => setShowChat(!showChat)}
              className="bb-secondary"
            >
              Chat
            </button>
          </div>
        </div>

        {/* Chat Widget */}
        {showChat && (
          <ChatWidget />
        )}

        {/* Neuer Post */}
        {currentUser && (
          <div className="bb-card space-y-4">
            <div>
              <p className="bb-eyebrow mb-2">Deine Story</p>
              <h3 className="text-lg font-semibold text-slate-100">Neuer Post</h3>
            </div>
            <Textarea
              value={newPostText}
              onChange={(e) => setNewPostText(e.target.value)}
              placeholder="Was möchtest du mit der Community teilen?"
              className="bg-slate-800/50 border-slate-700 text-white min-h-[100px]"
              disabled={uploading}
            />

            {imagePreview && (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full rounded-lg max-h-64 object-cover"
                />
                <button
                  className="absolute top-2 right-2 p-1.5 rounded-lg"
                  style={{ background: 'rgba(239,68,68,.8)', color: 'white' }}
                  onClick={() => {
                    setNewPostImage(null);
                    setImagePreview(null);
                  }}
                  disabled={uploading}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  disabled={uploading}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 bb-secondary flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  {newPostImage ? "Bild ändern" : "Bild hinzufügen"}
                </button>

                <button
                  onClick={handleCreatePost}
                  disabled={uploading || (!newPostText.trim() && !newPostImage)}
                  className="flex-1 bb-action flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Posten
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Posts Feed */}
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              userCache={userCache}
              isOwnPost={!!currentUser && post.created_by === currentUser.email}
              isCommenting={commenting === post.id}
              isDeleting={deletingPostId === post.id}
              isReported={reportedPostIds.includes(post.id)}
              onLike={handleLike}
              onToggleComment={toggleComment}
              onReport={handleReport}
              onDelete={handleDeletePost}
              onSubmitComment={handleComment}
            />
          ))}
        </div>

        {filteredPosts.length === 0 && posts.length > 0 && (
          <div className="bb-card text-center py-12">
            <p className="text-slate-400 mb-4">Keine Beiträge gefunden</p>
            <p className="text-sm text-slate-500">Versuche einen anderen Suchbegriff</p>
          </div>
        )}

        {posts.length === 0 && (
          <div className="bb-card text-center py-12">
            <p className="text-slate-400 mb-4">Noch keine Posts vorhanden</p>
            <p className="text-sm text-slate-500">Sei der Erste und teile deinen Fang</p>
          </div>
        )}
        </>)}

        {/* Gewässer-Räume Tab */}
        {activeTab === "waters" && (
          <div className="space-y-4">
            <div>
              <p className="bb-eyebrow mb-2">Gemeinschaften</p>
              <h2 className="text-xl font-semibold text-slate-100">Gewässer-Räume</h2>
            </div>
            <WaterBodyRooms />
          </div>
        )}

        {/* Challenges Tab */}
        {activeTab === "challenges" && (
          <div className="space-y-4">
            <div>
              <p className="bb-eyebrow mb-2">Gemeinschaft</p>
              <h2 className="text-xl font-semibold text-slate-100">Aktuelle Challenges</h2>
            </div>
            <div className="space-y-3">
              <CommunityChallenge
                challenge={{
                  title: 'Tagesköder identifizieren',
                  description: 'Fotografiere und identifiziere 3 verschiedene Köder aus deinem Bestand',
                  end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                  submissions: 7,
                  target: 10
                }}
                userCache={userCache}
              />
              <CommunityChallenge
                challenge={{
                  title: 'Gewässer-Tipps teilen',
                  description: 'Schreibe einen hilfreichen Tipp über dein Lieblings-Gewässer',
                  end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  submissions: 12,
                  target: 20
                }}
                userCache={userCache}
              />
              <CommunityChallenge
                challenge={{
                  title: 'Beste Montage des Monats',
                  description: 'Zeige deine innovativste Angel-Montage mit Foto und Erklärung',
                  end_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                  submissions: 5,
                  target: 15
                }}
                userCache={userCache}
              />
            </div>
          </div>
        )}

        {activeTab === "competitions" && (<PlanGuard requiredPlan="pro" featureName="Community-Wettbewerbe & Clans"><>
        <CompetitionsSection
          currentUser={currentUser}
          recentActivity={recentActivity}
          votingCompetitions={votingCompetitions}
          teamCompetitions={teamCompetitions}
          eventCompetitions={eventCompetitions}
          onCompetitionUpdated={async () => {
            await loadCompetitions();
            await loadRecentActivity();
          }}
        />

        {/* Andere Wettbewerbe */}
        {otherCompetitions.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-amber-400">Aktuelle Wettbewerbe</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {otherCompetitions.map((comp) => (
                <CompetitionCard
                  key={comp.id}
                  competition={comp}
                  currentUser={currentUser}
                  onUpdate={loadCompetitions}
                />
              ))}
            </div>
          </div>
        )}

        {competitions.length === 0 && (
          <div className="bb-card text-center py-12">
            <Trophy className="w-12 h-12 text-amber-400/40 mx-auto mb-4" />
            <p className="text-slate-300 mb-2 font-semibold">Noch keine aktiven Wettbewerbe</p>
            <p className="text-sm text-slate-500">Starte selbst einen Wettbewerb oben oder schaue später wieder vorbei</p>
          </div>
        )}
        </></PlanGuard>)}

        {activeTab === "leaderboards" && (
        <PlanGuard requiredPlan="pro" featureName="Bestenlisten">
        <div className="space-y-4">
          <div>
            <p className="bb-eyebrow mb-2">Bestenlisten</p>
            <h2 className="text-xl font-bold text-cyan-400">Top Angler</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LeaderboardCard
              type="points"
              title="Nach Punkten"
              icon={Trophy}
            />
            <LeaderboardCard
              type="catches"
              title="Nach Fängen"
              icon={Fish}
            />
            <LeaderboardCard
              type="biggest"
              title="Größter Fang"
              icon={TrendingUp}
            />
          </div>
        </div>
        </PlanGuard>
        )}

        {/* Externe Links */}
        <div className="bb-card bg-gradient-to-br from-cyan-900/10 to-blue-900/10 border-cyan-600/30">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-cyan-400">Finde uns online</h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="https://www.facebook.com/profile.php?id=61571109995877"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <button className="w-full bb-secondary flex items-center justify-center gap-2">
                <Facebook className="w-4 h-4" />
                Facebook
              </button>
            </a>
            <a
              href="https://catchgbt-q7scna.manus.space"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <button className="w-full bb-secondary flex items-center justify-center gap-2">
                <Globe className="w-4 h-4" />
                Webseite
              </button>
            </a>
          </div>
        </div>
      </div>
    </PageContainer>

  );
}