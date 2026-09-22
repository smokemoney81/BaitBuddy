import React, { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Upload, ArrowLeft, Loader2, X, AlertCircle, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ai, entities } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PremiumGuard from "@/components/premium/PremiumGuard";

const CONDITION_COLOR = {
  "Neu":                "bg-green-900/40 text-green-300 border-green-700",
  "Gut":                "bg-blue-900/40 text-blue-300 border-blue-700",
  "Gebraucht":          "bg-amber-900/40 text-amber-300 border-amber-700",
  "Wartungsbedürftig":  "bg-red-900/40 text-red-300 border-red-700",
};

const CONFIDENCE_LABEL = (c) => {
  if (c >= 0.85) return "Sicher";
  if (c >= 0.65) return "Wahrscheinlich";
  return "Unsicher";
};

function GearItemCard({ item, onAdd, adding }) {
  const condCls = CONDITION_COLOR[item.condition] || CONDITION_COLOR["Gebraucht"];
  const confLabel = CONFIDENCE_LABEL(item.confidence ?? 0.5);
  const confPct = Math.round((item.confidence ?? 0.5) * 100);

  return (
    <div className="bb-card" style={{ background: 'var(--bb-surface)' }}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-sm" style={{ color: 'var(--bb-text)' }}>{item.name}</p>
            <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{item.category}</p>
            {item.brand && <p className="text-xs" style={{ color: 'var(--bb-cyan)' }}>{item.brand}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`bb-pill-info text-xs border ${condCls}`}>{item.condition}</span>
            <span className="text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>{confLabel} ({confPct}%)</span>
          </div>
        </div>

        {item.description && (
          <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{item.description}</p>
        )}

        {item.useCase && (
          <p className="text-xs italic" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>Einsatz: {item.useCase}</p>
        )}

        <button
          className="bb-action w-full mt-2 text-xs h-8"
          style={{ background: '#0e7490' }}
          disabled={adding}
          onClick={() => onAdd(item)}
        >
          {adding ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Plus size={14} className="mr-1.5" />
          )}
          Zur Ausrüstung hinzufügen
        </button>
      </div>
    </div>
  );
}

export default function GearRecognition() {
  return (
    <PremiumGuard requiredPlan="basic" feature="Ausrüstungserkennung per Foto">
      <GearRecognitionInner />
    </PremiumGuard>
  );
}

function GearRecognitionInner() {
  useFeatureTracking("gear_recognition");
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [photo, setPhoto] = useState(null); // base64
  const [photoPreview, setPhotoPreview] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [addingItem, setAddingItem] = useState(null);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
      setCameraActive(false);
    }
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(s);
      setCameraActive(true);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (e) {
      setError("Kamerazugriff verweigert. Bitte Kamera-Permission erteilen oder ein Foto hochladen.");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    setPhoto(base64);
    setPhotoPreview(canvas.toDataURL("image/jpeg", 0.85));
    stopCamera();
    analyzePhoto(base64);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Nur Bilddateien erlaubt"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Bild zu groß (max. 10MB)"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(",")[1];
      setPhoto(base64);
      setPhotoPreview(dataUrl);
      setResult(null);
      analyzePhoto(base64);
    };
    reader.readAsDataURL(file);
  };

  const analyzePhoto = async (base64) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await ai.recognizeGear(base64);
      setResult(res);
    } catch (e) {
      setError(e?.message || "Analyse fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (item) => {
    setAddingItem(item.name);
    try {
      await entities.GearItem.create({
        name: item.name,
        category: item.category || "Sonstiges",
        brand: item.brand || null,
        condition: item.condition || "Gut",
        notes: item.description ? `${item.description}${item.useCase ? ` | Einsatz: ${item.useCase}` : ""}` : null,
        ai_recognized: true,
        confidence: item.confidence || null,
      });
      toast.success(`${item.name} zur Ausrüstung hinzugefügt`);
    } catch (e) {
      toast.error("Fehler beim Speichern: " + (e?.message || "Unbekannter Fehler"));
    } finally {
      setAddingItem(null);
    }
  };

  const reset = () => {
    setPhoto(null);
    setPhotoPreview(null);
    setResult(null);
    setError(null);
    stopCamera();
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bb-bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur px-4 py-3" style={{ background: 'var(--bb-surface)', borderBottom: '1px solid var(--bb-border)' }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg" style={{ color: 'var(--bb-muted)' }}>
            <ArrowLeft size={20} />
          </button>
          <Wrench size={20} style={{ color: 'var(--bb-cyan)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--bb-text)' }}>Ausrüstungserkennung</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Kamera / Foto */}
        {!photoPreview && !cameraActive && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={startCamera}
              className="flex flex-col items-center gap-2 py-6 rounded-2xl border-2 border-dashed transition"
              style={{ borderColor: 'rgba(6,182,212,0.4)', background: 'var(--bb-surface)' }}
            >
              <Camera size={32} style={{ color: 'var(--bb-cyan)' }} />
              <span className="text-sm" style={{ color: 'var(--bb-muted)' }}>Foto aufnehmen</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 py-6 rounded-2xl border-2 border-dashed transition"
              style={{ borderColor: 'var(--bb-border)', background: 'var(--bb-surface)' }}
            >
              <Upload size={32} style={{ color: 'var(--bb-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--bb-muted)' }}>Bild hochladen</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>
        )}

        {/* Live-Kamera */}
        {cameraActive && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-4 inset-x-0 flex justify-center gap-3">
              <button
                onClick={capturePhoto}
                className="bb-action font-bold px-6"
                style={{ background: '#fff', color: '#000' }}
              >
                <Camera size={16} className="mr-2" />
                Aufnehmen
              </button>
              <button className="bb-secondary" onClick={() => { stopCamera(); }} style={{ borderColor: 'var(--bb-border)' }}>
                <X size={16} />
              </button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {/* Foto-Vorschau */}
        {photoPreview && (
          <div className="relative rounded-2xl overflow-hidden">
            <img src={photoPreview} alt="Ausrüstungsfoto" className="w-full rounded-2xl object-cover max-h-64" />
            {!loading && (
              <button
                onClick={reset}
                className="absolute top-2 right-2 p-1.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Laden */}
        {loading && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bb-cyan)' }} />
            <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>KI analysiert deine Ausrüstung ...</p>
          </div>
        )}

        {/* Fehler */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          </div>
        )}

        {/* Ergebnisse */}
        {result && !loading && (
          <>
            {result.generalNotes && (
              <div className="bb-card" style={{ background: 'var(--bb-surface)' }}>
                <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{result.generalNotes}</p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: 'var(--bb-muted)' }}>
                {result.items?.length || 0} erkannte Ausrüstungsgegenstände
              </p>
              {(result.items || []).map((item, i) => (
                <GearItemCard
                  key={i}
                  item={item}
                  onAdd={handleAddItem}
                  adding={addingItem === item.name}
                />
              ))}
            </div>

            {(!result.items || result.items.length === 0) && (
              <div className="flex flex-col items-center py-8 gap-2 text-center">
                <AlertCircle size={32} style={{ color: '#f59e0b' }} />
                <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Keine Ausrüstung erkannt. Versuche ein klareres Foto.</p>
              </div>
            )}

            <div className="flex justify-center">
              <button onClick={reset} className="p-2 rounded-lg text-xs" style={{ color: 'var(--bb-muted)' }}>
                Neues Foto
              </button>
            </div>
          </>
        )}

        {/* Leer-Zustand */}
        {!photoPreview && !loading && !cameraActive && (
          <div className="bb-card" style={{ background: 'var(--bb-surface)' }}>
            <p className="text-sm text-center" style={{ color: 'var(--bb-muted)', opacity: 0.7 }}>
              Fotografiere deine Rute, Rolle, Köder oder Setup. Die KI erkennt die Ausrüstung und hilft dir beim Einpflegen.
            </p>
            <p className="text-xs text-center mt-2" style={{ color: 'var(--bb-muted)', opacity: 0.5 }}>
              Erkannte Gegenstände kannst du direkt zur Ausrüstungsliste hinzufügen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
