import React, { useState, useEffect } from 'react';
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { Star, Users } from 'lucide-react';
import { toast } from 'sonner';
import PageTitle from "@/components/layout/PageTitle";

export default function FunctionRatings() {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const user = await auth.me();

      if (user?.is_admin !== true) {
        setIsAdmin(false);
        toast.error('Nur Admins können Bewertungen einsehen');
        return;
      }

      setIsAdmin(true);
      const allRatings = await entities.FunctionRating.list();
      setRatings(allRatings);
    } catch (error) {
      console.error('Fehler beim Laden der Bewertungen:', error);
      toast.error('Bewertungen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const groupedByFunction = ratings.reduce((acc, rating) => {
      if (!acc[rating.function_name]) {
        acc[rating.function_name] = [];
      }
      acc[rating.function_name].push(rating);
      return acc;
    }, {});

    return Object.entries(groupedByFunction).map(([functionName, functionRatings]) => {
      const avgRating = functionRatings.reduce((sum, r) => sum + r.rating, 0) / functionRatings.length;
      return {
        functionName,
        avgRating: avgRating.toFixed(1),
        count: functionRatings.length,
        ratings: functionRatings.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      };
    }).sort((a, b) => b.count - a.count);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center" style={{ color: 'var(--bb-muted)' }}>Lade Bewertungen...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <div className="bb-card">
          <div className="pt-6 text-center">
            <p style={{ color: 'var(--bb-muted)' }}>Zugriff verweigert. Nur Admins können diese Seite sehen.</p>
          </div>
        </div>
      </div>
    );
  }

  const stats = calculateStats();

  return (
    <div className="container mx-auto px-4 pb-32 space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle className="flex-1 min-w-0" title="Funktions-Bewertungen" />
        <span className="bb-pill-info" style={{ background: 'transparent', border: '1px solid var(--bb-border)', color: '#d1d5db', fontSize: '0.75rem' }}>
          <Users size={16} className="mr-2" />
          {ratings.length} Bewertungen
        </span>
      </div>

      <div className="grid gap-6">
        {stats.map((stat) => (
          <div key={stat.functionName} className="bb-card">
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold text-slate-50">{stat.functionName}</div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Star size={20} className="fill-amber-400 text-amber-400" />
                  <span className="text-lg font-bold text-slate-50">{stat.avgRating}</span>
                </div>
                <span className="bb-pill-info" style={{ background: 'var(--bb-surface)', color: 'var(--bb-muted)', fontSize: '0.75rem' }}>
                  {stat.count} Bewertung{stat.count !== 1 ? 'en' : ''}
                </span>
              </div>
            </div>
            <div className="grid gap-3 mt-4">
              {stat.ratings.map((rating) => (
                <div
                  key={rating.id}
                  className="p-4 rounded-lg"
                  style={{ background: 'var(--bb-bg)', border: '1px solid var(--bb-border)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={
                              star <= rating.rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-gray-600'
                            }
                          />
                        ))}
                      </div>
                      <span className="text-sm" style={{ color: 'var(--bb-muted)' }}>{rating.user_email}</span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                      {new Date(rating.created_date).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {rating.comment && (
                    <p className="text-sm mt-2" style={{ color: '#d1d5db' }}>{rating.comment}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {stats.length === 0 && (
        <div className="bb-card">
          <div className="pt-6 text-center">
            <p style={{ color: 'var(--bb-muted)' }}>Noch keine Bewertungen vorhanden</p>
          </div>
        </div>
      )}
    </div>
  );
}
