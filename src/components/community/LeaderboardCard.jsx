import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { entities } from "@/api/frontendClient";
import { Catch } from "@/entities/Catch";
import { User } from "@/entities/User";
import { Loader2, Medal, User as UserIcon } from "lucide-react";

export default function LeaderboardCard({ type, title, icon: Icon }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userCache, setUserCache] = useState({});

  useEffect(() => {
    loadLeaderboard();
  }, [type]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      let data = [];
      
      if (type === 'points') {
        const entries = await entities.LeaderboardEntry.filter({ period: 'all_time' });
        data = entries
          .sort((a, b) => b.points - a.points)
          .slice(0, 10)
          .map(entry => ({
            user_id: entry.user_id,
            value: entry.points,
            label: 'Punkte'
          }));
      } else if (type === 'catches') {
        const catches = await Catch.list('', 1000);
        const userCatches = {};
        
        catches.forEach(c => {
          if (!userCatches[c.created_by]) {
            userCatches[c.created_by] = 0;
          }
          userCatches[c.created_by]++;
        });
        
        data = Object.entries(userCatches)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([user_id, count]) => ({
            user_id,
            value: count,
            label: 'Faenge'
          }));
      } else if (type === 'biggest') {
        const catches = await Catch.filter({ length_cm: { $gt: 0 } });
        const userBiggest = {};
        
        catches.forEach(c => {
          if (!userBiggest[c.created_by] || c.length_cm > userBiggest[c.created_by]) {
            userBiggest[c.created_by] = c.length_cm;
          }
        });
        
        data = Object.entries(userBiggest)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([user_id, size]) => ({
            user_id,
            value: size,
            label: 'cm'
          }));
      }

      const allEmails = [...new Set(data.map(d => d.user_id))];
      const newCache = {};

      try {
        const allUsers = await User.list('', 1000);
        allEmails.forEach(email => {
          const foundUser = allUsers.find(u => u.email === email);
          newCache[email] = foundUser ?? {
            email,
            full_name: null,
            profile_picture_url: null
          };
        });
      } catch {
        allEmails.forEach(email => {
          newCache[email] = {
            email,
            full_name: null,
            profile_picture_url: null
          };
        });
      }

      setUserCache(newCache);
      setLeaderboard(data);
    } catch (error) {
      console.error("Fehler beim Laden des Leaderboards:", error);
    } finally {
      setLoading(false);
    }
  };

  const getUserDisplayName = (email) => {
    if (!email) return "Unbekannt";
    
    const user = userCache[email];
    if (!user) {
      const emailUsername = email.split('@')[0];
      return emailUsername || "Unbekannt";
    }
    
    if (user.full_name && user.full_name.trim() !== '') {
      return user.full_name.trim();
    }
    
    const emailUsername = email.split('@')[0];
    return emailUsername || "Angler";
  };

  const getUserProfilePicture = (email) => {
    const user = userCache[email];
    if (!user) return null;
    return user.profile_picture_url || null;
  };

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
        {leaderboard.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Noch keine Daten verfuegbar
          </div>
        ) : (
          leaderboard.map((entry, idx) => {
            const profilePic = getUserProfilePicture(entry.user_id);
            const displayName = getUserDisplayName(entry.user_id);
            
            return (
              <div
                key={idx}
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
                    {entry.label}
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