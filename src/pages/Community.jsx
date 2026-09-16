import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import SwipeToRefresh from "@/components/utils/SwipeToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { integrations, entities, api, community } from "@/api/frontendClient";
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
      <Button onClick={submit} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
        <Send className="w-4 h-4" />
      </Button>
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
function CommunityChallenge({ challenge, userCache }) {
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
    <div>
      <Card className="glass-morphism border-gray-800">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {profilePic ? (
                <img src={profilePic} alt={displayName} className="w-10 h-10 rounded-full object-cover border-2 border-emerald-400 flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center border-2 border-emerald-400 flex-shrink-0">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white">{displayName}</p>
                  <UserBadges userEmail={post.created_by} userCache={userCache} />
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(post.created_at).toLocaleDateString('de-DE', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
            </div>

            {isOwnPost && (
              <Button
                variant="ghost" size="sm"
                onClick={() => onDelete(post.id)}
                disabled={isDeleting}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {post.text && <p className="text-gray-200 whitespace-pre-wrap">{post.text}</p>}

          {post.photo_url && (
            <img src={post.photo_url} alt="Post" className="w-full rounded-lg max-h-96 object-cover" />
          )}

          <div className="flex items-center gap-4 pt-2 border-t border-gray-800">
            <Button variant="ghost" size="sm" onClick={() => onLike(post.id, post.likes || 0)} className="text-gray-400 hover:text-red-400">
              <Heart className="w-4 h-4 mr-1" />
              {post.likes || 0}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => onToggleComment(post.id)} className="text-gray-400 hover:text-cyan-400">
              <MessageCircle className="w-4 h-4 mr-1" />
              {post.comments?.length || 0}
            </Button>

            {!isOwnPost && (
              <Button
                variant="ghost" size="sm"
                onClick={() => onReport(post.id)}
                className={`ml-auto ${isReported ? 'text-amber-400 cursor-default' : 'text-gray-400 hover:text-amber-400'}`}
                title={isReported ? 'Bereits gemeldet' : 'Post melden'}
              >
                <AlertTriangle className="w-4 h-4" />
              </Button>
            )}
          </div>

          {post.comments && post.comments.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-800">
              {post.comments.map((comment) => {
                const commentProfilePic = picOf(comment.created_by);
                const commentDisplayName = nameOf(comment.created_by);
                return (
                  <div key={comment.id} className="flex gap-2">
                    {commentProfilePic ? (
                      <img src={commentProfilePic} alt={commentDisplayName} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="flex-1 bg-gray-800/50 rounded-lg p-2">
                      <p className="text-xs font-semibold text-emerald-400 mb-1">{commentDisplayName}</p>
                      <p className="text-sm text-gray-300">{comment.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isCommenting && <CommentInput onSubmit={(text) => onSubmitComment(post.id, text)} />}
        </CardContent>
      </Card>
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullStart, setPullStart] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
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
      {pullDistance > 0 && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-50 transition-opacity"
          style={{
            height: `${pullDistance}px`,
            opacity: Math.min(pullDistance / 80, 1)
          }}
        >
          <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isRefreshing && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-cyan-600 text-white px-4 py-2 rounded-full shadow-lg">
          Aktualisiere...
        </div>
      )}

      <div className="space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="bb-eyebrow mb-2">Gemeinschaft</p>
            <h1 className="bb-title">Community</h1>
            <p className="bb-muted mt-1">Tausche dich mit anderen Anglern aus.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-sm text-slate-300">{activeUserCount} online</span>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="flex gap-2 p-1 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-x-auto">
          <button type="button"
            onClick={() => setActiveTab("feed")}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "feed"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Feed
          </button>
          <button type="button"
            onClick={() => setActiveTab("waters")}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "waters"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Droplet className="w-4 h-4" />
            Gewässer
          </button>
          <button type="button"
            onClick={() => setActiveTab("challenges")}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "challenges"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Zap className="w-4 h-4" />
            Challenges
          </button>
          <button type="button"
            onClick={() => setActiveTab("competitions")}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "competitions"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Trophy className="w-4 h-4" />
            Wettbewerbe
          </button>
          <button type="button"
            onClick={() => setActiveTab("leaderboards")}
            className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "leaderboards"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Bestenlisten
          </button>
        </div>

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
            <Button
              onClick={() => setShowChat(!showChat)}
              className="bb-secondary"
            >
              Chat
            </Button>
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
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setNewPostImage(null);
                    setImagePreview(null);
                  }}
                  disabled={uploading}
                >
                  <X className="w-4 h-4" />
                </Button>
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
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 bb-secondary"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {newPostImage ? "Bild ändern" : "Bild hinzufügen"}
                </Button>

                <Button
                  onClick={handleCreatePost}
                  disabled={uploading || (!newPostText.trim() && !newPostImage)}
                  className="flex-1 bb-action"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Posten
                    </>
                  )}
                </Button>
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