import React, { useState, useEffect } from 'react';
import { auth } from "@/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Save, Settings2, Globe } from 'lucide-react';
import { MobileSelect } from '@/components/ui/mobile-select';
import { useOptimisticMutation } from '@/lib/useOptimisticMutation';

export default function GeneralSettings() {
    const [settings, setSettings] = useState({ language: 'de', units: 'metric' });
    const [initialSettings, setInitialSettings] = useState({});

    useEffect(() => {
        (async () => {
            try {
                const user = await auth.me();
                if (user && user.settings) {
                    const currentSettings = {
                        language: user.settings.language || 'de',
                        units: user.settings.units || 'metric'
                    };
                    setSettings(currentSettings);
                    setInitialSettings(currentSettings);
                }
            } catch {
                toast.error("Fehler beim Laden der Einstellungen.");
            }
        })();
    }, []);

    const settingsMutation = useOptimisticMutation({
        mutationFn: async (newSettings) => {
            const user = await auth.me();
            await auth.updateMe({
                settings: {
                    ...user?.settings,
                    language: newSettings.language,
                    units: newSettings.units
                }
            });
            return newSettings;
        },
        optimisticUpdate: () => settings,
        onSuccess: () => {
            setInitialSettings(settings);
            toast.success("Allgemeine Einstellungen gespeichert!");
        },
        onError: () => {
            toast.error("Fehler beim Speichern der Einstellungen.");
        },
        invalidateOnSettle: false
    });

    const handleSave = () => {
        settingsMutation.mutate(settings);
    };

    const hasChanges = JSON.stringify(settings) !== JSON.stringify(initialSettings);

    return (
        <Card className="glass-morphism border-gray-800 rounded-2xl">
            <CardHeader>
                <CardTitle className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)] flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-emerald-400" />
                    Allgemein
                </CardTitle>
                <p className="text-gray-400 text-sm mt-2">
                    Grundlegende App-Einstellungen
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2 flex items-center gap-2">
                            <Globe className="w-4 h-4 text-cyan-400" />
                            Sprache
                        </label>
                        <MobileSelect
                            value={settings.language}
                            onValueChange={(value) => setSettings(prev => ({ ...prev, language: value }))}
                            label="Sprache"
                            placeholder="Sprache wählen"
                            options={[
                                { value: 'de', label: 'Deutsch' },
                                { value: 'en', label: 'Englisch' },
                            ]}
                            className="bg-gray-800/50 border-gray-700 text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2 flex items-center gap-2">
                            <Settings2 className="w-4 h-4 text-cyan-400" />
                            Einheiten
                        </label>
                        <MobileSelect
                            value={settings.units}
                            onValueChange={(value) => setSettings(prev => ({ ...prev, units: value }))}
                            label="Einheiten"
                            placeholder="Einheiten wählen"
                            options={[
                                { value: 'metric', label: 'Metrisch (cm, kg)' },
                                { value: 'imperial', label: 'Imperial (in, lbs)' },
                            ]}
                            className="bg-gray-800/50 border-gray-700 text-white"
                        />
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
                        disabled={settingsMutation.isPending || !hasChanges}
                        className="bg-cyan-600 hover:bg-cyan-700 active:scale-95"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {settingsMutation.isPending ? 'Speichert...' : 'Änderungen speichern'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}