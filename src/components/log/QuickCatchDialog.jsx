import React, { useEffect, useState } from "react";
import { Catch, Spot } from "@/entities/all";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobileSelect } from "@/components/ui/mobile-select";
import { Card } from "@/components/ui/card";
import { RuleEntry } from "@/entities/RuleEntry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import { useLanguage } from "@/components/i18n/LanguageContext";
import { analytics } from "@/api/frontendClient";
import { functions } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toLocalDatetimeInputValue } from "@/lib/utils";
import { isInClosedSeason } from "@/lib/closedSeason";
import { createCatchWithOfflineSupport, isOnline } from "@/components/utils/offlineSync";
import { saveOfflinePhoto, updateOfflinePhotoById } from "@/utils/offlinePhotoStorage";
import { notifyAction, actionMessages } from "@/lib/actionNotifications";

export default function QuickCatchDialog() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [spots, setSpots] = useState([]);
  const [form, setForm] = useState({
    species: "", spot_id: "", length_cm: "", weight_kg: "", bait_used: "", notes: "", catch_time: toLocalDatetimeInputValue(new Date()), photo_url: ""
  });
  const [ruleWarnings, setRuleWarnings] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [savedCatchData, setSavedCatchData] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [aiAnalysisData, setAiAnalysisData] = useState(null);
  const [showAiConfirmDialog, setShowAiConfirmDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showBiteDetectorPrompt, setShowBiteDetectorPrompt] = useState(false);
  const [pendingOfflinePhotoId, setPendingOfflinePhotoId] = useState(null);

  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();

  // EXIF Parser (minimal JPEG: DateTimeOriginal, GPS)
  const parseEXIF = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const dv = new DataView(buf);
      let offset = 2;
      if (dv.getUint16(0, false) !== 0xFFD8) return {};

      while (offset < dv.byteLength) {
        const marker = dv.getUint16(offset, false);
        offset += 2;
        const size = dv.getUint16(offset, false);
        offset += 2;

        if (marker === 0xFFE1) {
          const exifHeader = new TextDecoder().decode(new DataView(buf, offset, 6));
          if (!exifHeader.startsWith("Exif")) break;

          const tiffOffset = offset + 6;
          const endianMark = dv.getUint16(tiffOffset, false);
          const isLE = (endianMark === 0x4949);

          if (dv.getUint16(tiffOffset + 2, isLE) !== 0x002A) break;

          const firstIFDOffset = dv.getUint32(tiffOffset + 4, isLE);

          const getTag = (base, i) => {
            const entry = base + 2 + i * 12;
            const tag = dv.getUint16(entry, isLE);
            const type = dv.getUint16(entry + 2, isLE);
            const count = dv.getUint32(entry + 4, isLE);
            const valueOffset = dv.getUint32(entry + 8, isLE);
            return { tag, type, count, valueOffset, entry };
          };

          const readAscii = (off, count) => {
            const bytes = new Uint8Array(buf, off, count);
            return new TextDecoder().decode(bytes).replace(/\0+$/, "");
          };

          const readRational = (off) => {
            const num = dv.getUint32(off, isLE);
            const den = dv.getUint32(off + 4, isLE);
            return den ? num / den : 0;
          };

          const IFD0 = tiffOffset + firstIFDOffset;
          const entries0 = dv.getUint16(IFD0, isLE);
          let exifIFDPointer = 0, gpsIFDPointer = 0;

          for (let i = 0; i < entries0; i++) {
            const { tag, valueOffset } = getTag(IFD0, i);
            if (tag === 0x8769) exifIFDPointer = valueOffset;
            if (tag === 0x8825) gpsIFDPointer = valueOffset;
          }

          let dateTimeOriginal = null;
          if (exifIFDPointer) {
            const exifIFD = tiffOffset + exifIFDPointer;
            const count = dv.getUint16(exifIFD, isLE);
            for (let i = 0; i < count; i++) {
              const { tag, type, count: c, valueOffset } = getTag(exifIFD, i);
              if (tag === 0x9003 && type === 2) {
                const off = c > 4 ? tiffOffset + valueOffset : exifIFD + 8;
                const str = readAscii(off, c);
                const safeStr = String(str || "");
                if (safeStr.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/)) {
                  const iso = safeStr.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T") + "Z";
                  dateTimeOriginal = iso;
                }
              }
            }
          }

          let gpsLat = null, gpsLon = null;
          if (gpsIFDPointer) {
            const gpsIFD = tiffOffset + gpsIFDPointer;
            const count = dv.getUint16(gpsIFD, isLE);
            let latRef = "N", lonRef = "E", latArr = null, lonArr = null;

            for (let i = 0; i < count; i++) {
              const { tag, type, count: c, valueOffset } = getTag(gpsIFD, i);
              if (tag === 0x0001) {
                const off = c > 4 ? tiffOffset + valueOffset : gpsIFD + 8;
                latRef = String(readAscii(off, c) || "N").trim();
              }
              if (tag === 0x0003) {
                const off = c > 4 ? tiffOffset + valueOffset : gpsIFD + 8;
                lonRef = String(readAscii(off, c) || "E").trim();
              }
              if (tag === 0x0002 && type === 5) {
                const off = tiffOffset + valueOffset;
                latArr = [readRational(off), readRational(off + 8), readRational(off + 16)];
              }
              if (tag === 0x0004 && type === 5) {
                const off = tiffOffset + valueOffset;
                lonArr = [readRational(off), readRational(off + 8), readRational(off + 16)];
              }
            }

            const dmsToDec = (dms) => dms ? (dms[0] + dms[1] / 60 + dms[2] / 3600) : null;
            if (latArr && lonArr) {
              gpsLat = dmsToDec(latArr) * (latRef === "S" ? -1 : 1);
              gpsLon = dmsToDec(lonArr) * (lonRef === "W" ? -1 : 1);
            }
          }
          return { dateTimeOriginal, gpsLat, gpsLon };
        } else {
          offset += size - 2;
        }
      }
    } catch (error) {
      console.warn("EXIF parsing error:", error);
    }
    return {};
  };

  const compressImage = (file, maxDim = 1600, maxKB = 500) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get 2D context"));
      ctx.drawImage(img, 0, 0, w, h);

      const tryQuality = (q, cb) => canvas.toBlob(cb, "image/jpeg", q);

      const attempt = (q) => {
        tryQuality(q, (blob) => {
          if (!blob) return reject(new Error("Blob creation failed"));
          if (blob.size / 1024 <= maxKB || q <= 0.5) {
            return resolve(blob);
          }
          attempt(q - 0.1);
        });
      };
      attempt(0.92);
    };
    img.onerror = reject;
    const url = URL.createObjectURL(file);
    img.src = url;
  });

  const handleClose = () => {
    triggerHaptic('light');
    playSound('click');
    setOpen(false);
    setShowShareDialog(false);
    setSavedCatchData(null);
    setAiAnalysisData(null);
    setShowAiConfirmDialog(false);
    setPendingOfflinePhotoId(null);
    setForm({
      species: "",
      spot_id: "",
      length_cm: "",
      weight_kg: "",
      bait_used: "",
      notes: "",
      catch_time: toLocalDatetimeInputValue(new Date()),
      photo_url: ""
    });
  };

  const handleShareToCommunity = async () => {
    if (!savedCatchData) return;

    setIsSharing(true);
    try {
      const catchText = `Mein Fang: ${savedCatchData.species}${savedCatchData.length_cm ? ` (${savedCatchData.length_cm}cm)` : ''}${savedCatchData.weight_kg ? `, ${savedCatchData.weight_kg}kg` : ''}${savedCatchData.bait_used ? `\nKöder: ${savedCatchData.bait_used}` : ''}${savedCatchData.notes ? `\n\n${savedCatchData.notes}` : ''}`;

      await entities.Post.create({
        text: catchText,
        photo_url: savedCatchData.photo_url || null,
        likes: 0,
        reported: false
      });

      playSound('success');
      toast.success("Fang in der Community geteilt!");
      setShowShareDialog(false);
      setSavedCatchData(null);
      
      setForm({
        species: "",
        spot_id: "",
        length_cm: "",
        weight_kg: "",
        bait_used: "",
        notes: "",
        catch_time: toLocalDatetimeInputValue(new Date()),
        photo_url: ""
      });
    } catch (error) {
      console.error("Fehler beim Teilen:", error);
      playSound('error');
      toast.error("Fehler beim Teilen des Fangs");
    } finally {
      setIsSharing(false);
    }
  };

  useEffect(() => {
    const handler = () => {
      setOpen(true);
    };
    const biteDetectorHandler = () => {
      setShowBiteDetectorPrompt(true);
    };
    window.addEventListener("openCatchDialog", handler);
    window.addEventListener("bite-detector-session-ended", biteDetectorHandler);
    return () => {
      window.removeEventListener("openCatchDialog", handler);
      window.removeEventListener("bite-detector-session-ended", biteDetectorHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    Spot.list()
      .then(spotList => {
        if (isMounted) {
          setSpots(spotList.filter(s => s && s.id));
        }
      })
      .catch((error) => {
        if (isMounted) {
          console.error('Spots laden fehlgeschlagen:', error);
          toast.error('Spots konnten nicht geladen werden.');
        }
      });
    return () => { isMounted = false; };
  }, [open]);

  useEffect(() => {
    const processQueue = async () => {
      const raw = localStorage.getItem("fishmaster_catch_queue");
      const queue = raw ? JSON.parse(raw) : [];
      if (!queue.length) return;
      console.log(`Processing catch queue: ${queue.length} items`);
      const rest = [];
      for (const payload of queue) {
        try {
          await Catch.create(payload);
          console.log("Successfully re-submitted queued catch.");
          playSound('notification');
        } catch (e) {
          console.error("Failed to re-submit queued catch, keeping in queue:", e);
          rest.push(payload);
        }
      }
      localStorage.setItem("fishmaster_catch_queue", JSON.stringify(rest));
      if (rest.length === 0) {
        console.log("Catch queue cleared.");
      }
    };
    window.addEventListener("online", processQueue);
    processQueue();
    return () => window.removeEventListener("online", processQueue);
  }, []);

  const [allRules, setAllRules] = useState([]);

  useEffect(() => {
    if (!open) return;
    RuleEntry.list()
      .then(setAllRules)
      .catch(err => {
        console.error('Fehler beim Laden der Regeln:', err);
        setAllRules([]);
      });
  }, [open]);

  useEffect(() => {
    if (!allRules.length) return;
    const warns = [];
    const speciesLower = String(form.species || "").toLowerCase();
    allRules.filter(r => String(r.fish || "").toLowerCase() === speciesLower).forEach(r => {
      if (r.min_size_cm && form.length_cm && Number(form.length_cm) < r.min_size_cm) warns.push(`Mindestmaß ${r.min_size_cm} cm unterschritten (${form.length_cm} cm).`);
      if (r.closed_from && r.closed_to) {
        const atDate = form.catch_time ? new Date(form.catch_time) : new Date();
        if (isInClosedSeason(r.closed_from, r.closed_to, atDate)) warns.push(`Schonzeit: ${r.closed_from}–${r.closed_to}.`);
      }
    });
    setRuleWarnings(warns);
  }, [form.species, form.length_cm, form.catch_time, allRules]);

  const calculateCatchCredits = (species, lengthCm) => {
    const baseCredits = 100;
    const maxCredits = 1000;
    
    const rarityMultiplier = {
      'Hecht': 1.5,
      'Zander': 1.4, 
      'Wels': 2.0,
      'Forelle': 1.2,
      'Karpfen': 1.3,
      'Barsch': 1.0,
      'Brassen': 0.8,
      'Rotauge': 0.7
    };
    
    const speciesMultiplier = rarityMultiplier[String(species || "")] || 1.0;
    const sizeBonus = lengthCm ? Math.min(lengthCm / 10, 10) : 1;
    
    const calculatedCredits = Math.round(baseCredits * speciesMultiplier * sizeBonus);
    return Math.min(Math.max(calculatedCredits, baseCredits), maxCredits);
  };

  const saveDraft = () => {
    triggerHaptic('light');
    playSound('click');
    // Korrupter localStorage-Eintrag darf das Speichern nicht crashen
    let drafts;
    try {
      drafts = JSON.parse(localStorage.getItem("fishmaster_drafts") || "[]");
      if (!Array.isArray(drafts)) drafts = [];
    } catch {
      drafts = [];
    }
    drafts.push({ ...form, saved_at: new Date().toISOString() });
    localStorage.setItem("fishmaster_drafts", JSON.stringify(drafts));
    toast.success("Als Entwurf gespeichert (offline verfügbar)");
    handleClose();
  };

  const haversine = (a, b) => {
    const toRad = (x) => x * Math.PI/180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  };

  const assignNearestSpot = async (lat, lon) => {
    const availableSpots = await Spot.list();
    if (!availableSpots.length) return;
    let best = null, bestD = Infinity;
    availableSpots.forEach(s => {
      if (s.latitude && s.longitude) {
        const d = haversine({lat, lon}, {lat: s.latitude, lon: s.longitude});
        if (d < bestD) { bestD = d; best = s; }
      }
    });
    if (best && bestD < 2) {
      setForm(prev => ({ ...prev, spot_id: best.id }));
      toast.info(`Nächster Spot zugewiesen: ${best.name}`);
      triggerHaptic('light');
      playSound('notification');
      console.log(`Assigned nearest spot: ${best.name} (${bestD.toFixed(2)} km away)`);
    } else if (best) {
      console.log(`Nearest spot ${best.name} too far (${bestD.toFixed(2)} km), not auto-assigning.`);
    }
  };

  const save = async () => {
    triggerHaptic('medium');
    const trimmedSpecies = String(form.species || "").trim();
    if (!trimmedSpecies) {
      toast.error("Bitte Fischart eingeben!");
      playSound('error');
      triggerHaptic('light');
      return;
    }
    if (ruleWarnings.length && !confirm(`Hinweise:\n- ${ruleWarnings.join("\n- ")}\nTrotzdem speichern?`)) {
      triggerHaptic('light');
      playSound('click');
      return;
    }

    setIsSaving(true);
    const catchData = {
      species: trimmedSpecies,
      spot_id: form.spot_id || null,
      length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      bait_used: String(form.bait_used || ""),
      notes: String(form.notes || ""),
      catch_time: new Date(form.catch_time).toISOString(),
      photo_url: String(form.photo_url || ""),
      points_earned: form.length_cm ? (1 + Math.floor(parseFloat(form.length_cm)/10)) : 1
    };

    let willShowShareDialog = false;

    try {
      const savedCatch = await createCatchWithOfflineSupport(catchData);
      const wasOffline = !isOnline();

      // Ein offline zwischengespeichertes Foto immer mit dem Fang verknüpfen —
      // auch wenn die Verbindung zwischen Aufnahme und Speichern zurückkam. Die
      // Bedingung `wasOffline` liess das Foto in genau diesem Fall verwaisen.
      // Die echte Server-ID hat Vorrang; offline gibt es nur die Pseudo-ID
      // `__id`, die der Foto-Sync nach dem Fang-Upload selbst übersetzt.
      if (pendingOfflinePhotoId) {
        try {
          const catchIdForPhoto = savedCatch?.id || savedCatch?.__id;
          if (catchIdForPhoto) {
            await updateOfflinePhotoById(pendingOfflinePhotoId, catchIdForPhoto);
            console.log(`Offline-Foto ${pendingOfflinePhotoId} mit Fang ${catchIdForPhoto} verknüpft`);
          }
        } catch (linkError) {
          console.error('Fehler beim Verlinken des offline Fotos mit dem Fang:', linkError);
          // Nicht kritisch — Foto wird trotzdem synced, kann aber nicht zurück zum Fang verlinkt werden
        }
        setPendingOfflinePhotoId(null);
      }

      if (!wasOffline) {
        try {
          const user = await auth.me();
          const credits = calculateCatchCredits(trimmedSpecies, parseFloat(form.length_cm));
          await auth.updateMe({
            credits: (user.credits || 0) + credits,
            total_earned: (user.total_earned || 0) + credits
          });

          playSound('success');

          toast.success(
            `${trimmedSpecies} erfolgreich gespeichert!`,
            {
              description: `${form.length_cm || 'unbekannt'} cm`,
              duration: 4000
            }
          );

          const catchMsg = actionMessages.catchLogged(trimmedSpecies, form.length_cm);
          notifyAction(catchMsg.title, catchMsg);

          analytics.track({
            eventName: "fishing_catch_logged",
            properties: {
              species: trimmedSpecies,
              has_photo: !!form.photo_url,
              has_spot: !!form.spot_id,
              length_cm: form.length_cm ? parseFloat(form.length_cm) : null,
              source: "quick_dialog"
            }
          });

          window.dispatchEvent(new CustomEvent('catch-saved'));

          setSavedCatchData(savedCatch);
          if (form.shareInCommunity) {
            const catchText = `Mein Fang: ${catchData.species}${catchData.length_cm ? ` (${catchData.length_cm}cm)` : ''}${catchData.weight_kg ? `, ${catchData.weight_kg}kg` : ''}${catchData.bait_used ? `\nKöder: ${catchData.bait_used}` : ''}${catchData.notes ? `\n\n${catchData.notes}` : ''}`;
            await entities.Post.create({ text: catchText, photo_url: catchData.photo_url || null, likes: 0, reported: false });
            toast.success("Fang gespeichert und in der Community geteilt!");
          } else {
            setShowShareDialog(true);
            willShowShareDialog = true;
          }
        } catch (creditError) {
          console.error("Credits konnten nicht gutgeschrieben werden:", creditError);
          playSound('warning');
          toast.warning("Fang gespeichert, aber Credits konnten nicht gutgeschrieben werden.");
        }
      } else {
        triggerHaptic('light');
        playSound('notification');
        toast.info(
          "Offline gespeichert",
          {
            description: "Wird automatisch synchronisiert, wenn Internet verfügbar ist",
            duration: 5000
          }
        );
      }

      if (willShowShareDialog) {
        // Nur Hauptdialog schliessen, Share-Dialog und savedCatchData bleiben erhalten
        setOpen(false);
        setAiAnalysisData(null);
        setShowAiConfirmDialog(false);
        setForm({
          species: "",
          spot_id: "",
          length_cm: "",
          weight_kg: "",
          bait_used: "",
          notes: "",
          catch_time: toLocalDatetimeInputValue(new Date()),
          photo_url: ""
        });
      } else {
        handleClose();
      }
    } catch (e) {
      console.error("Fehler beim Speichern des Fangs:", e);
      triggerHaptic('light');
      playSound('error');
      toast.error("Fehler beim Speichern des Fangs");
    } finally {
      setIsSaving(false);
    }
  };

  const upload = async (file) => {
    triggerHaptic('light');
    playSound('click');

    try {
      let exif = {};
      try {
        exif = await parseEXIF(file);
      } catch (e) {
        console.warn("EXIF parsing failed:", e);
      }

      if (exif?.dateTimeOriginal) {
        const safeDateTime = String(exif.dateTimeOriginal).slice(0,16);
        setForm(prev => ({ ...prev, catch_time: safeDateTime }));
        toast.info("Fangzeit aus Bild-Metadaten übernommen.");
        triggerHaptic('light');
        playSound('notification');
      }
      if (exif?.gpsLat && exif?.gpsLon) {
        assignNearestSpot(exif.gpsLat, exif.gpsLon);
      }

      let blob = file;
      try {
        blob = await compressImage(file, 1600, 500);
      } catch (e) {
        console.warn("Image compression failed, uploading original file:", e);
      }

      toast.info(`Lade Bild hoch: ${file.name}`);
      playSound('loading');
      const fileName = String(file.name || "fang") + ".jpg";
      const f = new File([blob], fileName, { type: "image/jpeg" });
      const result = await UploadFile({ file: f });
      const file_url = result?.file_url;
      if (!file_url) {
        throw new Error("Keine Datei-URL in der Antwort erhalten");
      }
      setForm(prev=>({ ...prev, photo_url: file_url }));
      toast.success("Bild hochgeladen. Klicke auf KI-Analyse zum automatischen Ausfüllen.");
      playSound('success');
      triggerHaptic('light');
    } catch (error) {
      console.error("Upload-Fehler:", error);
      playSound('error');
      triggerHaptic('light');
      const errorMsg = error?.message || "Fehler beim Hochladen des Bildes";
      toast.error(errorMsg);
    }
  };

  const handleAcceptAiAnalysis = () => {
    if (!aiAnalysisData) return;
    
    triggerHaptic('medium');
    playSound('success');
    
    setForm(prev => ({
      ...prev,
      species: aiAnalysisData.species_name || prev.species,
      length_cm: aiAnalysisData.length_cm || prev.length_cm,
      weight_kg: aiAnalysisData.weight_kg || prev.weight_kg,
      bait_used: aiAnalysisData.bait_used || prev.bait_used
    }));
    
    toast.success("KI-Daten übernommen!");
    setShowAiConfirmDialog(false);
    setAiAnalysisData(null);
  };

  const handleRejectAiAnalysis = () => {
    triggerHaptic('light');
    playSound('click');
    setShowAiConfirmDialog(false);
    setAiAnalysisData(null);
  };

  const requestBrowserLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        assignNearestSpot(pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  };

  const handleSmartPhotoCapture = async (file) => {
    if (!file) return;
    triggerHaptic('medium');
    playSound('click');
    setIsAnalyzing(true);

    try {
      let exif = {};
      try { exif = await parseEXIF(file); } catch {}

      if (exif?.dateTimeOriginal) {
        const safeDateTime = String(exif.dateTimeOriginal).slice(0, 16);
        setForm(prev => ({ ...prev, catch_time: safeDateTime }));
      }

      let hasGps = false;
      if (exif?.gpsLat && exif?.gpsLon) {
        assignNearestSpot(exif.gpsLat, exif.gpsLon);
        hasGps = true;
      }

      let blob = file;
      try { blob = await compressImage(file, 1600, 500); } catch {}

      toast.info("Bild wird hochgeladen und analysiert...");
      playSound('loading');
      const fileName = String(file.name || "fang") + ".jpg";
      const f = new File([blob], fileName, { type: "image/jpeg" });
      let file_url = null;

      try {
        const result = await UploadFile({ file: f });
        file_url = result?.file_url;
      } catch (uploadError) {
        // If offline or upload fails, save photo to IndexedDB for later sync
        if (!isOnline()) {
          console.log('Offline — Foto wird lokal gespeichert und später synchronisiert');
          const photoId = await saveOfflinePhoto(blob);
          setPendingOfflinePhotoId(photoId);
          toast.info("Foto offline gespeichert. Wird später automatisch hochgeladen.");
          playSound('notification');
          setIsAnalyzing(false);
          return;
        } else {
          throw uploadError;
        }
      }

      if (!file_url) throw new Error("Keine Datei-URL erhalten");

      setForm(prev => ({ ...prev, photo_url: file_url }));

      if (!hasGps) requestBrowserLocation();

      const analysisResult = await functions.invoke('analyzeCatchPhoto', { file_url });
      const data = analysisResult?.data;

      if (data?.result_data) {
        const ai = data.result_data;
        setForm(prev => ({
          ...prev,
          species: ai.species_name || prev.species,
          length_cm: ai.length_cm || prev.length_cm,
          weight_kg: ai.weight_kg || prev.weight_kg,
          bait_used: ai.bait_used || prev.bait_used,
        }));
        playSound('success');
        triggerHaptic('medium');

        const parts = [];
        if (ai.species_name) parts.push(ai.species_name);
        if (ai.length_cm) parts.push(`${ai.length_cm} cm`);
        if (ai.weight_kg) parts.push(`${ai.weight_kg} kg`);
        const confText = ai.confidence ? ` (${Math.round(ai.confidence * 100)}% sicher)` : '';
        toast.success(`KI erkannt: ${parts.join(', ')}${confText}`);
      } else {
        toast.warning("Foto hochgeladen, aber KI konnte keinen Fisch erkennen. Bitte manuell ausfüllen.");
        playSound('warning');
      }
    } catch (error) {
      console.error("Smart-Capture-Fehler:", error);
      playSound('error');
      toast.error(error?.message || "Fehler bei der Bildanalyse");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!open && !showShareDialog && !showBiteDetectorPrompt) return null;
  
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={handleClose}>
          <Card className="w-full max-w-xl glass-morphism border-gray-800 rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white text-lg font-semibold">{t('catch.title')}</h3>
          <Button variant="ghost" onClick={handleClose}>{t('common.close')}</Button>
        </div>
        {ruleWarnings.length > 0 && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>
              {ruleWarnings.map((w, i) => <div key={i}>• {w}</div>)}
            </AlertDescription>
          </Alert>
        )}
        <div className="overflow-y-auto pr-1" style={{maxHeight: 'calc(85vh - 160px)'}}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-2">
              <label className="text-sm text-gray-400">Fisch-Foto</label>
              <label className={`flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg border-2 border-dashed text-sm font-medium cursor-pointer transition-colors ${isAnalyzing ? 'border-cyan-500 bg-cyan-900/20 text-cyan-300 animate-pulse' : form.photo_url ? 'border-emerald-600 bg-emerald-900/20 text-emerald-300' : 'border-cyan-600 bg-cyan-900/10 text-cyan-400 hover:bg-cyan-900/20'}`}>
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Bild wird analysiert...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Foto aufnehmen / KI-Erkennung
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => e.target.files[0] && handleSmartPhotoCapture(e.target.files[0])}
                  className="hidden"
                  disabled={isAnalyzing}
                />
              </label>
              {form.photo_url && (
                <div className="relative">
                  <img src={form.photo_url} alt="Fang" className="h-36 rounded-xl object-cover w-full" />
                  <button type="button"
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, photo_url: "" }))}
                    className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )}
              {form.photo_url && !isAnalyzing && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-cyan-600 text-cyan-400 hover:bg-cyan-900/30 text-sm"
                  onClick={async () => {
                    setIsAnalyzing(true);
                    try {
                      const analysisResult = await functions.invoke('analyzeCatchPhoto', { file_url: form.photo_url });
                      const data = analysisResult?.data;
                      if (data?.result_data) {
                        setAiAnalysisData(data.result_data);
                        setShowAiConfirmDialog(true);
                        playSound('notification');
                        triggerHaptic('medium');
                      } else {
                        toast.warning("KI-Analyse konnte nicht durchgeführt werden");
                      }
                    } catch (error) {
                      console.error("KI-Analyse-Fehler:", error);
                      toast.warning("KI-Analyse fehlgeschlagen");
                    } finally {
                      setIsAnalyzing(false);
                    }
                  }}
                >
                  Erneut analysieren
                </Button>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 select-none py-1">
                <input
                  type="checkbox"
                  checked={form.shareInCommunity || false}
                  onChange={(e) => setForm({ ...form, shareInCommunity: e.target.checked })}
                  className="w-4 h-4 rounded accent-cyan-500"
                />
                In der Community posten
              </label>
            </div>
            <Input placeholder={t('catch.species')} value={form.species}
              onBlur={e => { toast.info(`${t('catch.species')}: ${e.target.value}`); triggerHaptic('light'); playSound('pop'); }}
              onChange={(e) => { setForm({...form, species: e.target.value || ""}); triggerHaptic('light'); playSound('pop'); }}
              className="bg-gray-800/50 border-gray-700 text-white" />
            <MobileSelect
              value={form.spot_id || ""}
              onValueChange={(v) => {
                setForm({...form, spot_id: v});
                const spotName = spots.find(s => s.id === v)?.name || 'Kein Spot';
                toast.info(`Spot: ${spotName}`);
                triggerHaptic('light');
                playSound('click');
              }}
              placeholder={t('catch.spot')}
              label={t('catch.spot')}
              options={spots.map(s => s.id && ({ value: s.id, label: s.name || 'Unbenannt' })).filter(Boolean)}
              className="bg-gray-800/50 border-gray-700 text-white"
            />
            <Input type="number" placeholder={t('catch.length')} value={form.length_cm}
              onBlur={e => { toast.info(`${t('catch.length')}: ${e.target.value} cm`); triggerHaptic('light'); playSound('pop'); }}
              onChange={(e) => { setForm({...form, length_cm: e.target.value || ""}); triggerHaptic('light'); playSound('pop'); }}
              className="bg-gray-800/50 border-gray-700 text-white" />
            <Input type="number" step="0.1" placeholder={t('catch.weight')} value={form.weight_kg}
              onBlur={e => { toast.info(`${t('catch.weight')}: ${e.target.value} kg`); triggerHaptic('light'); playSound('pop'); }}
              onChange={(e) => { setForm({...form, weight_kg: e.target.value || ""}); triggerHaptic('light'); playSound('pop'); }}
              className="bg-gray-800/50 border-gray-700 text-white" />
            <Input placeholder={t('catch.bait')} value={form.bait_used}
              onBlur={e => { toast.info(`${t('catch.bait')}: ${e.target.value}`); triggerHaptic('light'); playSound('pop'); }}
              onChange={(e) => { setForm({...form, bait_used: e.target.value || ""}); triggerHaptic('light'); playSound('pop'); }}
              className="bg-gray-800/50 border-gray-700 text-white" />
            <Input type="datetime-local" value={form.catch_time}
              onBlur={e => { toast.info(`Fangzeit geändert`); triggerHaptic('light'); playSound('pop'); }}
              onChange={(e) => { setForm({...form, catch_time: e.target.value || ""}); triggerHaptic('light'); playSound('pop'); }}
              className="bg-gray-800/50 border-gray-700 text-white" />
            <Input placeholder={t('catch.notes')} value={form.notes}
              onBlur={e => { toast.info(`Notiz hinzugefügt`); triggerHaptic('light'); playSound('pop'); }}
              onChange={(e) => { setForm({...form, notes: e.target.value || ""}); triggerHaptic('light'); playSound('pop'); }}
              className="bg-gray-800/50 border-gray-700 text-white sm:col-span-2" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={saveDraft}>{t('catch.save_draft')}</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={save} disabled={isSaving}>
                {isSaving ? `${t('common.loading')}` : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
      )}

      <Dialog open={showAiConfirmDialog} onOpenChange={setShowAiConfirmDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-cyan-400">KI-Analyse abgeschlossen</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-300 mb-4">
              Die KI hat dein Bild analysiert. Möchtest du die erkannten Daten automatisch übernehmen?
            </p>
            
            {aiAnalysisData && (
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                {aiAnalysisData.species_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fischart:</span>
                    <span className="text-white font-semibold">{aiAnalysisData.species_name}</span>
                  </div>
                )}
                {aiAnalysisData.length_cm && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Länge:</span>
                    <span className="text-white font-semibold">{aiAnalysisData.length_cm} cm</span>
                  </div>
                )}
                {aiAnalysisData.weight_kg && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gewicht:</span>
                    <span className="text-white font-semibold">{aiAnalysisData.weight_kg} kg</span>
                  </div>
                )}
                {aiAnalysisData.bait_used && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Köder:</span>
                    <span className="text-white font-semibold">{aiAnalysisData.bait_used}</span>
                  </div>
                )}
                {aiAnalysisData.confidence && (
                  <div className="flex justify-between mt-3 pt-3 border-t border-gray-700">
                    <span className="text-gray-400 text-sm">Genauigkeit:</span>
                    <span className="text-cyan-400 text-sm">{Math.round(aiAnalysisData.confidence * 100)}%</span>
                  </div>
                )}
              </div>
            )}
            
            <p className="text-gray-400 text-xs mt-4">
              Du kannst die Werte später noch manuell anpassen.
            </p>
          </div>
          
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRejectAiAnalysis}
              className="border-gray-700 text-gray-300 hover:bg-gray-700"
            >
              Manuell eingeben
            </Button>
            <Button
              onClick={handleAcceptAiAnalysis}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              Daten übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBiteDetectorPrompt} onOpenChange={setShowBiteDetectorPrompt}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Hast du was gefangen?</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-gray-400 text-sm">
              Deine Bissanzeiger-Session ist beendet. Moechtest du einen Fang eintragen?
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBiteDetectorPrompt(false)}
              className="border-gray-700 text-gray-300 hover:bg-gray-700"
            >
              Nein, danke
            </Button>
            <Button
              onClick={() => {
                setShowBiteDetectorPrompt(false);
                setForm(prev => ({ ...prev, catch_time: toLocalDatetimeInputValue(new Date()) }));
                setOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Ja, Fang eintragen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-cyan-400">In Community teilen?</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <p className="text-gray-300 mb-3 text-sm">
              Möchtest du diesen Fang mit der Community teilen?
            </p>

            {savedCatchData?.photo_url && (
              <div className="relative w-full h-40 sm:h-48 rounded-lg overflow-hidden mb-3">
                <img
                  src={savedCatchData.photo_url}
                  alt={savedCatchData.species}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {savedCatchData && (
              <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
                <p className="text-white font-semibold">{savedCatchData.species}</p>
                {savedCatchData.length_cm && (
                  <p className="text-gray-300 text-sm">Länge: {savedCatchData.length_cm} cm</p>
                )}
                {savedCatchData.weight_kg && (
                  <p className="text-gray-300 text-sm">Gewicht: {savedCatchData.weight_kg} kg</p>
                )}
                {savedCatchData.bait_used && (
                  <p className="text-gray-300 text-sm">Köder: {savedCatchData.bait_used}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowShareDialog(false);
                setSavedCatchData(null);
                setForm({
                  species: "",
                  spot_id: "",
                  length_cm: "",
                  weight_kg: "",
                  bait_used: "",
                  notes: "",
                  catch_time: toLocalDatetimeInputValue(new Date()),
                  photo_url: ""
                });
              }}
              disabled={isSharing}
              className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-700 min-h-[44px]"
            >
              Nein, danke
            </Button>
            <Button
              onClick={handleShareToCommunity}
              disabled={isSharing}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 min-h-[44px]"
            >
              {isSharing ? "Wird geteilt..." : "Jetzt teilen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}