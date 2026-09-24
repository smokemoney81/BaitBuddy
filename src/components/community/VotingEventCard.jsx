import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Trophy, Award } from 'lucide-react';
import { toast } from 'sonner';
import { functions } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { Catch } from "@/entities/Catch";

export default function VotingEventCard({ competition, currentUser }) {
  const [submissions, setSubmissions] = useState([]);
  const [userLikes, setUserLikes] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubmissions();
  }, [competition.id]);

  const loadSubmissions = async () => {
    try {
      const response = await functions.invoke('getVotingLeaderboard', {
        competition_id: competition.id
      });
      
      setSubmissions(response.leaderboard || []);
      
      // Nur die eigenen Likes markieren — die Liste enthält alle Likes, der
      // Server kennzeichnet eigene Zeilen mit is_own.
      const likes = await entities.VotingLike.list();
      setUserLikes(new Set(likes.filter(l => l.is_own).map(l => l.submission_id)));
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (submissionId) => {
    try {
      await functions.invoke('addVotingLike', {
        submission_id: submissionId,
        competition_id: competition.id
      });
      
      toast.success('Like abgegeben');
      await loadSubmissions();
    } catch (error) {
      toast.error(error.message || 'Fehler beim Liken');
    }
  };

  const handleSubmitCatch = async () => {
    const catches = await Catch.filter({ created_by: currentUser.email });
    
    if (catches.length === 0) {
      toast.error('Du hast noch keine Faenge im Logbuch');
      return;
    }
    
    toast.info('Waehle einen Fang aus deinem Logbuch zum Einreichen');
  };

  return (
    <Card className="glass-morphism border-purple-600/30 bg-gradient-to-br from-purple-900/10 to-pink-900/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-purple-400 drop-shadow-[0_0_12px_rgba(192,132,252,0.7)] flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            {competition.title}
          </CardTitle>
          <Button 
            size="sm" 
            className="bg-gradient-to-r from-purple-600 to-pink-600"
            onClick={handleSubmitCatch}
          >
            Fang einreichen
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-gray-300 text-sm">{competition.description}</p>
        
        {loading ? (
          <p className="text-gray-400 text-center py-4">Lade Einreichungen...</p>
        ) : submissions.length === 0 ? (
          <p className="text-gray-400 text-center py-4">Noch keine Einreichungen</p>
        ) : (
          <div className="space-y-3">
            {submissions.slice(0, 5).map((sub) => (
              <div 
                key={sub.submission_id}
                className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
              >
                <div className="text-purple-400 font-bold text-lg w-8">#{sub.rank}</div>
                
                {sub.photo_url && (
                  <img 
                    src={sub.photo_url} 
                    alt={sub.species}
                    className="w-16 h-16 rounded object-cover"
                  />
                )}
                
                <div className="flex-1">
                  <p className="text-white font-semibold">{sub.species}</p>
                  <p className="text-gray-400 text-xs">{sub.length_cm} cm</p>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="text-pink-400 flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {sub.community_likes}
                    </span>
                    {sub.ai_score != null && (
                      <span className="text-cyan-400 flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        KI: {sub.ai_score}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-amber-400 font-bold text-lg">{sub.total_score}</p>
                  <Button
                    size="sm"
                    variant={userLikes.has(sub.submission_id) ? "outline" : "default"}
                    disabled={userLikes.has(sub.submission_id)}
                    onClick={() => handleLike(sub.submission_id)}
                    className="mt-1"
                  >
                    <Heart className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}