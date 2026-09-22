import React, { useState, useEffect } from 'react';
import { leaderboards, rewards } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { toast } from 'sonner';
import {
  Trophy,
  Zap,
  Gift,
  Crown,
  Medal,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

export default function MonthlyLeaderboard() {
  useFeatureTracking('monthly_leaderboard');
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRewards, setMyRewards] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimingReward, setClaimingReward] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const user = await auth.me();
      setCurrentUser(user);

      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1;

      const [boardData, rewardsData] = await Promise.all([
        leaderboards.monthly(year, month),
        rewards.myActivations()
      ]);

      setLeaderboard(boardData || []);
      setMyRewards(rewardsData || []);
    } catch (error) {
      console.error('Fehler beim Laden des Leaderboards:', error);
      toast.error('Fehler beim Laden des Leaderboards');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimReward = async (leaderboardId) => {
    try {
      setClaimingReward(leaderboardId);
      const result = await rewards.claim(leaderboardId);
      toast.success('Reward erfolgreich beansprucht! Dein Basic Plan ist aktiviert.');
      await loadData();
    } catch (error) {
      console.error('Fehler beim Beanspruchen des Rewards:', error);
      toast.error('Reward konnte nicht beansprucht werden');
    } finally {
      setClaimingReward(null);
    }
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
    if (nextMonth <= new Date()) {
      setCurrentMonth(nextMonth);
    }
  };

  const monthString = currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const canGoPrev = true;
  const canGoNext = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1) <= new Date();

  const isCurrentMonth = currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear();

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown size={20} style={{ color: '#facc15' }} />;
    if (rank === 2) return <Medal size={20} style={{ color: '#9ca3af' }} />;
    if (rank === 3) return <Medal size={20} style={{ color: '#fb923c' }} />;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="animate-spin" style={{ color: '#f59e0b' }} />
      </div>
    );
  }

  return (
    <div className="bb-page">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Trophy size={40} style={{ color: '#fbbf24' }} />
            Monatliches Leaderboard
          </h1>
          <p style={{ color: 'var(--bb-muted)' }}>
            Der Sieger jedes Monats gewinnt einen kostenlosen Basic Plan für 30 Tage!
          </p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-8">
          <button
            className="bb-secondary"
            onClick={handlePreviousMonth}
            disabled={!canGoPrev}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2 text-xl font-semibold text-white">
            <Calendar size={20} style={{ color: '#fbbf24' }} />
            {monthString}
            {isCurrentMonth && <span className="text-sm" style={{ color: '#fbbf24' }}>(Aktuell)</span>}
          </div>
          <button
            className="bb-secondary"
            onClick={handleNextMonth}
            disabled={!canGoNext}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Top 3 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {leaderboard.slice(0, 3).map((entry, index) => (
            <div
              key={entry.id}
              className="bb-card transition-all"
              style={{
                borderBottom: '4px solid',
                borderBottomColor: index === 0 ? 'rgba(234,179,8,0.5)' : index === 1 ? 'rgba(156,163,175,0.5)' : 'rgba(249,115,22,0.5)',
                background: index === 0
                  ? 'linear-gradient(to bottom right, rgba(113,63,18,0.2), rgba(120,53,15,0.2))'
                  : index === 1
                  ? 'linear-gradient(to bottom right, rgba(55,65,81,0.2), rgba(31,41,55,0.2))'
                  : 'linear-gradient(to bottom right, rgba(124,45,18,0.2), rgba(120,53,15,0.2))'
              }}
            >
              <div className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getRankIcon(entry.rank)}
                    <span className="text-lg font-bold text-white">#{entry.rank}</span>
                  </div>
                  {entry.reward_status === 'claimed' && (
                    <Check size={20} style={{ color: '#22c55e' }} />
                  )}
                </div>
                <p className="text-sm mt-1" style={{ color: '#d1d5db' }}>
                  {entry.user_id === currentUser?.email ? 'Du' : entry.user_id}
                </p>
              </div>
              <div className="grid gap-4">
                <div className="text-center">
                  <p className="text-4xl font-bold" style={{ color: '#fbbf24' }}>
                    {Math.round(entry.total_points * 100) / 100}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>Punkte</p>
                </div>
                <div className="text-xs text-center" style={{ color: 'var(--bb-muted)' }}>
                  {entry.event_count} {entry.event_count === 1 ? 'Event' : 'Events'}
                </div>
                {entry.rank === 1 && (
                  <div className="pt-2" style={{ borderTop: '1px solid var(--bb-border)' }}>
                    {entry.reward_status === 'claimed' ? (
                      <div className="rounded p-2 text-center" style={{ background: 'rgba(22,101,52,0.3)', border: '1px solid rgba(22,163,74,0.3)' }}>
                        <p className="text-xs font-semibold flex items-center justify-center gap-1" style={{ color: '#4ade80' }}>
                          <Check size={12} />
                          Reward aktiviert
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleClaimReward(entry.id)}
                        disabled={claimingReward === entry.id || entry.user_id !== currentUser?.email}
                        className="bb-action w-full text-sm py-1"
                        style={{ background: 'linear-gradient(to right, #d97706, #ea580c)' }}
                      >
                        {claimingReward === entry.id ? (
                          <>
                            <Loader2 size={12} className="mr-1 animate-spin" />
                            Wird aktiviert...
                          </>
                        ) : (
                          <>
                            <Gift size={12} className="mr-1" />
                            Reward aktivieren
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Full Leaderboard */}
        <div className="bb-card mb-8" style={{ borderColor: 'rgba(75,85,99,0.3)', background: 'linear-gradient(to bottom right, rgba(31,41,55,0.2), rgba(17,24,39,0.2))' }}>
          <div className="bb-form-title text-white flex items-center gap-2">
            <Medal size={20} style={{ color: '#fbbf24' }} />
            Vollständiges Ranking
          </div>
          <div className="grid gap-4 mt-4">
            {leaderboard.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {leaderboard.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-4 rounded-lg border transition-all"
                    style={{
                      background: entry.user_id === currentUser?.email ? 'rgba(120,53,15,0.2)' : 'rgba(55,65,81,0.2)',
                      borderColor: entry.user_id === currentUser?.email ? 'rgba(217,119,6,0.5)' : 'rgba(55,65,81,0.5)',
                    }}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-lg font-bold w-8 text-center" style={{ color: 'var(--bb-muted)' }}>
                        #{entry.rank}
                      </span>
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {entry.user_id === currentUser?.email ? 'Du' : entry.user_id}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                          {entry.event_count} {entry.event_count === 1 ? 'Event' : 'Events'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold" style={{ color: '#fbbf24' }}>
                          {Math.round(entry.total_points * 100) / 100}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>Punkte</p>
                      </div>
                      {entry.reward_status === 'claimed' && (
                        <div className="flex items-center gap-1 px-3 py-1 rounded" style={{ background: 'rgba(22,101,52,0.3)' }}>
                          <Gift size={16} style={{ color: '#4ade80' }} />
                          <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>+30 Tage</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle size={32} className="mx-auto mb-2" style={{ color: 'rgba(75,85,99,0.6)' }} />
                <p style={{ color: 'var(--bb-muted)' }}>Keine Einträge für diesen Monat</p>
              </div>
            )}
          </div>
        </div>

        {/* Active Rewards */}
        {myRewards.length > 0 && (
          <div className="bb-card" style={{ borderColor: 'rgba(22,163,74,0.3)', background: 'linear-gradient(to bottom right, rgba(20,83,45,0.1), rgba(6,78,59,0.1))' }}>
            <div className="bb-form-title flex items-center gap-2" style={{ color: '#4ade80' }}>
              <Gift size={20} />
              Deine aktiven Rewards
            </div>
            <div className="grid gap-4 mt-4">
              {myRewards.map((reward) => {
                const expiresAt = new Date(reward.expires_at);
                const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <div
                    key={reward.id}
                    className="p-4 rounded-lg flex items-center justify-between"
                    style={{ background: 'rgba(20,83,45,0.2)', border: '1px solid rgba(22,163,74,0.5)' }}
                  >
                    <div>
                      <p className="text-white font-semibold">{reward.plan_id.toUpperCase()} Plan</p>
                      <p className="text-sm flex items-center gap-1 mt-1" style={{ color: '#4ade80' }}>
                        <Clock size={16} />
                        {daysLeft} Tage verbleibend
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>{reward.duration_days}</p>
                      <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>Tage</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="bb-card mt-8" style={{ borderColor: 'rgba(37,99,235,0.3)', background: 'linear-gradient(to bottom right, rgba(30,58,138,0.1), rgba(22,78,99,0.1))' }}>
          <div className="bb-form-title flex items-center gap-2" style={{ color: '#60a5fa' }}>
            <Zap size={20} />
            Wie funktioniert das Punkte-System?
          </div>
          <div className="grid gap-3 mt-4 text-sm" style={{ color: '#d1d5db' }}>
            <p>
              <span className="font-semibold text-white">Basispunkte:</span> Jede Einreichung bringt Basispunkte (Standard: 100)
            </p>
            <p>
              <span className="font-semibold text-white">Längenboni:</span> Längere Fische bringen zusätzliche Punkte (5 Punkte pro cm)
            </p>
            <p>
              <span className="font-semibold text-white">Art-Boni:</span> Bestimmte Fischarten haben Spezial-Boni
            </p>
            <p>
              <span className="font-semibold text-white">Like-Punkte:</span> Community-Likes bringen zusätzliche Punkte
            </p>
            <p className="pt-2" style={{ borderTop: '1px solid rgba(37,99,235,0.3)' }}>
              <span className="font-semibold text-white">Platzierungs-Bonus:</span> Die Top 3 Events-Gewinner bekommen zusätzliche Punkte (500/300/100)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
