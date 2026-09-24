import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/api/frontendClient";
import { Loader2, Medal, User as UserIcon } from "lucide-react";

const VALUE_LABELS = { points: 'Punkte', catches: 'Fänge', biggest: 'cm' };

// Globale Bestenliste. Die Aggregation läuft serverseitig
// (GET /api/community/leaderboard): Der Client sieht nur die eigenen Fänge
// und könnte keine echte Rangliste bilden. Angezeigt werden öffentliche
// Profile (Name, Avatar) — keine E-Mail-Adressen.
export default function LeaderboardCard({ type, title, icon: Icon }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await api.get(`/api/community/leaderboard?type=${encodeURIComponent(type)}`);
      setLeaderboard(Array.isArray(result?.entries) ? result.entries : []);
    } catch (error) {
      console.error("Fehler beim Laden des Leaderboards:", error);
      setLeaderboard([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const getMedalColor = (rank) => {
    if (rank === 0) return "text-amber-400";
    if (rank === 1) return "text-gray-400";
    if (rank === 2) return "text-orange-400";
    return "text-gray-600";
  };

  if (loading) {
    return (
      <Card className="glass-morphism border-gray-800 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-cyan-400" />}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-morphism border-gray-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-cyan-400" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loadError ? (
          <div className="text-center py-8 text-gray-500">
            Bestenliste konnte nicht geladen werden.
            <button type="button" className="bb-secondary mt-3 mx-auto" onClick={loadLeaderboard}>Erneut versuchen</button>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Noch keine Daten verfuegbar
          </div>
        ) : (
          leaderboard.map((entry, idx) => {
            const profilePic = entry.user?.avatar_url || null;
            const displayName = entry.is_me ? 'Du' : (entry.user?.name || 'Angler');
            
            return (
              <div
                key={entry.user?.id || `rank-${entry.rank ?? idx}`}
                className="flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  {idx < 3 ? (
                    <Medal className={`w-5 h-5 ${getMedalColor(idx)}`} />
                  ) : (
                    <span className="text-gray-500 text-sm font-semibold w-5 text-center">
                      {idx + 1}
                    </span>
                  )}
                  
                  {profilePic ? (
                    <img
                      src={profilePic}
                      alt={displayName}
                      className="w-8 h-8 rounded-full object-cover border border-emerald-400"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <span className="text-white text-sm font-medium flex-1 truncate">
                    {displayName}
                  </span>
                </div>
                
                <div className="text-right">
                  <span className="text-cyan-400 font-bold text-lg">
                    {entry.value}
                  </span>
                  <span className="text-gray-500 text-xs ml-1">
                    {VALUE_LABELS[type]}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}