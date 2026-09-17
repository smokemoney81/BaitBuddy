import React, { useState, useEffect, useCallback, useRef } from "react";
import { analytics, functions } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { Catch } from "@/entities/Catch";
import { Spot } from "@/entities/Spot";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileSelect } from "@/components/ui/mobile-select";
import { Textarea } from "@/components/ui/textarea";
import SwipeToRefresh from "@/components/utils/SwipeToRefresh";
import { toast } from "sonner";
import { Upload, X, Loader2, Share2, BarChart2, Plus, ChefHat } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { UploadFile } from "@/integrations/Core";
import CatchHistory from "@/components/log/CatchHistory";
import PendingPhotoCard from '@/components/log/PendingPhotoCard';
import LazyImage from '@/components/images/LazyImage';
import { AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { toLocalDatetimeInputValue } from "@/lib/utils";
import SocialMediaShareDialog from "@/components/log/SocialMediaShareDialog";
import FishRecognitionResult from "@/components/log/FishRecognitionResult";
import { mergeRecognitionNote } from "@/lib/fishRecognition";

export default function Logbook() {
  useFeatureTracking("catch_log");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ---- Data fetching via TanStack Query ----
  // Ohne explizites Limit liefert das Backend nur die letzten 50 Fänge — das
  // würde sowohl die Liste als auch die Kopf-Statistik (Einträge/Arten/kg)
  // deckeln. Großzügiges Limit, damit das komplette Fangbuch sichtbar ist.
  const { data: catches = [], isLoading: catchesLoading } = useQuery({
    queryKey: ['catches'],
    queryFn: () => Catch.list('-catch_time', 1000),
  });

  const { data: spots = [], isLoading: spotsLoading } = useQuery({
    queryKey: ['spots'],
    queryFn: () => Spot.list(),
  });

  const loading = catchesLoading || spotsLoading;

  // ---- Form field state ----
  const [photoUrl, setPhotoUrl] = useState("");
  const [species, setSpecies] = useState("");
  const [spotId, setSpotId] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [baitUsed, setBaitUsed] = useState("");
  const [notes, setNotes] = useState("");
  const [catchTime, setCatchTime] = useState(toLocalDatetimeInputValue(new Date()));
  const [editingCatch, setEditingCatch] = useState(null);

  // ---- Upload / analysis ----
  const [uploading, setUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // Vollständiges KI-Erkennungsergebnis (Art, Länge, Gewicht, wiss. Name,
  // Geschlecht, Alter, Zustand …). Wird als Review-Karte gezeigt und erst auf
  // Nutzeraktion ins Formular übernommen.
  const [aiResult, setAiResult] = useState(null);

  // ---- Community share ----
  const [shareInCommunity, setShareInCommunity] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [savedCatchData, setSavedCatchData] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  // ---- Social media share ----
  const [showSocialMediaDialog, setShowSocialMediaDialog] = useState(false);

  // ---- Pending photos ----
  const [pendingPhotos, setPendingPhotos] = useState([]);

  // ---- Catch filtering ----
  const [filterSpecies, setFilterSpecies] = useState("Alle");
  const [filterYear, setFilterYear] = useState("Alle Jahre");

  // Ref so onSuccess closure always sees latest shareInCommunity value.
  const shareRef = useRef(shareInCommunity);
  useEffect(() => { shareRef.current = shareInCommunity; }, [shareInCommunity]);

  // Reload catches when external event fires (e.g. QuickCatchDialog).
  useEffect(() => {
    const handleCatchSaved = () => queryClient.invalidateQueries({ queryKey: ['catches'] });
    window.addEventListener('catch-saved', handleCatchSaved);
    return () => window.removeEventListener('catch-saved', handleCatchSaved);
  }, [queryClient]);

  // ---- Pending photos ----
  useEffect(() => {
    loadPendingPhotos();
  }, []);

  const loadPendingPhotos = () => {
    try {
      const stored = localStorage.getItem('catchgbt_pending_photos');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setPendingPhotos(parsed);
        } else {
          localStorage.removeItem('catchgbt_pending_photos');
          setPendingPhotos([]);
        }
      }
    } catch (error) {
      localStorage.removeItem('catchgbt_pending_photos');
      setPendingPhotos([]);
    }
  };

  // ---- Spot nearest helper ----
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const findNearestSpot = useCallback((gpsLat, gpsLon, maxDistanceKm = 2) => {
    if (!gpsLat || !gpsLon || spots.length === 0) return null;
    let nearest = null;
    let minDist = Infinity;
    spots.forEach(spot => {
      if (spot.latitude && spot.longitude) {
        const d = calculateDistance(gpsLat, gpsLon, spot.latitude, spot.longitude);
        if (d < minDist && d <= maxDistanceKm) { minDist = d; nearest = { ...spot, distance: d }; }
      }
    });
    return nearest;
  }, [spots]);

  // ---- Reset form ----
  const resetForm = useCallback(() => {
    setPhotoUrl(""); setSpecies(""); setSpotId(""); setLengthCm("");
    setWeightKg(""); setBaitUsed(""); setNotes("");
    setCatchTime(toLocalDatetimeInputValue(new Date()));
    setEditingCatch(null);
    setAiResult(null);
  }, []);

  // Übernimmt das KI-Erkennungsergebnis ins Formular: Kernfelder (Art, Länge,
  // Gewicht, Köder) in die Eingabefelder, die Zusatzmerkmale (wiss. Name,
  // Geschlecht, Alter, Umfang, Zustand, Konfidenz) als KI-Notiz in die Notizen —
  // ohne bereits vom Nutzer eingetragene Werte zu überschreiben.
  const applyRecognition = useCallback((data) => {
    if (!data) return;
    if (data.species_name) setSpecies((prev) => prev?.trim() ? prev : data.species_name);
    if (data.length_cm != null) setLengthCm((prev) => prev?.trim() ? prev : String(data.length_cm));
    if (data.weight_kg != null) setWeightKg((prev) => prev?.trim() ? prev : String(data.weight_kg));
    if (data.bait_used) setBaitUsed((prev) => prev?.trim() ? prev : data.bait_used);
    setNotes((prev) => mergeRecognitionNote(prev, data));
    setAiResult(null);
    toast.success("KI-Daten ins Fangbuch übernommen");
  }, []);

  // ---- Mutations with Optimistic UI (TanStack Query cache) ----
  const createCatchMutation = useMutation({
    mutationFn: (catchData) => Catch.create(catchData),
    onMutate: async (catchData) => {
      await queryClient.cancelQueries({ queryKey: ['catches'] });
      const previous = queryClient.getQueryData(['catches']);
      const optimistic = {
        id: `tmp-${Date.now()}`,
        ...catchData,
        created_date: new Date().toISOString(),
        created_by: 'temp',
      };
      queryClient.setQueryData(['catches'], (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['catches'], context.previous);
      toast.error("Fehler beim Speichern des Fangs");
    },
    onSuccess: async (savedCatch, variables) => {
      queryClient.setQueryData(['catches'], (old = []) =>
        old.map(c => (c.id?.startsWith('tmp-') ? savedCatch : c))
      );
      toast.success("Fang gespeichert!", {
        action: {
          label: "Rezepte",
          onClick: () => {
            const params = new URLSearchParams({ species: savedCatch.species || "" });
            if (savedCatch.weight_kg) params.set("weight_g", Math.round(savedCatch.weight_kg * 1000));
            if (savedCatch.length_cm) params.set("length_cm", savedCatch.length_cm);
            if (savedCatch.catch_time) params.set("catch_date", savedCatch.catch_time);
            navigate(`/FishRecipes?${params.toString()}`);
          },
        },
      });
      resetForm();
      setSavedCatchData(savedCatch);

      analytics.track({
        eventName: "fishing_catch_logged",
        properties: {
          species: variables.species,
          has_photo: !!variables.photo_url,
          has_spot: !!variables.spot_id,
          length_cm: variables.length_cm ?? null,
        },
      });

      if (shareRef.current) {
        const catchText = `Mein Fang: ${savedCatch.species}${savedCatch.length_cm ? ` (${savedCatch.length_cm}cm)` : ''}${savedCatch.weight_kg ? `, ${savedCatch.weight_kg}kg` : ''}${savedCatch.bait_used ? `\nKöder: ${savedCatch.bait_used}` : ''}${savedCatch.notes ? `\n\n${savedCatch.notes}` : ''}`;
        await entities.Post.create({ text: catchText, photo_url: savedCatch.photo_url || null, likes: 0, reported: false });
        toast.success("Fang in Community geteilt!");
        setShareInCommunity(false);
      } else {
        setShowShareDialog(true);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['catches'] }),
  });

  const updateCatchMutation = useMutation({
    mutationFn: ({ id, data }) => Catch.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['catches'] });
      const previous = queryClient.getQueryData(['catches']);
      queryClient.setQueryData(['catches'], (old = []) =>
        old.map(c => (c.id === id ? { ...c, ...data } : c))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['catches'], context.previous);
      toast.error("Fehler beim Aktualisieren");
    },
    onSuccess: () => { toast.success("Fang aktualisiert!"); resetForm(); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['catches'] }),
  });

  const deleteCatchMutation = useMutation({
    mutationFn: (id) => Catch.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['catches'] });
      const previous = queryClient.getQueryData(['catches']);
      queryClient.setQueryData(['catches'], (old = []) => old.filter(c => c.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['catches'], context.previous);
      toast.error("Fehler beim Löschen des Fangs");
    },
    onSuccess: () => toast.success("Fang gelöscht"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['catches'] }),
  });

  // ---- Handlers ----
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error("Bitte nur Bilddateien hochladen"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Datei zu groß (max. 10MB)"); return; }
    setUploading(true);
    try {
      toast.info("Lade Foto hoch...");
      const { file_url } = await UploadFile({ file });
      setPhotoUrl(file_url);
      toast.success("Foto hochgeladen!");
    } catch {
      toast.error("Fehler beim Hochladen des Fotos");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!species?.trim()) { toast.error("Bitte Fischart angeben"); return; }

    // P3.1, P3.2: Validate numeric inputs with bounds
    let parsedLength = null;
    let parsedWeight = null;

    if (lengthCm?.trim()) {
      parsedLength = parseFloat(lengthCm);
      if (isNaN(parsedLength) || parsedLength < 0.1 || parsedLength > 500) {
        toast.error("Länge muss zwischen 0,1 und 500 cm liegen");
        return;
      }
    }

    if (weightKg?.trim()) {
      parsedWeight = parseFloat(weightKg);
      if (isNaN(parsedWeight) || parsedWeight < 0.1 || parsedWeight > 1000) {
        toast.error("Gewicht muss zwischen 0,1 und 1000 kg liegen");
        return;
      }
    }

    const catchData = {
      species: species.trim(),
      spot_id: spotId || null,
      length_cm: parsedLength,
      weight_kg: parsedWeight,
      bait_used: baitUsed.trim() || null,
      photo_url: photoUrl || null,
      notes: notes.trim() || null,
      catch_time: new Date(catchTime).toISOString(),
      points_earned: 1,
    };

    if (editingCatch) {
      updateCatchMutation.mutate({ id: editingCatch.id, data: catchData });
    } else {
      createCatchMutation.mutate(catchData);
    }
  };

  const handleEdit = useCallback((catchItem) => {
    setEditingCatch(catchItem);
    setPhotoUrl(catchItem.photo_url || "");
    setSpecies(catchItem.species || "");
    setSpotId(catchItem.spot_id || "");
    setLengthCm(catchItem.length_cm?.toString() || "");
    setWeightKg(catchItem.weight_kg?.toString() || "");
    setBaitUsed(catchItem.bait_used || "");
    setNotes(catchItem.notes || "");
    setCatchTime(toLocalDatetimeInputValue(catchItem.catch_time || new Date()));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleDelete = useCallback((id) => {
    if (!confirm("Fang wirklich löschen?")) return;
    deleteCatchMutation.mutate(id);
  }, [deleteCatchMutation]);

  const handlePhotoAnalyzed = (photoId) => {
    const updated = pendingPhotos.filter(p => p.id !== photoId);
    setPendingPhotos(updated);
    localStorage.setItem('catchgbt_pending_photos', JSON.stringify(updated));
    queryClient.invalidateQueries({ queryKey: ['catches'] });
  };

  const handlePhotoDeleted = (photoId) => {
    const updated = pendingPhotos.filter(p => p.id !== photoId);
    setPendingPhotos(updated);
    localStorage.setItem('catchgbt_pending_photos', JSON.stringify(updated));
  };

  const handleShareToCommunity = async () => {
    if (!savedCatchData) return;
    setIsSharing(true);
    try {
      const catchText = `Mein Fang: ${savedCatchData.species}${savedCatchData.length_cm ? ` (${savedCatchData.length_cm}cm)` : ''}${savedCatchData.weight_kg ? `, ${savedCatchData.weight_kg}kg` : ''}${savedCatchData.bait_used ? `\nKöder: ${savedCatchData.bait_used}` : ''}${savedCatchData.notes ? `\n\n${savedCatchData.notes}` : ''}`;
      await entities.Post.create({ text: catchText, photo_url: savedCatchData.photo_url || null, likes: 0, reported: false });
      toast.success("Fang in der Community geteilt!");
      setShowShareDialog(false);
      setSavedCatchData(null);
    } catch (error) {
      toast.error("Fehler beim Teilen des Fangs");
    } finally {
      setIsSharing(false);
    }
  };

  const isSaving = createCatchMutation.isPending || updateCatchMutation.isPending;

  if (loading && catches.length === 0 && spots.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-cyan-400" />
          <p className="text-gray-400">Lade Fangbuch...</p>
        </div>
      </div>
    );
  }

  return (
    <SwipeToRefresh onRefresh={() => queryClient.invalidateQueries({ queryKey: ['catches'] })}>
      <div className="max-w-6xl mx-auto p-6 space-y-8 pb-safe-fixed">
      {catches.length > 0 && !loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-gradient-to-br from-cyan-900/30 to-cyan-900/10 border border-cyan-800/40 p-3 text-center">
            <div className="text-2xl font-bold text-cyan-400">{catches.length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Einträge</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-900/30 to-emerald-900/10 border border-emerald-800/40 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {[...new Set(catches.map(c => c.species).filter(Boolean))].length}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Arten</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-900/30 to-amber-900/10 border border-amber-800/40 p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">
              {catches.filter(c => c.weight_kg).reduce((s, c) => s + c.weight_kg, 0).toFixed(1)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">kg gesamt</div>
          </div>
        </div>
      )}

      <Card id="fang-erfassen" className="glass-morphism border-gray-800 rounded-2xl scroll-mt-24">
        <CardHeader>
          {!editingCatch && (
            <div className="flex flex-wrap gap-2 mb-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShareInCommunity(prev => !prev)}
                className={`text-sm border ${shareInCommunity ? "border-cyan-500 text-cyan-400 bg-cyan-950/40" : "border-gray-700 text-gray-300 hover:bg-gray-700"}`}
              >
                {shareInCommunity ? "In Community posten: An" : "In Community posten"}
              </Button>
              <div className="inline-flex items-center cursor-pointer" onClick={(e) => e.stopPropagation()}>
                <input
                  type="file"
                  id="ai-analyze-upload"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error("Datei zu groß (max. 10 MB)");
                      return;
                    }
                    setIsAnalyzing(true);
                    try {
                      const result = await UploadFile({ file });
                      if (!result?.file_url) {
                        toast.error("Datei-Upload fehlgeschlagen");
                        setIsAnalyzing(false);
                        return;
                      }
                      const { file_url } = result;
                      setPhotoUrl(file_url);

                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const nearest = findNearestSpot(pos.coords.latitude, pos.coords.longitude);
                            if (nearest) {
                              setSpotId(nearest.id);
                              toast.info(`Spot zugewiesen: ${nearest.name}`);
                            }
                          },
                          () => {},
                          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
                        );
                      }

                      toast.info("KI analysiert das Bild...");
                      const analysisResult = await functions.invoke('analyzeCatchPhoto', { file_url });
                      const data = analysisResult?.data;
                      if (data?.result_data) {
                        const ai = data.result_data;
                        setAiResult(ai);
                        const parts = [];
                        if (ai.species_name) parts.push(ai.species_name);
                        if (ai.length_cm) parts.push(`${ai.length_cm} cm`);
                        if (ai.weight_kg) parts.push(`${ai.weight_kg} kg`);
                        const confText = ai.confidence ? ` (${Math.round(ai.confidence * 100)}% sicher)` : '';
                        toast.success(`KI erkannt: ${parts.join(', ')}${confText}`);
                      } else {
                        setAiResult(null);
                        toast.warning("Foto hochgeladen, aber KI konnte keinen Fisch erkennen");
                      }
                    } catch (error) {
                      toast.error("KI-Analyse fehlgeschlagen");
                    } finally {
                      setIsAnalyzing(false);
                    }
                  }}
                  disabled={isAnalyzing}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="text-sm border-cyan-600 text-cyan-400 hover:bg-cyan-900/30 cursor-pointer"
                  disabled={isAnalyzing}
                  onClick={() => document.getElementById('ai-analyze-upload').click()}
                >
                  {isAnalyzing ? (
                    <><Loader2 className="animate-spin h-4 w-4 mr-1" />KI analysiert...</>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      Foto + KI-Erkennung
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          <CardTitle className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">
            {editingCatch ? "Fang bearbeiten" : "Neuen Fang erfassen"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiResult && (
            <div className="mb-6">
              <FishRecognitionResult
                data={aiResult}
                onApply={applyRecognition}
                onDismiss={() => setAiResult(null)}
              />
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="catch-photo" className="text-white">Foto hochladen</Label>
              <div className="flex items-center gap-4">
                <input type="file" id="catch-photo" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="hidden" />
                <label
                  htmlFor="catch-photo"
                  className="flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gray-800 hover:bg-gray-700 text-white rounded-lg cursor-pointer transition-colors"
                >
                  {uploading ? (
                    <><Loader2 className="animate-spin h-5 w-5" />Wird hochgeladen...</>
                  ) : (
                    <><Upload className="w-5 h-5" />Bild auswählen</>
                  )}
                </label>
                {photoUrl && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setPhotoUrl("")} className="border-gray-700 hover:bg-gray-700 text-white" aria-label="Foto entfernen">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {photoUrl && (
                <div className="mt-4 relative w-full h-48 rounded-lg overflow-hidden bg-gray-800">
                  <LazyImage src={photoUrl} alt="Vorschau" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="species" className="text-white">Fischart *</Label>
              <Input id="species" value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="z.B. Hecht, Zander, Karpfen..." className="bg-gray-800/50 border-gray-700 text-white" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="spot-select" className="text-white">Angelspot</Label>
              <div className="md:hidden">
                <MobileSelect value={spotId} onValueChange={setSpotId} placeholder="Spot auswählen (optional)" label="Angelspot" options={[{ value: "", label: "Kein Spot" }, ...spots.map(s => ({ value: s.id, label: s.name }))]} className="bg-gray-800/50 border-gray-700 text-white" />
              </div>
              <div className="hidden md:block">
                <Select value={spotId || "none"} onValueChange={(v) => setSpotId(v === "none" ? "" : v)}>
                  <SelectTrigger id="spot-select" className="bg-gray-800/50 border-gray-700 text-white">
                    <SelectValue placeholder="Spot auswählen (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 text-white">
                    <SelectItem value="none">Kein Spot</SelectItem>
                    {spots.map((spot) => (
                      <SelectItem key={spot.id} value={spot.id}>{spot.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="length-cm" className="text-white">Länge (cm)</Label>
                <Input id="length-cm" type="number" step="0.1" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} placeholder="z.B. 65" className="bg-gray-800/50 border-gray-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight-kg" className="text-white">Gewicht (kg)</Label>
                <Input id="weight-kg" type="number" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="z.B. 3.5" className="bg-gray-800/50 border-gray-700 text-white" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bait-used" className="text-white">Verwendeter Köder</Label>
              <Input id="bait-used" value={baitUsed} onChange={(e) => setBaitUsed(e.target.value)} placeholder="z.B. Gummifisch, Wobbler..." className="bg-gray-800/50 border-gray-700 text-white" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="catch-time" className="text-white">Fangzeitpunkt</Label>
              <Input id="catch-time" type="datetime-local" value={catchTime} onChange={(e) => setCatchTime(e.target.value)} className="bg-gray-800/50 border-gray-700 text-white" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-white">Notizen</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wetter, Bedingungen, Besonderheiten..." className="bg-gray-800/50 border-gray-700 text-white min-h-[100px]" />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving || uploading} className="flex-1 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-semibold min-h-[44px] shadow-lg shadow-cyan-900/30 transition-all">
                {isSaving ? (
                  <><Loader2 className="animate-spin h-5 w-5 mr-2" />Wird gespeichert...</>
                ) : (editingCatch ? "Änderungen speichern" : "Fang speichern")}
              </Button>
              {editingCatch && (
                <Button type="button" variant="outline" onClick={resetForm} className="border-gray-700 text-gray-300 hover:bg-gray-700 min-h-[44px]">
                  Abbrechen
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {pendingPhotos.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-amber-500 rounded-full" />
            <h2 className="text-xl font-semibold text-amber-400">Fotos zur Analyse ({pendingPhotos.length})</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {pendingPhotos.map(photo => (
                <PendingPhotoCard key={photo.id} photo={photo} spots={spots} findNearestSpot={findNearestSpot} onAnalyzed={handlePhotoAnalyzed} onDeleted={handlePhotoDeleted} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Link to="/CatchStats">
          <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-cyan-400 text-sm font-medium transition-colors min-h-[44px]">
            <BarChart2 className="w-4 h-4" />
            Fang-Statistiken anzeigen
          </button>
        </Link>
      </div>

      {catches.length > 0 && !loading && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Filter</h3>
          <div className="flex gap-2 flex-wrap">
            {["Alle", ...new Set(catches.map(c => c.species).filter(Boolean))].map(species => (
              <button type="button"
                key={species}
                onClick={() => setFilterSpecies(species)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  filterSpecies === species
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                    : "bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800"
                }`}
              >
                {species}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Alle Jahre", new Date().getFullYear().toString(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(year => (
              <button type="button"
                key={year}
                onClick={() => setFilterYear(year)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  filterYear === year
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                    : "bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      <CatchHistory
        catches={catches.filter(c => {
          const matchesSpecies = filterSpecies === "Alle" || c.species === filterSpecies;
          const catchYear = c.catch_time ? new Date(c.catch_time).getFullYear().toString() : '';
          const matchesYear = filterYear === "Alle Jahre" || catchYear === filterYear;
          return matchesSpecies && matchesYear;
        })}
        isLoading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['catches'] })}
      />

      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-cyan-400">In Community teilen?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-300 mb-4">Möchtest du diesen Fang mit der Community teilen?</p>
            {savedCatchData?.photo_url && (
               <div className="relative w-full h-48 rounded-lg overflow-hidden mb-4">
                 <LazyImage src={savedCatchData.photo_url} alt={savedCatchData.species} className="w-full h-full object-cover" />
               </div>
             )}
            {savedCatchData && (
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                <p className="text-white font-semibold">{savedCatchData.species}</p>
                {savedCatchData.length_cm && <p className="text-gray-300 text-sm">Länge: {savedCatchData.length_cm}cm</p>}
                {savedCatchData.weight_kg && <p className="text-gray-300 text-sm">Gewicht: {savedCatchData.weight_kg}kg</p>}
                {savedCatchData.bait_used && <p className="text-gray-300 text-sm">Köder: {savedCatchData.bait_used}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setShowShareDialog(false); setSavedCatchData(null); }} disabled={isSharing} className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-700 min-h-[44px]">
                Nein, danke
              </Button>
              <Button onClick={handleShareToCommunity} disabled={isSharing} className="flex-1 bg-cyan-600 hover:bg-cyan-700 min-h-[44px]">
                {isSharing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Wird geteilt...</> : <><Share2 className="w-4 h-4 mr-2" />Community</>}
              </Button>
            </div>
            <Button onClick={() => setShowSocialMediaDialog(true)} disabled={isSharing} variant="outline" className="w-full border-gray-700 text-gray-300 hover:bg-gray-700 min-h-[44px]">
              Auf Social Media teilen
            </Button>
          </DialogFooter>
          </DialogContent>
          </Dialog>

      <SocialMediaShareDialog
        open={showSocialMediaDialog}
        onOpenChange={setShowSocialMediaDialog}
        catchData={savedCatchData}
      />

      <button type="button"
        type="button"
        aria-label="Neuen Fang eintragen"
        onClick={() => {
          const form = document.getElementById('fang-erfassen');
          if (form) {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const speciesInput = form.querySelector('input, select, textarea');
            if (speciesInput) setTimeout(() => speciesInput.focus(), 400);
          }
        }}
        className="fixed right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 shadow-lg shadow-cyan-500/40 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      >
        <Plus className="w-7 h-7" />
      </button>
          </div>
          </SwipeToRefresh>
          );
          }