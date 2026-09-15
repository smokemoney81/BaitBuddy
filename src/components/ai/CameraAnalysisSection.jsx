import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Camera, Play, Square, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { User } from "@/entities/User";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ai } from "@/api/frontendClient";

import PlanGuard from "@/components/premium/PlanGuard";

export default function CameraAnalysisSection() {
  return (
    <PlanGuard requiredPlan="elite" featureName="KI-Echtzeit-Fischerkennung">
      <CameraAnalysisSectionInner />
    </PlanGuard>
  );
}

function CameraAnalysisSectionInner() {
  const [user, setUser] = useState(null);
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null); // New state for analysis result

  useEffect(() => {
    const loadUser = async () => {
      try {
        setUser(await User.me());
      } catch (e) {
        console.log("User not logged in:", e);
      }
    };
    loadUser();
  }, []);

  // Cleanup effect for camera stream
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      setError(null);
      setIsStarting(true);
      setAnalysisResult(null); // Clear any previous analysis result

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        // Wichtig: Diese Attribute müssen gesetzt sein
        videoRef.current.setAttribute('autoplay', '');
        videoRef.current.setAttribute('playsinline', '');
        videoRef.current.setAttribute('muted', '');

        // Warte bis das Video geladen ist
        // Using a Promise to wait for the 'loadedmetadata' event before attempting to play
        await new Promise((resolve, reject) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().then(resolve).catch(reject);
            };
            // If metadata is already loaded (e.g., if re-attaching same stream), play directly
            if (videoRef.current.readyState >= 2) { // HAVE_CURRENT_DATA or higher
              videoRef.current?.play().then(resolve).catch(reject);
            }
          } else {
            reject(new Error("Video element not available"));
          }
        });
      }

      setStream(newStream);
      setIsCameraActive(true);
      toast.success("Kamera gestartet");
    } catch (err) {
      console.error("Kamera-Fehler:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Kamera-Zugriff verweigert. Bitte erlaube den Zugriff in deinen Browser-Einstellungen.");
        toast.error("Kamera-Zugriff verweigert");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("Keine Kamera gefunden. Bitte stelle sicher, dass eine Kamera angeschlossen und verfügbar ist.");
        toast.error("Keine Kamera gefunden");
      } else {
        setError(err.message);
        toast.error("Kamera konnte nicht gestartet werden: " + err.message);
      }
    } finally {
      setIsStarting(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
      setIsCameraActive(false);
      setAnalysisResult(null); // Clear analysis result when camera stops
      toast.info("Kamera gestoppt");
    }
  };

  const analyzeFrame = async () => {
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      if (!videoRef.current) {
        throw new Error("Video-Element nicht verfügbar");
      }

      // Capture frame from video stream to canvas
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Canvas-Kontext nicht verfügbar");
      }

      // Draw frame (mirror horizontally as shown on screen)
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, -canvas.width, 0);
      ctx.scale(-1, 1);

      // Convert canvas to base64 (without data-URL prefix)
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      if (!imageBase64) {
        throw new Error("Frame konnte nicht erfasst werden");
      }

      // Send to AI vision endpoint via frontendClient
      const result = await ai.vision(imageBase64);
      setAnalysisResult(result.analysis || 'Analyse abgeschlossen');
      toast.success("Analyse abgeschlossen!");
    } catch (err) {
      console.error("Analysis error:", err);
      toast.error("Analyse fehlgeschlagen: " + (err.message || "Unbekannter Fehler"));
      setAnalysisResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Placeholder for freezing the camera feed
  const handleFreeze = () => {
    console.log("Freezing camera feed...");
    if (isCameraActive && videoRef.current) {
      // In a real application, you would capture the current frame here (e.g., to a canvas)
      // and send that image data to your AI for analysis.
      analyzeFrame();
    } else {
      toast.error("Kamera ist nicht aktiv, um einen Frame einzufrieren.");
    }
  };

  // Premium-Check temporär deaktiviert - alle Features frei
  return (
    <Card className="glass-morphism border-gray-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-primary drop-shadow-[0_0_12px_rgba(var(--primary),0.7)]">
          KI-Kamera
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Nutze deine Kamera zur Live-Analyse von Fischen, Gewässern und Angelumgebung.
          Die KI erkennt Fischarten und gibt dir Echtzeit-Empfehlungen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-destructive text-sm" role="alert">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          {!isCameraActive ? (
            <Button
              onClick={startCamera}
              disabled={isStarting}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-xs h-9 flex-1"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Startet...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  Analyse starten
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                onClick={stopCamera}
                variant="destructive"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-xs h-9 flex-1"
              >
                <Square className="w-3 h-3 mr-1" />
                Kamera stoppen
              </Button>

              <Button
                onClick={handleFreeze}
                variant="outline"
                size="sm"
                className="border-primary/50 hover:bg-primary/20 text-primary text-xs h-9 flex-1"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Analysiere...
                  </>
                ) : (
                  <>
                    <Camera className="w-3 h-3 mr-1" />
                    Einfrieren & Analyse
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{
              transform: 'scaleX(-1)', // Flip horizontally for selfie-like view
              display: isCameraActive ? 'block' : 'none'
            }}
          />

          {!isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <div className="text-center text-muted-foreground">
                <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Kamera inaktiv</p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                <p className="text-foreground text-sm">KI analysiert...</p>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Result */}
        <AnimatePresence>
          {analysisResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/30 rounded-lg p-4"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-foreground font-semibold mb-2 text-sm">KI-Analyse Ergebnis</h4>
                  <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap">
                    {analysisResult}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}