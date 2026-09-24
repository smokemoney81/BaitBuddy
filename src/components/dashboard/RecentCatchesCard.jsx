import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function RecentCatchesCard({ catches, lastCatch: _lastCatch }) {
    const recentCatches = catches?.slice(0, 3) || [];

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
    };

    return (
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm hover:border-emerald-500/30 transition-all">
            <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-emerald-400">Letzte Fänge</h3>
                    <Link to={createPageUrl('Logbook')}>
                        <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300">
                            Alle anzeigen
                        </Button>
                    </Link>
                </div>

                {recentCatches.length > 0 ? (
                    <div className="space-y-3">
                        {recentCatches.map((catchItem) => (
                            <div
                                key={catchItem.id}
                                className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3 border border-gray-700 hover:border-emerald-500/30 transition-all"
                            >
                                {catchItem.photo_url ? (
                                    <img
                                        src={catchItem.photo_url}
                                        alt={catchItem.species}
                                        className="w-16 h-16 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-lg bg-gray-700/50 flex items-center justify-center">
                                        <span className="text-gray-500 text-xs">Kein Bild</span>
                                    </div>
                                )}
                                
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-white font-semibold text-sm truncate">
                                        {catchItem.species}
                                    </h4>
                                    <div className="flex gap-2 text-xs text-gray-400 mt-1">
                                        {catchItem.length_cm && (
                                            <span>{catchItem.length_cm} cm</span>
                                        )}
                                        {catchItem.weight_kg && (
                                            <span>{catchItem.weight_kg} kg</span>
                                        )}
                                    </div>
                                </div>
                                
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                    {formatDate(catchItem.catch_time)}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-gray-400 mb-4">Noch keine Fänge eingetragen</p>
                        <Link to={createPageUrl('Logbook')}>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                Ersten Fang eintragen
                            </Button>
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}