import React, { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { UploadFile } from "@/integrations/Core";
import { Catch } from "@/entities/Catch";
import { useLocation } from "@/components/location/LocationManager";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useSound } from "@/components/utils/SoundManager";
import {
  Camera,
  SwitchCamera,
  Zap,
  Mic,
  MicOff,
  Download,
  Save,
  MapPin,
  Ruler,
  Video,
  Sparkles,
  Target
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import PremiumGuard from "@/components/premium/PremiumGuard";

export default function CatchCam() {
  return (
    <PremiumGuard requiredPlan="elite" feature="CatchCam – KI-Analyse vom Foto">
      <CatchCamInner />
    </PremiumGuard>
  );
}

function CatchCamInner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recordCanvasRef = useRef(null);

  const { currentLocation } = useLocation();
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();

  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState("environment");

  // burst & snapshots
  const [snapshots, setSnapshots] = useState([]);
  const [burstCount, setBurstCount] = useState(6);
  const [isBursting, setIsBursting] = useState(false);

  // best photo
  const [bestPhoto, setBestPhoto] = useState(null);

  // measure
  const [referenceCm, setReferenceCm] = useState(30);
  const [referencePixelWidth, setReferencePixelWidth] = useState(null);
  const [estimatedCm, setEstimatedCm] = useState(null);
  const [measureMode, setMeasureMode] = useState(false);
  const refClicks = useRef([]);

  // weather overlay
  const [weather, setWeather] = useState(null);

  // audio (voice memo)
  const [audioBlob, setAudioBlob] = useState(null);
  const audioRecorderRef = useRef(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);

  // buddy-lens markers
  const [markers, setMarkers] = useState([]);

  // highlight clip recording
  const mediaRecorderRef = useRef(null);
  const [highlightBlob, setHighlightBlob] = useState(null);
  const [isCreatingClip, setIsCreatingClip] = useState(false);

  // saving
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  useEffect(() => {
    if (currentLocation?.lat && currentLocation?.lon) {
      fetchWeather(currentLocation.lat, currentLocation.lon);
    }
  }, [currentLocation]);

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
      playSound('success');
    } catch (e) {
      console.error("camera start error", e);
      toast.error("Kamera konnte nicht gestartet werden. Erlaube Kamerazugriff.");
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }

  async function fetchWeather(lat, lon) {
    // Demo-Wetterdaten ohne echte API
    setWeather({
      weather: [{ main: "Bewölkt" }],
      main: { temp: 17 },
      wind: { speed: 5 }
    });

    // Falls du echte Wetterdaten willst, erstelle eine Backend-Funktion
    // die den API-Key sicher verwendet
  }

  function takeSnapshot() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    triggerHaptic('medium');
    playSound('click');

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    drawMarkersOnContext(ctx, w, h);

    canvas.toBlob(async (blob) => {
      const imgURL = URL.createObjectURL(blob);
      const item = {
        blob,
        img: imgURL,
        timestamp: Date.now(),
        coords: currentLocation,
      };
      setSnapshots((s) => [item, ...s]);
      toast.success("Snapshot aufgenommen!");
    }, "image/jpeg", 0.92);
  }

  async function doBurst() {
    if (isBursting) return;

    triggerHaptic('heavy');
    playSound('notification');
    setIsBursting(true);

    toast.info(`Burst-Modus: ${burstCount} Fotos werden aufgenommen...`);

    const count = Math.max(3, burstCount);
    const captured = [];

    for (let i = 0; i < count; i++) {
      await new Promise((r) => setTimeout(r, 120));
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      drawMarkersOnContext(ctx, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const imageData = ctx.getImageData(0, 0, w, h);
      const score = computeSharpness(imageData);
      captured.push({ dataUrl, score, timestamp: Date.now(), coords: currentLocation });
      playSound('click');
    }

    captured.sort((a, b) => b.score - a.score);
    const best = captured[0];
    const blob = dataURLtoBlob(best.dataUrl);
    const imgURL = URL.createObjectURL(blob);
    const item = { blob, img: imgURL, timestamp: best.timestamp, coords: best.coords };
    setSnapshots((s) => [item, ...s]);
    setBestPhoto(item);
    setIsBursting(false);

    playSound('success');
    toast.success("Bestes Foto ausgewählt!");
  }

  function drawMarkersOnContext(ctx, w, h) {
    if (!markers || markers.length === 0) return;
    ctx.save();
    markers.forEach((m) => {
      ctx.beginPath();
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 4;
      ctx.arc(m.x * w, m.y * h, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = "20px sans-serif";
      ctx.fillStyle = "#10b981";
      ctx.fillText(m.label, m.x * w + 22, m.y * h + 6);
    });
    ctx.restore();
  }

  function onVideoClick(e) {
    if (measureMode) {
      onMeasureClick(e);
      return;
    }

    const rect = e.target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const label = prompt("Marker-Beschriftung (z. B. 'Hotspot')") || "Hotspot";
    setMarkers((m) => [...m, { x, y, label }]);
    triggerHaptic('selection');
    playSound('selection');
    toast.success(`Marker "${label}" gesetzt`);
  }

  function onMeasureClick(e) {
    const rect = e.target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    refClicks.current.push({ x, y });

    triggerHaptic('light');
    playSound('click');

    if (refClicks.current.length >= 2) {
      const pair = refClicks.current.slice(-2);
      const video = videoRef.current;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const dx = (pair[0].x - pair[1].x) * w;
      const dy = (pair[0].y - pair[1].y) * h;
      const pxWidth = Math.sqrt(dx * dx + dy * dy);
      setReferencePixelWidth(pxWidth);
      refClicks.current = [];
      setMeasureMode(false);

      triggerHaptic('success');
      playSound('success');
      toast.success(`Referenz gemessen: ${Math.round(pxWidth)}px = ${referenceCm}cm`);

      // Auto-Schätzung für Demo
      if (snapshots.length > 0) {
        const fishPx = pxWidth * 0.6; // Annahme: Fisch ist 60% der Referenz
        const cm = (fishPx / pxWidth) * referenceCm;
        setEstimatedCm(Number(cm.toFixed(1)));
      }
    } else {
      toast.info("Klicke einen zweiten Punkt für die Referenz");
    }
  }

  function computeSharpness(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const gray = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    let sum = 0;

    for (let y = 1; y < h - 1; y += 4) {
      for (let x = 1; x < w - 1; x += 4) {
        let val = 0;
        let idx = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const gx = x + kx;
            const gy = y + ky;
            val += gray[gy * w + gx] * kernel[idx++];
          }
        }
        sum += Math.abs(val);
      }
    }
    return sum;
  }

  function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  async function toggleAudioRecording() {
    triggerHaptic('medium');

    if (isRecordingAudio) {
      audioRecorderRef.current.stop();
      setIsRecordingAudio(false);
      playSound('notification');
      toast.info("Aufnahme gestoppt");
      return;
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(s);
      const chunks = [];
      mr.ondataavailable = (ev) => chunks.push(ev.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setAudioBlob(blob);
        playSound('success');
        toast.success("Sprachmemo aufgenommen!");
      };
      mr.start();
      audioRecorderRef.current = mr;
      setIsRecordingAudio(true);
      playSound('notification');
      toast.info("Sprachmemo läuft...");
    } catch (e) {
      console.error(e);
      toast.error("Mikrofon Zugriff verweigert");
    }
  }

  async function createHighlightClip() {
    if (snapshots.length === 0) {
      toast.warning("Keine Snapshots zum Erstellen des Clips.");
      return;
    }

    setIsCreatingClip(true);
    triggerHaptic('heavy');
    toast.info("Erstelle Highlight-Clip...");

    const off = recordCanvasRef.current;
    const w = 1280;
    const h = 720;
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");

    const stream = off.captureStream(25);
    const mr = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp8" });
    const parts = [];
    mr.ondataavailable = (e) => parts.push(e.data);
    mr.start();

    for (let i = 0; i < Math.min(6, snapshots.length); i++) {
      const img = new Image();
      img.src = snapshots[i].img;
      await new Promise((res) => (img.onload = res));
      const frames = 25;

      for (let f = 0; f < frames; f++) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, h - 60, w, 60);
        ctx.fillStyle = "#fff";
        ctx.font = "24px sans-serif";
        const t = new Date(snapshots[i].timestamp).toLocaleString('de-DE');
        ctx.fillText(`Fang um ${t}`, 16, h - 24);
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    mr.stop();
    await new Promise((r) => (mr.onstop = r));
    const blob = new Blob(parts, { type: "video/webm" });
    setHighlightBlob(blob);
    setIsCreatingClip(false);

    playSound('success');
    toast.success("Highlight-Clip erstellt!");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    triggerHaptic('selection');
    playSound('success');
  }

  async function saveBestCatch() {
    if (!bestPhoto) {
      toast.warning("Kein bestes Foto ausgewählt. Mache erst einen Burst!");
      return;
    }

    setIsSaving(true);
    triggerHaptic('heavy');

    try {
      toast.info("Lade Foto hoch...");
      const file = new File([bestPhoto.blob], "catch.jpg", { type: "image/jpeg" });
      const uploadResult = await UploadFile({ file });

      if (!uploadResult || !uploadResult.file_url) {
        throw new Error("Foto-Upload fehlgeschlagen: Ungültige Antwort vom Server");
      }

      const catchData = {
        photo_url: uploadResult.file_url,
        catch_time: new Date(bestPhoto.timestamp).toISOString(),
        length_cm: estimatedCm || null,
        notes: markers.length > 0 ? `Marker: ${markers.map(m => m.label).join(", ")}` : "",
        species: "Unbekannt",
      };

      if (audioBlob) {
        toast.info("Lade Sprachmemo hoch...");
        const audioFile = new File([audioBlob], "voice.webm", { type: "audio/webm" });
        try {
          const audioResult = await UploadFile({ file: audioFile });
          if (audioResult && audioResult.file_url) {
            catchData.notes += ` | Audio: ${audioResult.file_url}`;
          }
        } catch (audioErr) {
          console.warn("Audio-Upload fehlgeschlagen:", audioErr);
          toast.warning("Sprachmemo konnte nicht hochgeladen werden");
        }
      }

      await Catch.create(catchData);

      playSound('success');
      toast.success("Fang erfolgreich gespeichert!");

      // Reset
      setBestPhoto(null);
      setSnapshots([]);
      setMarkers([]);
      setAudioBlob(null);
      setEstimatedCm(null);
    } catch (error) {
      console.error(error);
      playSound('error');
      toast.error("Fehler beim Speichern: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="bb-page" style={{ paddingBottom: '8rem' }}>
      <div className="bb-card mb-6">
        <div className="bb-form-title flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
          <Camera size={24} />
          CatchCam 6-in-1
          <span className="bb-pill-info text-xs ml-auto" style={{ background: 'rgba(147,51,234,0.3)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.5)' }}>Pro</span>
        </div>
        <div className="space-y-6">
          {/* Video Preview */}
          <div className="relative bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              className="w-full aspect-video object-cover"
              autoPlay
              playsInline
              muted
              onClick={onVideoClick}
              style={{ cursor: measureMode ? "crosshair" : "pointer" }}
            />

            {/* HUD Overlays */}
            <div className="absolute top-3 left-3 bg-black/60 text-white px-3 py-2 rounded-lg backdrop-blur-sm">
              <div className="text-sm font-medium">
                {measureMode ? "Messmodus aktiv" : "Buddy-Lens"}
              </div>
              <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                Marker: {markers.length} | Klicks: {refClicks.current.length}
              </div>
            </div>

            <div className="absolute top-3 right-3 bg-black/60 text-white px-3 py-2 rounded-lg backdrop-blur-sm text-sm">
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                {weather && weather.weather?.[0]?.main && weather.main?.temp
                  ? `${weather.weather[0].main}, ${weather.main.temp}°C`
                  : "Wetter lädt..."}
              </div>
              {currentLocation && (
                <div className="text-xs mt-1" style={{ color: 'var(--bb-muted)' }}>
                  {currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}
                </div>
              )}
            </div>

            {isRecordingAudio && (
              <motion.div
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute bottom-3 left-3 text-white px-3 py-2 rounded-lg flex items-center gap-2"
                style={{ background: '#dc2626' }}
              >
                <Mic size={16} />
                Aufnahme läuft...
              </motion.div>
            )}

            {isBursting && (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="absolute bottom-3 right-3 text-white px-3 py-2 rounded-lg flex items-center gap-2"
                style={{ background: '#9333ea' }}
              >
                <Zap size={16} />
                Burst läuft...
              </motion.div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Control Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              className="bb-secondary"
              onClick={() => {
                setFacingMode((f) => (f === "user" ? "environment" : "user"));
                triggerHaptic('selection');
                playSound('click');
              }}
            >
              <SwitchCamera size={16} className="mr-2" />
              Kamera
            </button>

            <button
              className="bb-action"
              style={{ background: '#059669' }}
              onClick={takeSnapshot}
            >
              <Camera size={16} className="mr-2" />
              Snapshot
            </button>

            <button
              className="bb-action"
              style={{ background: '#9333ea' }}
              onClick={doBurst}
              disabled={isBursting}
            >
              <Zap size={16} className="mr-2" />
              Burst ({burstCount})
            </button>

            <button
              className={isRecordingAudio ? "bb-action" : "bb-secondary"}
              style={isRecordingAudio ? { background: '#dc2626' } : {}}
              onClick={toggleAudioRecording}
            >
              {isRecordingAudio ? <MicOff size={16} className="mr-2" /> : <Mic size={16} className="mr-2" />}
              {isRecordingAudio ? "Stop" : "Voice"}
            </button>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Auto-Messung */}
            <div className="bb-card" style={{ background: 'var(--bb-surface)' }}>
              <div className="bb-form-title text-sm flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
                <Ruler size={16} />
                Auto-Messung
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs" style={{ color: 'var(--bb-muted)' }}>Referenz (cm):</label>
                  <Input
                    type="number"
                    value={referenceCm}
                    onChange={(e) => setReferenceCm(Number(e.target.value))}
                    className="bg-gray-800 border-gray-600 mt-1"
                  />
                </div>

                <button
                  className="bb-secondary w-full text-sm"
                  onClick={() => {
                    setMeasureMode(!measureMode);
                    refClicks.current = [];
                    triggerHaptic('selection');
                    if (!measureMode) {
                      toast.info("Klicke 2 Punkte im Video für die Referenz");
                    }
                  }}
                >
                  <Target size={16} className="mr-2" />
                  {measureMode ? "Messmodus beenden" : "Referenz messen"}
                </button>

                {estimatedCm && (
                  <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>Geschätzte Länge:</div>
                    <div className="text-2xl font-bold" style={{ color: '#34d399' }}>{estimatedCm} cm</div>
                  </div>
                )}
              </div>
            </div>

            {/* Highlight Clip */}
            <div className="bb-card" style={{ background: 'var(--bb-surface)' }}>
              <div className="bb-form-title text-sm flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
                <Video size={16} />
                Highlight Clip
              </div>
              <div className="space-y-3">
                <div className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                  Snapshots: {snapshots.length}
                </div>

                <button
                  className="bb-secondary w-full text-sm"
                  onClick={createHighlightClip}
                  disabled={isCreatingClip || snapshots.length === 0}
                >
                  <Sparkles size={16} className="mr-2" />
                  {isCreatingClip ? "Erstelle..." : "Clip erstellen"}
                </button>

                {highlightBlob && (
                  <button
                    className="bb-action w-full text-sm"
                    style={{ background: '#e11d48' }}
                    onClick={() => downloadBlob(highlightBlob, "highlight.webm")}
                  >
                    <Download size={16} className="mr-2" />
                    Clip herunterladen
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Save Best Catch */}
          {bestPhoto && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="rounded-xl p-4" style={{ background: 'linear-gradient(to right, rgba(6,78,59,0.3), rgba(30,58,138,0.3))', border: '1px solid rgba(16,185,129,0.3)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold" style={{ color: '#34d399' }}>Bestes Foto ausgewählt!</div>
                    <div className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                      {estimatedCm && `Geschätzte Länge: ${estimatedCm}cm`}
                    </div>
                  </div>
                  <button
                    className="bb-action"
                    style={{ background: '#059669' }}
                    onClick={saveBestCatch}
                    disabled={isSaving}
                  >
                    <Save size={16} className="mr-2" />
                    {isSaving ? "Speichere..." : "Fang speichern"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Snapshots Gallery */}
      {snapshots.length > 0 && (
        <div className="bb-card">
          <div className="bb-form-title" style={{ color: 'var(--bb-cyan)' }}>Aufnahmen ({snapshots.length})</div>
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {snapshots.map((s, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="rounded-lg overflow-hidden"
                    style={{ border: '1px solid var(--bb-border)', background: 'var(--bb-surface)' }}
                  >
                    <img src={s.img} alt={`snap-${i}`} className="w-full h-36 object-cover" />
                    <div className="p-2 space-y-2">
                      <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                        {new Date(s.timestamp).toLocaleTimeString('de-DE')}
                      </div>
                      <button
                        className="bb-secondary w-full text-xs"
                        onClick={() => downloadBlob(s.blob, `snap_${i}.jpg`)}
                      >
                        <Download size={12} className="mr-1" />
                        Download
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <canvas ref={recordCanvasRef} className="hidden" />
    </div>
  );
}
