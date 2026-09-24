import React, { useState, useEffect } from 'react';
import { auth } from "@/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Save, Newspaper } from 'lucide-react';
import { useOptimisticMutation } from '@/lib/useOptimisticMutation';

export default function TickerSettings() {
    const [speed, setSpeed] = useState(100);
    const [initialSpeed, setInitialSpeed] = useState(100);

    useEffect(() => {
        (async () => {
            try {
                const user = await auth.me();
                if (user && user.settings && user.settings.ticker_speed) {
                    setSpeed(user.settings.ticker_speed);
                    setInitialSpeed(user.settings.ticker_speed);
                }
            } catch {
                toast.error("Fehler beim Laden der Ticker-Einstellungen.");
            }
        })();
    }, []);

    const tickerMutation = useOptimisticMutation({
        mutationFn: async (newSpeed) => {
            const user = await auth.me();
            await auth.updateMe({
                settings: {
                    ...user?.settings,
                    ticker_speed: newSpeed
                }
            });
            return newSpeed;
        },
        optimisticUpdate: () => speed,
        onSuccess: () => {
            setInitialSpeed(speed);
            toast.success("Ticker-Einstellungen gespeichert!");
            window.dispatchEvent(new CustomEvent('tickerSettingsChanged', { detail: { speed } }));
        },
        onError: () => {
            toast.error("Fehler beim Speichern der Ticker-Einstellungen.");
        },
        invalidateOnSettle: false
    });

    const handleSave = () => {
        tickerMutation.mutate(speed);
    };

    const hasChanges = speed !== initialSpeed;

    return (
        <Card className="glass-morphism border-gray-800 rounded-2xl">
            <CardHeader>
                <CardTitle className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)] flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-emerald-400" />
                    Nachrichten-Ticker
                </CardTitle>
                <p className="text-gray-400 text-sm mt-2">
                    Passe die Geschwindigkeit des News-Tickers an
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label htmlFor="ticker-speed" className="text-sm font-medium text-gray-300">
                            Scroll-Geschwindigkeit
                        </label>
                        <span className="text-sm text-cyan-400 font-semibold">{speed}%</span>
                    </div>
                    <input
                        id="ticker-speed"
                        type="range"
                        min="25"
                        max="200"
                        step="5"
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>25% (Langsam)</span>
                        <span>200% (Schnell)</span>
                    </div>
                </div>

                {hasChanges && (
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300">
                        <span className="ml-2">Du hast ungespeicherte Änderungen</span>
                    </div>
                )}

                <div className="flex justify-end pt-4">
                    <Button
                        onClick={handleSave}
                        disabled={tickerMutation.isPending || !hasChanges}
                        className="bg-cyan-600 hover:bg-cyan-700 active:scale-95"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {tickerMutation.isPending ? 'Speichert...' : 'Änderungen speichern'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}