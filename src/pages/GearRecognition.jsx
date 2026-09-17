import React, { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="bg-gray-800/60 border-gray-700/50">
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-white text-sm">{item.name}</p>
            <p className="text-xs text-gray-400">{item.category}</p>
            {item.brand && <p className="text-xs text-cyan-400">{item.brand}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className={`text-xs ${condCls}`}>{item.condition}</Badge>
            <span className="text-xs text-gray-500">{confLabel} ({confPct}%)</span>
          </div>
        </div>

        {item.description && (
          <p className="text-xs text-gray-400">{item.description}</p>
        )}

        {item.useCase && (
          <p className="text-xs text-gray-500 italic">Einsatz: {item.useCase}</p>
        )}

        <Button
          size="sm"
          className="w-full mt-2 bg-cyan-700 hover:bg-cyan-600 text-white h-8 text-xs"
          disabled={adding}
          onClick={() => onAdd(item)}
        >
          {adding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
          ) : (
            <Plus className="w-3.5 h-3.5 mr-1.5" />
          )}
          Zur Ausrüstung hinzufügen
        </Button>
      </CardContent>
    </Card>
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
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <Wrench className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-bold text-white">Ausrüstungserkennung</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Kamera / Foto */}
        {!photoPreview && !cameraActive && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={startCamera}
              className="flex flex-col items-center gap-2 py-6 rounded-2xl border-2 border-dashed border-cyan-700/50 hover:border-cyan-600 bg-gray-800/40 hover:bg-gray-800/60 transition"
            >
              <Camera className="w-8 h-8 text-cyan-400" />
              <span className="text-sm text-gray-300">Foto aufnehmen</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 py-6 rounded-2xl border-2 border-dashed border-gray-700/50 hover:border-gray-600 bg-gray-800/40 hover:bg-gray-800/60 transition"
            >
              <Upload className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-300">Bild hochladen</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>
        )}

        {/* Live-Kamera */}
        {cameraActive && (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-4 inset-x-0 flex justify-center gap-3">
              <Button
                onClick={capturePhoto}
                className="bg-white text-black hover:bg-gray-100 font-bold px-6"
              >
                <Camera className="w-4 h-4 mr-2" />
                Aufnehmen
              </Button>
              <Button variant="outline" onClick={() => { stopCamera(); }} className="border-gray-600 text-gray-300">
                <X className="w-4 h-4" />
              </Button>
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
                className="absolute top-2 right-2 p-1.5 rounded-full bg-gray-900/80 hover:bg-gray-900 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Laden */}
        {loading && (
          <div className="flex flex-col items-center py-10 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-sm text-gray-400">KI analysiert deine Ausrüstung …</p>
          </div>
        )}

        {/* Fehler */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-900/20 border border-red-800/40">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Ergebnisse */}
        {result && !loading && (
          <>
            {result.generalNotes && (
              <Card className="bg-gray-800/40 border-gray-700/40">
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs text-gray-300">{result.generalNotes}</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
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
                <AlertCircle className="w-8 h-8 text-amber-500" />
                <p className="text-sm text-gray-400">Keine Ausrüstung erkannt. Versuche ein klareres Foto.</p>
              </div>
            )}

            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={reset} className="text-gray-500 hover:text-white text-xs">
                Neues Foto
              </Button>
            </div>
          </>
        )}

        {/* Leer-Zustand */}
        {!photoPreview && !loading && !cameraActive && (
          <Card className="bg-gray-800/30 border-gray-700/30">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-gray-500 text-center">
                Fotografiere deine Rute, Rolle, Köder oder Setup. Die KI erkennt die Ausrüstung und hilft dir beim Einpflegen.
              </p>
              <p className="text-xs text-gray-600 text-center mt-2">
                Erkannte Gegenstände kannst du direkt zur Ausrüstungsliste hinzufügen.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
