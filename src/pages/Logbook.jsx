import React, { useState, useEffect, useCallback, useRef } from "react";
import { analytics, functions } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { Catch } from "@/entities/Catch";
import { Spot } from "@/entities/Spot";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileSelect } from "@/components/ui/mobile-select";
import { Textarea } from "@/components/ui/textarea";
import SwipeToRefresh from "@/components/utils/SwipeToRefresh";
import { toast } from "sonner";
import { Upload, X, Loader2, Share2, BarChart2, Plus } from "lucide-react";
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
import TabBar from "@/components/layout/TabBar";

export default function Logbook() {
  useFeatureTracking("catch_log");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: catches = [], isLoading: catchesLoading } = useQuery({
    queryKey: ['catches'],
    queryFn: () => Catch.list('-catch_time', 1000),
  });

  const { data: spots = [], isLoading: spotsLoading } = useQuery({
    queryKey: ['spots'],
    queryFn: () => Spot.list(),
  });

  const loading = catchesLoading || spotsLoading;

  const [photoUrl, setPhotoUrl] = useState("");
  const [species, setSpecies] = useState("");
  const [spotId, setSpotId] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [baitUsed, setBaitUsed] = useState("");
  const [notes, setNotes] = useState("");
  const [catchTime, setCatchTime] = useState(toLocalDatetimeInputValue(new Date()));
  const [editingCatch, setEditingCatch] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const [shareInCommunity, setShareInCommunity] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [savedCatchData, setSavedCatchData] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  const [showSocialMediaDialog, setShowSocialMediaDialog] = useState(false);

  const [pendingPhotos, setPendingPhotos] = useState([]);

  const [filterSpecies, setFilterSpecies] = useState("Alle");
  const [filterYear, setFilterYear] = useState("Alle Jahre");

  const shareRef = useRef(shareInCommunity);
  useEffect(() => { shareRef.current = shareInCommunity; }, [shareInCommunity]);

  useEffect(() => {
    const handleCatchSaved = () => queryClient.invalidateQueries({ queryKey: ['catches'] });
    window.addEventListener('catch-saved', handleCatchSaved);
    return () => window.removeEventListener('catch-saved', handleCatchSaved);
  }, [queryClient]);

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

  const resetForm = useCallback(() => {
    setPhotoUrl(""); setSpecies(""); setSpotId(""); setLengthCm("");
    setWeightKg(""); setBaitUsed(""); setNotes("");
    setCatchTime(toLocalDatetimeInputValue(new Date()));
    setEditingCatch(null);
    setAiResult(null);
  }, []);

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

  const speciesTabs = ["Alle", ...[...new Set(catches.map(c => c.species).filter(Boolean))]];
  const yearTabs = ["Alle Jahre", new Date().getFullYear().toString(), String(new Date().getFullYear() - 1), String(new Date().getFullYear() - 2)];

  if (loading && catches.length === 0 && spots.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-cyan-400" />
          <p style={{ color: 'var(--bb-muted)' }}>Lade Fangbuch...</p>
        </div>
      </div>
    );
  }

  return (
    <SwipeToRefresh onRefresh={() => queryClient.invalidateQueries({ queryKey: ['catches'] })}>
      <div className="bb-page">

        {/* ── Stats ──────────────────────────────── */}
        {catches.length > 0 && !loading && (
          <div className="bb-stat-row">
            <div className="bb-stat-card">
              <div className="bb-stat-value" style={{ color: 'var(--bb-cyan)' }}>{catches.length}</div>
              <div className="bb-stat-label">Einträge</div>
            </div>
            <div className="bb-stat-card">
              <div className="bb-stat-value" style={{ color: 'var(--bb-green)' }}>
                {[...new Set(catches.map(c => c.species).filter(Boolean))].length}
              </div>
              <div className="bb-stat-label">Arten</div>
            </div>
            <div className="bb-stat-card">
              <div className="bb-stat-value" style={{ color: 'var(--bb-orange)' }}>
                {catches.filter(c => c.weight_kg).reduce((s, c) => s + c.weight_kg, 0).toFixed(1)}
              </div>
              <div className="bb-stat-label">kg gesamt</div>
            </div>
          </div>
        )}

        {/* ── Form ───────────────────────────────── */}
        <section id="fang-erfassen" className="bb-card scroll-mt-24">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="bb-form-title">
              {editingCatch ? "Fang bearbeiten" : "Neuen Fang erfassen"}
            </h2>
          </div>

          {!editingCatch && (
            <div className="bb-toolbar mb-5">
              <button
                type="button"
                onClick={() => setShareInCommunity(prev => !prev)}
                className={`bb-secondary text-sm ${shareInCommunity ? 'border-cyan-500/50 text-cyan-400' : ''}`}
              >
                {shareInCommunity ? "Community: An" : "Community posten"}
              </button>
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
              <button
                type="button"
                className="bb-secondary text-sm"
                style={{ borderColor: 'rgba(0,229,255,.3)', color: 'var(--bb-cyan)' }}
                disabled={isAnalyzing}
                onClick={() => document.getElementById('ai-analyze-upload').click()}
              >
                {isAnalyzing ? (
                  <><Loader2 className="animate-spin" size={16} />KI analysiert...</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Foto + KI-Erkennung</>
                )}
              </button>
            </div>
          )}

          {aiResult && (
            <div className="mb-5">
              <FishRecognitionResult
                data={aiResult}
                onApply={applyRecognition}
                onDismiss={() => setAiResult(null)}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4">
            {/* Photo upload */}
            <div className="grid gap-2">
              <Label htmlFor="catch-photo" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Foto</Label>
              <div className="flex items-center gap-3">
                <input type="file" id="catch-photo" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="hidden" />
                <label htmlFor="catch-photo" className="bb-photo-upload">
                  {uploading ? (
                    <><Loader2 className="animate-spin" size={18} />Wird hochgeladen...</>
                  ) : (
                    <><Upload size={18} />Bild auswählen</>
                  )}
                </label>
                {photoUrl && (
                  <button type="button" onClick={() => setPhotoUrl("")} className="bb-secondary" style={{ padding: '10px' }} aria-label="Foto entfernen">
                    <X size={16} />
                  </button>
                )}
              </div>
              {photoUrl && (
                <div className="bb-photo-preview mt-1">
                  <LazyImage src={photoUrl} alt="Vorschau" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Species */}
            <div className="grid gap-2">
              <Label htmlFor="species" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Fischart *</Label>
              <Input id="species" value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="z.B. Hecht, Zander, Karpfen..." className="bg-black/25 border-white/10 text-white" required />
            </div>

            {/* Spot */}
            <div className="grid gap-2">
              <Label htmlFor="spot-select" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Angelspot</Label>
              <div className="md:hidden">
                <MobileSelect value={spotId} onValueChange={setSpotId} placeholder="Spot auswählen (optional)" label="Angelspot" options={[{ value: "", label: "Kein Spot" }, ...spots.map(s => ({ value: s.id, label: s.name }))]} className="bg-black/25 border-white/10 text-white" />
              </div>
              <div className="hidden md:block">
                <Select value={spotId || "none"} onValueChange={(v) => setSpotId(v === "none" ? "" : v)}>
                  <SelectTrigger id="spot-select" className="bg-black/25 border-white/10 text-white">
                    <SelectValue placeholder="Spot auswählen (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-white/10 text-white">
                    <SelectItem value="none">Kein Spot</SelectItem>
                    {spots.map((spot) => (
                      <SelectItem key={spot.id} value={spot.id}>{spot.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Length + Weight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="length-cm" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Länge (cm)</Label>
                <Input id="length-cm" type="number" step="0.1" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} placeholder="z.B. 65" className="bg-black/25 border-white/10 text-white" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="weight-kg" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Gewicht (kg)</Label>
                <Input id="weight-kg" type="number" step="0.01" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="z.B. 3.5" className="bg-black/25 border-white/10 text-white" />
              </div>
            </div>

            {/* Bait */}
            <div className="grid gap-2">
              <Label htmlFor="bait-used" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Verwendeter Köder</Label>
              <Input id="bait-used" value={baitUsed} onChange={(e) => setBaitUsed(e.target.value)} placeholder="z.B. Gummifisch, Wobbler..." className="bg-black/25 border-white/10 text-white" />
            </div>

            {/* Catch time */}
            <div className="grid gap-2">
              <Label htmlFor="catch-time" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Fangzeitpunkt</Label>
              <Input id="catch-time" type="datetime-local" value={catchTime} onChange={(e) => setCatchTime(e.target.value)} className="bg-black/25 border-white/10 text-white" />
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes" className="text-sm" style={{ color: 'var(--bb-muted)' }}>Notizen</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Wetter, Bedingungen, Besonderheiten..." className="bg-black/25 border-white/10 text-white min-h-[100px]" />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={isSaving || uploading} className="bb-action flex-1">
                {isSaving ? (
                  <><Loader2 className="animate-spin" size={18} />Wird gespeichert...</>
                ) : (editingCatch ? "Änderungen speichern" : "Fang speichern")}
              </button>
              {editingCatch && (
                <button type="button" onClick={resetForm} className="bb-secondary">
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </section>

        {/* ── Pending photos ─────────────────────── */}
        {pendingPhotos.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-5 rounded-full" style={{ background: 'var(--bb-orange)' }} />
              <h2 className="text-base font-semibold" style={{ color: 'var(--bb-orange)' }}>
                Fotos zur Analyse ({pendingPhotos.length})
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence>
                {pendingPhotos.map(photo => (
                  <PendingPhotoCard key={photo.id} photo={photo} spots={spots} findNearestSpot={findNearestSpot} onAnalyzed={handlePhotoAnalyzed} onDeleted={handlePhotoDeleted} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* ── Stats link ─────────────────────────── */}
        <Link to="/CatchStats" className="bb-link-row">
          <BarChart2 size={18} />
          Fang-Statistiken anzeigen
        </Link>

        {/* ── Filters + History ──────────────────── */}
        {catches.length > 0 && !loading && (
          <section className="grid gap-3">
            <span className="bb-section-label">Filter</span>
            <TabBar
              tabs={speciesTabs}
              activeTab={filterSpecies}
              onTabChange={setFilterSpecies}
            />
            <TabBar
              tabs={yearTabs}
              activeTab={filterYear}
              onTabChange={setFilterYear}
            />
          </section>
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

        {/* ── Share dialog ───────────────────────── */}
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
          <DialogContent className="bg-gray-900 border-white/10 text-white">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--bb-cyan)' }}>In Community teilen?</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm mb-4" style={{ color: 'var(--bb-muted)' }}>Möchtest du diesen Fang mit der Community teilen?</p>
              {savedCatchData?.photo_url && (
                <div className="bb-photo-preview mb-4">
                  <LazyImage src={savedCatchData.photo_url} alt={savedCatchData.species} className="w-full h-full object-cover" />
                </div>
              )}
              {savedCatchData && (
                <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(0,0,0,.25)' }}>
                  <p className="font-semibold">{savedCatchData.species}</p>
                  {savedCatchData.length_cm && <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Länge: {savedCatchData.length_cm}cm</p>}
                  {savedCatchData.weight_kg && <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Gewicht: {savedCatchData.weight_kg}kg</p>}
                  {savedCatchData.bait_used && <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Köder: {savedCatchData.bait_used}</p>}
                </div>
              )}
            </div>
            <DialogFooter className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => { setShowShareDialog(false); setSavedCatchData(null); }} disabled={isSharing} className="bb-secondary flex-1 justify-center min-h-[44px]">
                  Nein, danke
                </button>
                <button type="button" onClick={handleShareToCommunity} disabled={isSharing} className="bb-action flex-1">
                  {isSharing ? <><Loader2 size={16} className="animate-spin" />Wird geteilt...</> : <><Share2 size={16} />Community</>}
                </button>
              </div>
              <button type="button" onClick={() => setShowSocialMediaDialog(true)} disabled={isSharing} className="bb-secondary w-full justify-center min-h-[44px]">
                Auf Social Media teilen
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SocialMediaShareDialog
          open={showSocialMediaDialog}
          onOpenChange={setShowSocialMediaDialog}
          catchData={savedCatchData}
        />

        {/* ── Scroll-to-form FAB ─────────────────── */}
        <button
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
          className="bb-fab fixed right-5 z-40"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
        >
          <Plus size={26} />
        </button>
      </div>
    </SwipeToRefresh>
  );
}
