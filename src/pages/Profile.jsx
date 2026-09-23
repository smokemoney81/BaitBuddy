import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { functions } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { UploadFile } from '@/integrations/Core';
import { Camera, Copy, Check, Edit3, Calendar, Clock, MessageSquare, Crown, Link as LinkIcon, Mail, AlertTriangle } from 'lucide-react';
import { toast } from "sonner";
import RatingWidget from "@/components/feedback/RatingWidget";
import { useOptimisticMutation } from "@/lib/useOptimisticMutation";
import DeleteAccountDialog from "@/components/settings/DeleteAccountDialog";
import { Trash2 } from "lucide-react";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

export default function ProfilePage() {
   useFeatureTracking('profil');
   const navigate = useNavigate();
   const [user, setUser] = useState(null);
   const [isLoading, setIsLoading] = useState(true);
   const [isEditing, setIsEditing] = useState(false);
   const [nickname, setNickname] = useState('');
   const [isUploading, setIsUploading] = useState(false);
   const [isSaving, setIsSaving] = useState(false);
   const [copiedReferral, setCopiedReferral] = useState(false);
   const [postsCount, setPostsCount] = useState(0);
   const [currentPlan, setCurrentPlan] = useState(null);
   const [chatHistory, setChatHistory] = useState([]);
   const [loadingHistory, setLoadingHistory] = useState(false);
   const [expandedConversation, setExpandedConversation] = useState(null);
   const [navigationAnnouncement, setNavigationAnnouncement] = useState('');

  const loadUserProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
      setNickname(currentUser.nickname || '');
      
      // Generiere Referral-Code falls nicht vorhanden
      if (!currentUser.referral_code) {
        const code = generateReferralCode();
        await auth.updateMe({ referral_code: code });
        const updatedUser = await auth.me();
        setUser(updatedUser);
      }

      // Lade Posts-Anzahl
      try {
        const posts = await entities.Post.filter({ created_by: currentUser.email });
        setPostsCount((posts && Array.isArray(posts)) ? posts.length : 0);
      } catch (error) {
        console.error('Fehler beim Laden der Posts:', error);
        setPostsCount(0);
      }

      // Lade Plan-Status
      try {
        const planResponse = await functions.invoke('getPlanStatus');
        const planPayload = planResponse?.data ?? planResponse;
        if (planPayload?.plan) {
          setCurrentPlan(planPayload.plan);
        }
      } catch (error) {
        console.error('Fehler beim Laden des Plans:', error);
        setCurrentPlan(null);
      }

      // Lade Chat-Historie (letzte 5 Konversationen)
      try {
        const messages = await entities.ChatMessage.list('-created_date', 100);

        // P2.4: Null-check für messages (könnte null sein)
        if (!messages || !Array.isArray(messages)) {
          setChatHistory([]);
        } else {
          // Gruppiere nach conversation_id
          const groupedConversations = {};
          messages.forEach(msg => {
            if (!groupedConversations[msg.conversation_id]) {
              groupedConversations[msg.conversation_id] = [];
            }
            groupedConversations[msg.conversation_id].push(msg);
          });

          // Konvertiere zu Array und sortiere
          const conversations = Object.entries(groupedConversations).map(([id, msgs]) => ({
            id,
            messages: msgs.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime()),
            lastMessage: msgs.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime())[msgs.length - 1],
            messageCount: msgs.length
          })).sort((a, b) => new Date(b.lastMessage.created_date).getTime() - new Date(a.lastMessage.created_date).getTime());

          setChatHistory(conversations.slice(0, 5));
        }
      } catch (error) {
        console.error('Fehler beim Laden der Chat-Historie:', error);
        setChatHistory([]);
      }

    } catch (error) {
      toast.error('Profil konnte nicht geladen werden.');
      console.error('Error loading profile:', error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Datei zu groß. Maximal 5MB erlaubt.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Nur Bilder sind erlaubt.');
      return;
    }

    setIsUploading(true);
    try {
      const response = await UploadFile({ file });
      const imageUrl = response.file_url;
      
      await auth.updateMe({ profile_picture_url: imageUrl });
      setUser(prev => ({ ...prev, profile_picture_url: imageUrl }));
      toast.success('Profilbild erfolgreich aktualisiert!');
    } catch (error) {
      toast.error('Fehler beim Hochladen des Bildes.');
      console.error('Upload error:', error);
    }
    setIsUploading(false);
  };

  const saveProfileMutation = useOptimisticMutation({
    mutationFn: async (data) => {
      const updatedUser = await auth.updateMe(data);
      return updatedUser;
    },
    optimisticUpdate: (oldUser, newData) => ({
      ...oldUser,
      ...newData
    }),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setIsEditing(false);
      toast.success('Profil erfolgreich aktualisiert!');
    },
    onError: () => {
      toast.error('Fehler beim Speichern des Profils.');
    },
    invalidateOnSettle: false
  });

  const handleSaveProfile = async () => {
    if (!nickname.trim()) {
      toast.error('Nickname darf nicht leer sein.');
      return;
    }
    saveProfileMutation.mutate({ nickname: nickname.trim() });
  };

  const copyReferralLink = async () => {
    if (!user?.referral_code) return;
    
    const referralLink = `${window.location.origin}?ref=${user.referral_code}`;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedReferral(true);
      toast.success('Einladungslink kopiert!');
      setTimeout(() => setCopiedReferral(false), 2000);
    } catch (error) {
      toast.error('Kopieren fehlgeschlagen.');
    }
  };

  const handleCancelSubscription = () => {
    toast.info('Abo-Kündigung', {
      description: 'Bitte kontaktiere den Support, um dein Abo zu kündigen.',
      duration: 5000
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unbekannt';
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Nie';
    return new Date(dateString).toLocaleString('de-DE', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <div className="text-center py-12">
          <div className="animate-pulse text-gray-400">Profil wird geladen...</div>
        </div>
      </div>
    );
  }

  const planBadgeColor = {
    free: 'bg-gray-600',
    basic: 'bg-blue-600',
    pro: 'bg-purple-600',
    ultimate: 'bg-amber-600'
  }[currentPlan?.id || 'free'] || 'bg-gray-600';

  const planColors = {
    free: '#4b5563', basic: '#3b82f6', pro: '#8b5cf6', ultimate: '#d97706',
  };
  const planColor = planColors[currentPlan?.id] || planColors.free;

  return (
    <div className="bb-page">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {navigationAnnouncement}
      </div>

      <div className="bb-card" style={{ padding: '28px' }}>
        <div className="flex flex-col items-center gap-6" style={{ textAlign: 'center' }}>
          <div className="relative shrink-0">
            <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'var(--bb-surface)', border: '3px solid var(--bb-cyan)' }}>
              <img
                src={user?.profile_picture_url || '/avatars/default-avatar.png'}
                alt="Profilbild"
                className="w-full h-full object-cover"
              />
            </div>
            <label className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer" style={{ background: 'var(--bb-cyan)', color: '#080F16' }}>
              <Camera size={16} />
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
            </label>
            {isUploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: 'var(--bb-cyan)', borderTopColor: 'transparent' }} />
              </div>
            )}
          </div>

          <div className="grid gap-2 w-full">
            {isEditing ? (
              <div className="grid gap-3">
                <Label style={{ color: 'var(--bb-text-secondary)' }}>Nickname</Label>
                <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Dein Nickname" className="bg-black/25 border-white/10 text-white" />
                <div className="flex gap-2 justify-center">
                  <button onClick={handleSaveProfile} disabled={isSaving} className="bb-action">
                    {isSaving ? 'Speichern...' : 'Speichern'}
                  </button>
                  <button className="bb-secondary" onClick={() => { setIsEditing(false); setNickname(user?.nickname || ''); }}>
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 justify-center">
                  <h2 className="text-2xl font-bold text-white">{user?.nickname || 'Unbenannt'}</h2>
                  <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg" style={{ color: 'var(--bb-muted)' }}>
                    <Edit3 size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2 justify-center" style={{ color: 'var(--bb-muted)' }}>
                  <Mail size={14} />
                  <span className="text-sm">{user?.email}</span>
                </div>
                <div className="flex justify-center mt-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: planColor }}>
                    <Crown size={12} />
                    {currentPlan?.name || 'Free'} Plan
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="bb-card">
          <div className="bb-form-title mb-4">Mitgliedschaft</div>
          <div className="grid gap-3">
            {[
              { icon: Calendar, label: 'Mitglied seit', value: formatDate(user?.created_date) },
              { icon: Clock, label: 'Letzte Aktivität', value: formatDateTime(user?.last_active) },
              { icon: MessageSquare, label: 'Beiträge', value: postsCount },
            ].map(({ icon: I, label, value }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'rgba(0,0,0,.25)' }}>
                <div className="flex items-center gap-2" style={{ color: 'var(--bb-muted)' }}>
                  <I size={16} />
                  <span className="text-sm">{label}</span>
                </div>
                <span className="text-white font-medium text-sm">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bb-card">
          <div className="flex items-center gap-2 mb-4">
            <Crown size={18} style={{ color: 'var(--bb-cyan)' }} />
            <span className="bb-form-title">Premium Plan</span>
          </div>
          {currentPlan ? (
            <div className="grid gap-4">
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(0,229,255,.08), rgba(0,255,157,.08))', border: '1px solid rgba(0,229,255,.2)' }}>
                <div className="text-xl font-bold text-white mb-1">{currentPlan.name}</div>
                <div className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                  {currentPlan.price_eur > 0 ? `${currentPlan.price_eur}€ / Monat` : 'Kostenlos'}
                </div>
              </div>
              {currentPlan.id !== 'free' && currentPlan.expires_at && (
                <>
                  <div className="grid gap-2">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--bb-muted)' }}>Läuft ab am</span>
                      <span className="text-white font-medium">{formatDate(currentPlan.expires_at)}</span>
                    </div>
                    {currentPlan.remaining_days !== null && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--bb-muted)' }}>Verbleibende Tage</span>
                        <span className="font-medium" style={{ color: currentPlan.remaining_days < 7 ? '#f87171' : '#34d399' }}>
                          {currentPlan.remaining_days} Tage
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ height: 1, background: 'var(--bb-border)' }} />
                  <button onClick={handleCancelSubscription} className="bb-secondary w-full flex items-center justify-center gap-2" style={{ borderColor: 'rgba(239,68,68,.4)', color: '#f87171' }}>
                    <AlertTriangle size={16} />
                    Abo kündigen
                  </button>
                </>
              )}
              {currentPlan.id === 'free' && (
                <div className="text-center py-2">
                  <p className="text-sm mb-3" style={{ color: 'var(--bb-muted)' }}>Upgrade für Premium-Features!</p>
                  <button className="bb-action flex items-center justify-center gap-2 w-full" onClick={() => { setNavigationAnnouncement('Navigiere zu Premium-Plaenen'); navigate('/PremiumPlans'); }}>
                    <Crown size={16} />
                    Jetzt upgraden
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8" style={{ color: 'var(--bb-muted)' }}>Plan-Daten werden geladen...</div>
          )}
        </div>
      </div>

      <div className="bb-card">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={18} style={{ color: 'var(--bb-cyan)' }} />
          <span className="bb-form-title">Meine Chat-Verläufe</span>
        </div>
        {chatHistory.length > 0 ? (
          <div className="grid gap-3">
            {chatHistory.map((conv) => (
              <div key={conv.id} className="grid gap-2">
                <div
                  className="p-4 rounded-xl cursor-pointer transition-colors"
                  style={{ background: 'rgba(0,0,0,.25)', border: '1px solid var(--bb-border)' }}
                  onClick={() => setExpandedConversation(expandedConversation === conv.id ? null : conv.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm mb-1" style={{ color: 'var(--bb-muted)' }}>{formatDateTime(conv.lastMessage.created_date)}</div>
                      <div className="text-white text-sm line-clamp-2">
                        {conv.lastMessage.content ? conv.lastMessage.content.substring(0, 100) + (conv.lastMessage.content.length > 100 ? '...' : '') : ''}
                      </div>
                    </div>
                    <span className="bb-pill-info shrink-0 ml-2">{conv.messageCount} Nachrichten</span>
                  </div>
                  {conv.lastMessage.context && conv.lastMessage.context !== 'general' && (
                    <div className="text-xs mt-2" style={{ color: 'var(--bb-muted)' }}>Kontext: {conv.lastMessage.context}</div>
                  )}
                </div>
                {expandedConversation === conv.id && (
                  <div className="ml-4 p-4 rounded-xl grid gap-3 max-h-96 overflow-y-auto" style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--bb-border)' }}>
                    {conv.messages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[80%] rounded-xl px-3 py-2 text-sm" style={{ background: msg.role === 'user' ? 'var(--bb-cyan)' : 'var(--bb-surface)', color: msg.role === 'user' ? '#080F16' : 'var(--bb-text-secondary)' }}>
                          <div className="text-xs opacity-70 mb-1">
                            {new Date(msg.created_date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="text-center text-xs pt-2" style={{ color: 'var(--bb-muted)' }}>Deine letzten 5 Konversationen mit dem KI-Buddy</div>
          </div>
        ) : (
          <div className="text-center py-8" style={{ color: 'var(--bb-muted)' }}>
            <MessageSquare size={40} className="mx-auto mb-3 opacity-50" />
            <p>Noch keine Chat-Verläufe vorhanden</p>
            <p className="text-sm mt-2">Starte eine Unterhaltung mit dem KI-Buddy!</p>
          </div>
        )}
      </div>

      <div className="bb-card" style={{ borderColor: 'rgba(16,185,129,.3)' }}>
        <div className="flex items-center gap-2 mb-4">
          <LinkIcon size={18} style={{ color: '#34d399' }} />
          <span className="text-lg font-bold" style={{ color: '#34d399' }}>Freunde einladen</span>
        </div>
        <div className="grid gap-4">
          <div className="p-4 rounded-xl" style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Crown size={18} style={{ color: '#fbbf24' }} />
              <span className="text-white font-semibold">Premium Bonus!</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--bb-text-secondary)' }}>
              Lade Freunde ein und erhalte <span style={{ color: '#34d399', fontWeight: 700 }}>1 Woche Premium</span> für jeden Freund, der sich registriert!
            </p>
          </div>
          <div>
            <Label style={{ color: 'var(--bb-text-secondary)' }} className="mb-2 block text-sm">Dein Einladungslink</Label>
            <div className="flex gap-2">
              <Input value={`${window.location.origin}?ref=${user?.referral_code || ''}`} readOnly className="bg-black/25 border-white/10 text-white font-mono text-sm flex-1" />
              <button onClick={copyReferralLink} className="bb-secondary shrink-0 px-3" style={copiedReferral ? { color: '#34d399', borderColor: '#34d399' } : {}}>
                {copiedReferral ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <div className="text-xs grid gap-1" style={{ color: 'var(--bb-muted)' }}>
            <p>Teile diesen Link mit deinen Freunden über WhatsApp, E-Mail oder Social Media</p>
            <p>Dein Premium wird automatisch verlängert, sobald sie sich registrieren</p>
          </div>
        </div>
      </div>

      <div className="bb-card">
        <div className="bb-form-title mb-4">Feedback geben</div>
        <RatingWidget functionName="Profile" onComplete={() => {}} />
      </div>

      <div className="bb-card" style={{ borderColor: 'rgba(239,68,68,.3)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Trash2 size={18} style={{ color: '#f87171' }} />
          <span className="text-lg font-bold" style={{ color: '#f87171' }}>Gefahrenzone</span>
        </div>
        <div className="grid gap-4">
          <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)' }}>
            <p className="text-sm" style={{ color: 'var(--bb-text-secondary)' }}>
              Das Löschen deines Accounts ist permanent und kann nicht rückgängig gemacht werden. Alle deine Daten werden gelöscht.
            </p>
          </div>
          <DeleteAccountDialog />
        </div>
      </div>
    </div>
  );
}