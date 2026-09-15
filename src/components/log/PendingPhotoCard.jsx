import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, Loader2, Camera, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { functions } from "@/api/frontendClient";
import { Catch } from "@/entities/Catch";
import { format } from 'date-fns';
import { useAITTS } from '@/hooks/useAITTS';

export default function PendingPhotoCard({ photo, spots, findNearestSpot, onAnalyzed, onDeleted }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [nearestSpot, setNearestSpot] = useState(null);
    const { speak } = useAITTS();

    useEffect(() => {
        // Prüfe ob GPS-Daten vorhanden sind und finde nächsten Spot
        if (photo.gps_lat && photo.gps_lon && findNearestSpot) {
            const nearest = findNearestSpot(photo.gps_lat, photo.gps_lon);
            if (nearest) {
                setNearestSpot(nearest);
                console.log(`Nächster Spot gefunden: ${nearest.name} (${nearest.distance.toFixed(2)} km entfernt)`);
            }
        }
    }, [photo, spots, findNearestSpot]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        
        try {
            toast.info('Analysiere Foto mit KI...');
            
            // KI-Analyse durchführen
            const response = await functions.invoke('analyzeCatchPhoto', {
                file_url: photo.photo_url
            });

            if (response.data && response.data.result_data) {
                const aiData = response.data.result_data;

                // Ohne erkannte Art keinen Fang anlegen: ein Datensatz mit leerer
                // Fischart fehlt spaeter in Fangliste, Artenstatistik und
                // KI-Kontext. Das Foto bleibt erhalten, damit der Fang von Hand
                // nachgetragen werden kann.
                const species = (aiData.species_name || '').trim();
                if (!species) {
                    toast.warning('Keine Fischart erkannt', {
                        description: 'Bitte trage den Fang von Hand ein — das Foto bleibt gespeichert.',
                        duration: 6000,
                    });
                    return;
                }

                // Catch-Objekt erstellen - mit automatischem Spot!
                const catchData = {
                    photo_url: photo.photo_url,
                    species,
                    length_cm: aiData.length_cm || null,
                    weight_kg: aiData.weight_kg || null,
                    catch_time: photo.captured_at || new Date().toISOString(),
                    notes: `KI-Analyse: ${aiData.visual_details || 'Keine Details'}${nearestSpot ? `\nAutomatisch zugewiesen: ${nearestSpot.name}` : ''}`,
                    spot_id: nearestSpot ? nearestSpot.id : null, // Automatischer Spot!
                    ai_analysis: aiData,
                    points_earned: aiData.length_cm ? (1 + Math.floor(aiData.length_cm / 10)) : 1
                };

                // Catch speichern
                await Catch.create(catchData);

                const successMessage = nearestSpot
                    ? `${species} • ${aiData.length_cm ? Math.round(aiData.length_cm) + ' cm' : 'Länge unbekannt'} • ${nearestSpot.name}`
                    : `${species} • ${aiData.length_cm ? Math.round(aiData.length_cm) + ' cm' : 'Länge unbekannt'}`;

                toast.success('Fang gespeichert!', {
                    description: successMessage,
                    duration: 5000
                });

                const spokenText = `Fang erkannt: ${species}.${aiData.length_cm ? ` Laenge etwa ${Math.round(aiData.length_cm)} Zentimeter.` : ''}${aiData.weight_kg ? ` Gewicht etwa ${aiData.weight_kg} Kilogramm.` : ''}${nearestSpot ? ` Spot ${nearestSpot.name} zugewiesen.` : ''} ${aiData.visual_details || ''}`;
                speak(spokenText);

                onAnalyzed(photo.id, nearestSpot);
            } else {
                throw new Error('Keine Analysedaten erhalten');
            }
        } catch (error) {
            console.error('Analysis error:', error);
            toast.error('Fehler bei der Analyse', {
                description: 'Bitte versuche es erneut'
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDelete = () => {
        if (confirm('Möchtest du dieses Foto wirklich löschen?')) {
            onDeleted(photo.id);
            toast.info('Foto gelöscht');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
        >
            <Card className="glass-morphism border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 overflow-hidden">
                <CardContent className="p-4">
                    <div className="flex gap-4">
                        {/* Foto Preview */}
                        <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-gray-800">
                            <img 
                                src={photo.photo_url} 
                                alt="Pending catch" 
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2">
                                <Camera className="w-5 h-5 text-white" />
                            </div>
                        </div>

                        {/* Info & Actions */}
                        <div className="flex-1 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                    <span className="text-amber-400 font-semibold text-sm">Zur Analyse bereit</span>
                                </div>
                                <p className="text-gray-400 text-xs mb-1">
                                    Aufgenommen: {format(new Date(photo.captured_at), 'dd.MM.yyyy HH:mm')}
                                </p>
                                
                                {/* GPS & Spot Info */}
                                {nearestSpot ? (
                                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-2">
                                        <MapPin className="w-3 h-3" />
                                        <span className="font-medium">
                                            {nearestSpot.name} ({nearestSpot.distance.toFixed(1)} km)
                                        </span>
                                    </div>
                                ) : photo.gps_lat && photo.gps_lon ? (
                                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                                        <MapPin className="w-3 h-3" />
                                        <span>GPS vorhanden, kein Spot in der Nähe</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                                        <MapPin className="w-3 h-3 opacity-30" />
                                        <span>Keine GPS-Daten im Foto</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 mt-3">
                                <Button
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing}
                                    size="sm"
                                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Analysiere...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 mr-2" />
                                            KI-Analyse starten
                                        </>
                                    )}
                                </Button>
                                <Button
                                    onClick={handleDelete}
                                    disabled={isAnalyzing}
                                    size="sm"
                                    variant="outline"
                                    className="border-red-500/50 hover:bg-red-500/20 text-red-400"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}