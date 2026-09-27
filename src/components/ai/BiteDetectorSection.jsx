import React, { useRef, useEffect, useState, useCallback } from "react";
import { recordTripEvent } from '@/lib/tripLog';
import { toast } from "sonner";
import { User } from "@/entities/User";
import { Activity, BrainCircuit, Crosshair, BellRing, Clock, Fish, ChevronRight } from "lucide-react";
import { useSound } from "@/components/utils/SoundManager";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { setAdContextActive } from "@/lib/adActiveContext";
import BiteDetectorControls from "./BiteDetectorControls";
import BiteDetectorMetrics from "./BiteDetectorMetrics";
import BiteDetectorInstructions from "./BiteDetectorInstructions";

import PlanGuard from "@/components/premium/PlanGuard";

export default function BiteDetectorSection() {
  return (
    <PlanGuard requiredPlan="elite" featureName="Live-Bissanzeiger (Kamera)">
      <BiteDetectorSectionInner />
    </PlanGuard>
  );
}

function BiteDetectorSectionInner() {
  const [_user, setUser] = useState(null);
  const [running, setRunning] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  const [lineScore, setLineScore] = useState(0);
  const [tipScore, setTipScore] = useState(0);
  const [debugInfo, setDebugInfo] = useState("");
  const [error, setError] = useState(null); // New state for error messages
  const [biteEvents, setBiteEvents] = useState([]);

  // Premium Metering (Temporarily disabled)
  const [_sessionId, _setSessionId] = useState(null);
  const [_remainingCredits, _setRemainingCredits] = useState(0);
  const _heartbeatIntervalRef = useRef(null);

  // Refs für DOM-Elemente
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const procCanvasRef = useRef(null);

  // Einstellungen
  const [kLine, setKLine] = useState(3.0);
  const [kTip, setKTip] = useState(3.0);
  const [lockTime, setLockTime] = useState(3.0);

  const runningRef = useRef(false);
  const workerRef = useRef(null);
  const rafIdRef = useRef(null);

  // Werbung während einer laufenden Bisserkennung/Drill-Situation sperren —
  // unabhängig davon, ob dieser Screen zufällig auf einer blacklisteten Route liegt.
  useEffect(() => {
    setAdContextActive('bite_detector', running);
    return () => setAdContextActive('bite_detector', false);
  }, [running]);

  // Internal state für die Bite Detection
  const stateRef = useRef({
    roiLine: null,
    roiTip: null,
    drawing: false,
    mode: null,
    startPt: null,
    timer: null,
    lastAlarm: 0,
    stLine: { prev: null, n: 0, mean: 0, M2: 0, above: 0 },
    stTip: { prev: null, n: 0, mean: 0, M2: 0, above: 0 }
  });

  // Low-CPU params
  const PROC_W = 160;
  const _TARGET_FPS = 10;
  const STRIDE = 4;

  const { playSound } = useSound();
  const { triggerHaptic } = useHaptic();

  useEffect(() => {
    const loadUser = async () => {
      try {
        setUser(await User.me());
      } catch (e) {
        console.log("User not logged in for BiteDetectorSection:", e);
      }
    };
    loadUser();
  }, []);

  // Initialize optimized Web Worker for data processing with robust fallback
  useEffect(() => {
    const initWorker = async () => {
      try {
        // Feature detection: Check if Worker is available and not blocked
        if (typeof Worker === 'undefined') {
          console.warn('[BiteDetector] Worker API not available, using main thread');
          setDebugInfo('worker=unavailable (main thread)');
          return;
        }

        // Attempt Worker creation with CSP/load error handling
        const workerInitPromise = new Promise((resolve, reject) => {
          try {
            let worker;

            // Try primary worker path first
            try {
              worker = new Worker('/workers/biteDetectorOptimized.js');
            } catch (workerLoadError) {
              // CSP violation or 404 - try fallback worker
              console.warn('[BiteDetector] Primary worker load failed, trying fallback:', workerLoadError.message);
              try {
                worker = new Worker('/biteDetectorOptimized.js');
              } catch (fallbackError) {
                reject(new Error(`Worker load failed (CSP/404): ${fallbackError.message}`));
                return;
              }
            }

            // Set up handlers before any message passing
            worker.onmessage = (event) => {
              const { type, result } = event.data;
              if (type === 'frameProcessed' && result) {
                setLineScore(Math.abs(result.z || 0));
                setDebugInfo(
                  `proc=${PROC_W}x${result.procHeight || 'auto'} stride=${STRIDE} ` +
                  `zL=${result.z.toFixed(2)} fps=${result.fps} frames=${result.frameCount} worker=active`
                );
              } else if (type === 'error') {
                console.error('[BiteDetector] Worker error:', result.error);
                setError(`Worker error: ${result.error}`);
              }
            };

            worker.onerror = (error) => {
              console.error('[BiteDetector] Worker runtime error:', error);
              reject(new Error(`Worker runtime error: ${error.message}`));
            };

            // Send init with timeout
            worker.postMessage({ command: 'init', payload: { reset: true } });

            // Confirm worker is responsive within 2 seconds
            const timeoutId = setTimeout(() => {
              try {
                worker.terminate();
              } catch (e) {
                console.warn('[BiteDetector] Error terminating unresponsive worker:', e);
              }
              reject(new Error('Worker initialization timeout (no response in 2s)'));
            }, 2000);

            // Intercept first message to confirm responsiveness
            const originalOnMessage = worker.onmessage;
            worker.onmessage = (event) => {
              clearTimeout(timeoutId);
              worker.onmessage = originalOnMessage;
              resolve(worker);
              originalOnMessage.call(worker, event);
            };

          } catch (e) {
            reject(new Error(`Worker creation error: ${e.message}`));
          }
        });

        // Wait for worker with 3-second timeout total
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Worker creation timeout (3s exceeded)')), 3000)
        );

        workerRef.current = await Promise.race([workerInitPromise, timeoutPromise]);
        console.log('[BiteDetector] Worker initialized successfully');

      } catch (e) {
        // Graceful fallback when Worker is blocked, unavailable, or fails
        console.warn('[BiteDetector] Worker fallback activated:', e.message);
        console.warn('[BiteDetector] Reason:', e.message);
        console.warn('[BiteDetector] Running frame processing on main thread (performance degraded)');
        workerRef.current = null;
        setDebugInfo(`worker=fallback (main: ${e.message.split('(')[0].trim()})`);

        // Don't set error state for worker fallback - it's graceful and expected in CSP environments
        console.info('[BiteDetector] Frame processing will continue on main thread without performance penalty');
      }
    };

    initWorker();

    return () => {
      if (workerRef.current) {
        try {
          workerRef.current.terminate();
          console.log('[BiteDetector] Worker terminated');
        } catch (e) {
          console.warn('[BiteDetector] Error terminating worker:', e.message);
        }
        workerRef.current = null;
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const beep = useCallback(() => {
    try {
      // Use new sound system
      playSound('biteAlert');
      
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
      triggerHaptic('heavy'); // Updated triggerHaptic call

    } catch (e) {
      console.warn("Audio/vibration error:", e);
    }
  }, [playSound, triggerHaptic]);

  const welfordPush = (st, x) => {
    st.n++;
    const d = x - st.mean;
    st.mean += d / st.n;
    const d2 = x - st.mean;
    st.M2 += d * d2;
  };

  const welfordStd = (st) => {
    return st.n > 1 ? Math.sqrt(Math.max(0, st.M2 / (st.n - 1))) : 0;
  };

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const state = stateRef.current;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (state.roiLine) {
      ctx.strokeStyle = 'rgb(34, 211, 238)'; // cyan-400 (accessible on dark mode)
      ctx.lineWidth = 2;
      ctx.strokeRect(state.roiLine.x, state.roiLine.y, state.roiLine.w, state.roiLine.h);
    }
    
    if (state.roiTip) {
      ctx.strokeStyle = 'rgb(245, 158, 11)'; // amber-400 (accessible on dark mode)
      ctx.lineWidth = 2;
      ctx.strokeRect(state.roiTip.x, state.roiTip.y, state.roiTip.w, state.roiTip.h);
    }
  }, []);

  const mapToProc = (rect, canvas, procCanvas) => {
    const sx = procCanvas.width / canvas.width;
    const sy = procCanvas.height / canvas.height;
    return {
      x: Math.max(0, Math.floor(rect.x * sx)),
      y: Math.max(0, Math.floor(rect.y * sy)),
      w: Math.max(1, Math.floor(rect.w * sx)),
      h: Math.max(1, Math.floor(rect.y * sy))
    };
  };

  const energyFor = useCallback((rect, state) => {
    if (!rect) return { e: 0, z: 0 };
    
    const procCanvas = procCanvasRef.current;
    const overlay = overlayRef.current;
    if (!procCanvas || !overlay) return { e: 0, z: 0 };
    
    const pctx = procCanvas.getContext('2d');
    const r = mapToProc(rect, overlay, procCanvas);
    
    const id = pctx.getImageData(r.x, r.y, r.w, r.h);
    const d = id.data;
    
    let sum = 0, count = 0;
    
    if (!state.prev || state.prev.length !== d.length) {
      state.prev = new Uint8ClampedArray(d.length);
    }
    
    for (let i = 0; i < d.length; i += 4 * STRIDE) {
      const y = d[i]; // use red channel only
      const py = state.prev[i];
      sum += Math.abs(y - py);
      state.prev[i] = y;
      count++;
    }
    
    const e = sum / Math.max(1, count);
    const s = welfordStd(state);
    const z = s > 1e-6 ? (e - state.mean) / s : 0;
    
    // update baseline slowly when not alarming
    welfordPush(state, e * 0.05 + state.mean * 0.95);
    
    return { e, z };
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const procCanvas = procCanvasRef.current;
    const state = stateRef.current;
    const overlay = overlayRef.current;
    
    if (!running || !video || !procCanvas || !overlay) return;
    
    const pctx = procCanvas.getContext('2d');
    pctx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height);
    
    const id = pctx.getImageData(0, 0, procCanvas.width, procCanvas.height);
    
    if (workerRef.current && state.roiLine) {
      // Transfer buffer ownership to worker (zero-copy)
      workerRef.current.postMessage({
        command: 'processFrame',
        payload: {
          imageData: id.data.buffer,
          rect: { ...state.roiLine, overlayWidth: overlay.width, overlayHeight: overlay.height },
          procWidth: procCanvas.width,
          procHeight: procCanvas.height
        }
      }, [id.data.buffer]); // Transferable object
    }
    
    const { e: _eL, z: zL } = energyFor(state.roiLine, state.stLine);
    const { e: _eT, z: zT } = energyFor(state.roiTip, state.stTip);
    
    setTipScore(Math.abs(zT));
    
    const armed = (performance.now() - state.lastAlarm) > lockTime * 1000;
    const trig = (state.roiLine && Math.abs(zL) > kLine) || (state.roiTip && Math.abs(zT) > kTip);
    
    if (armed && trig) {
      state.lastAlarm = performance.now();
      const lineHit = state.roiLine && Math.abs(zL) > kLine;
      const biteEvent = {
        id: Date.now(),
        time: Date.now(),
        source: lineHit ? 'Schnur' : 'Rutenspitze',
        strength: Math.max(Math.abs(zL) / kLine, Math.abs(zT) / kTip),
      };
      setBiteEvents(prev => [biteEvent, ...prev].slice(0, 20));
      // Für die Live-Timeline des Anglermodus merken.
      recordTripEvent('bite', { source: biteEvent.source, strength: biteEvent.strength }, biteEvent.time);
      setAlarmActive(true);
      beep();
      setTimeout(() => setAlarmActive(false), 600);
    }
    
    const workerStatus = workerRef.current ? 'active' : 'fallback';
    setDebugInfo(`proc=${procCanvas.width}x${procCanvas.height} stride=${STRIDE} zL=${zL.toFixed(2)} zT=${zT.toFixed(2)} worker=${workerStatus}`);
  }, [running, kLine, kTip, lockTime, energyFor, beep]);

  // Document visibility state to stop processing when tab is inactive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && runningRef.current) {
        console.log('[BiteDetector] Tab hidden - pausing frame processing');
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          if (typeof rafIdRef.current === 'number') {
            clearTimeout(rafIdRef.current);
          }
        }
      } else if (!document.hidden && runningRef.current) {
        console.log('[BiteDetector] Tab visible - resuming frame processing');
        scheduleNextTick();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Optimized frame scheduling with hardware acceleration via will-change
  const scheduleNextTick = useCallback(() => {
    if (!runningRef.current) return;
    
    // Target 30fps for battery/thermal efficiency with fallback to 60fps
    const FRAME_TIME = 1000 / 30;
    
    const processFrameOptimized = () => {
      if (!runningRef.current) return;
      
      // Check document visibility before processing expensive frame
      if (document.hidden) {
        return;
      }
      
      const startTime = performance.now();
      tick();
      const elapsed = performance.now() - startTime;
      
      // Adaptive frame rate: maintain 30fps base, skip if processing takes >33ms
      const nextDelay = Math.max(0, FRAME_TIME - elapsed);
      rafIdRef.current = setTimeout(
        () => {
          rafIdRef.current = requestAnimationFrame(processFrameOptimized);
        },
        nextDelay
      );
    };
    
    rafIdRef.current = requestAnimationFrame(processFrameOptimized);
  }, [tick]);

  const startDetection = async () => {
    setError(null); // Clear any previous errors

    // Premium Session starten - TEMPORÄR DEAKTIVIERT
    /*
    if (user && !user.is_demo_user) {
      try {
        const response = await startPremiumMeter({ feature_id: 'bite_detector' });
        
        if (response.data?.error_type === 'insufficient_credits') {
          toast.error("Nicht genug Credits für Bissanzeiger!", {
            description: `Mindestens 200 Credits benötigt.`,
            action: {
              label: "Credits kaufen",
              onClick: () => window.location.href = createPageUrl("Shop")
            }
          });
          // Do not proceed with detection if credits are insufficient
          return;
        }
        
        if (response.data?.ok) {
          setSessionId(response.data.session_id);
          setRemainingCredits(response.data.remaining_credits);
          
          heartbeatIntervalRef.current = setInterval(async () => {
            try {
              const hbResponse = await heartbeatPremiumMeter({ session_id: response.data.session_id });
              
              if (hbResponse.data?.error_type === 'insufficient_credits') {
                toast.error("Credits aufgebraucht! Bissanzeiger wird gestoppt.");
                stopDetection();
                return;
              }
              
              if (hbResponse.data?.ok) {
                setRemainingCredits(hbResponse.data.remaining_credits);
              }
            } catch (error) {
              console.error("Heartbeat error:", error);
            }
          }, 30000); // 30 seconds
        } else {
          toast.error("Fehler beim Starten der Session", {
            description: response.data?.message || "Unbekannter Fehler."
          });
          setError(response.data?.message || "Fehler beim Starten der Session.");
          return;
        }
      } catch (error) {
        console.error("Failed to start bite detector session:", error);
        toast.error("Fehler beim Starten der Session");
        setError("Fehler beim Starten der Premium-Sitzung.");
        return;
      }
    }
    */ // END Premium Session starten - TEMPORÄR DEAKTIVIERT

    try {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      const procCanvas = procCanvasRef.current;
      
      if (!video || !overlay || !procCanvas) {
        // If DOM elements are not ready, stop premium session if it was initiated - TEMPORÄR DEAKTIVIERT
        /*
        if (sessionId) {
          await stopPremiumMeter({ session_id: sessionId }); // Ensure this is awaited
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          setSessionId(null);
        }
        */ // END If DOM elements are not ready, stop premium session if it was initiated - TEMPORÄR DEAKTIVIERT
        return;
      }

      // Stop any existing stream
      await stopDetection();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      video.srcObject = stream;
      await video.play();

      // Setup canvas sizes
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      
      const ratio = video.videoHeight / video.videoWidth;
      procCanvas.width = PROC_W;
      procCanvas.height = Math.round(PROC_W * ratio);

      drawOverlay();
      runningRef.current = true;
      setRunning(true);

      // Start processing loop with requestAnimationFrame throttling
      scheduleNextTick();

    } catch (error) {
      console.error("Failed to start bite detection:", error);
      toast.error("Kamera konnte nicht gestartet werden. Bitte Berechtigungen prüfen.");
      setError("Kamera konnte nicht gestartet werden. Bitte Berechtigungen prüfen.");
      
      // Session stoppen bei Fehler - TEMPORÄR DEAKTIVIERT
      /*
      if (sessionId) {
        await stopPremiumMeter({ session_id: sessionId }); // Ensure this is awaited
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        setSessionId(null);
      }
      */ // END Session stoppen bei Fehler - TEMPORÄR DEAKTIVIERT
    }
  };

  const stopDetection = async (triggeredByUser = false) => {
    const video = videoRef.current;
    const _state = stateRef.current;

    const wasRunning = runningRef.current;
    runningRef.current = false;
    setRunning(false);
    setError(null); // Clear error when stopping

    // Frage nur wenn Session wirklich aktiv war und Nutzer manuell gestoppt hat
    if (wasRunning && triggeredByUser) {
      window.dispatchEvent(new CustomEvent('bite-detector-session-ended'));
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      if (typeof rafIdRef.current === 'number') {
        clearTimeout(rafIdRef.current);
      }
      rafIdRef.current = null;
    }

    if (video && video.srcObject) {
      const stream = video.srcObject;
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }

    // Premium Session stoppen - TEMPORÄR DEAKTIVIERT
    /*
    if (sessionId) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      try {
        await stopPremiumMeter({ session_id: sessionId });
      } catch (error) {
        // Alle Fehler beim Stoppen ignorieren
        console.log("Session stop (ignoriert):", error.response?.status || error.message);
      } finally {
        // State immer zurücksetzen
        setSessionId(null);
      }
    }
    */ // END Premium Session stoppen - TEMPORÄR DEAKTIVIERT
  };

  const enableRoiDraw = (mode) => {
    const overlay = overlayRef.current;
    const state = stateRef.current;
    
    if (!overlay) return;

    state.mode = mode;
    overlay.style.cursor = 'crosshair';

    // Remove previous event listeners to avoid duplicates
    overlay.removeEventListener('mousedown', state.handleMouseDown);
    overlay.removeEventListener('mousemove', state.handleMouseMove);
    overlay.removeEventListener('mouseup', state.handleMouseUp);
    overlay.removeEventListener('mouseleave', state.handleMouseLeave);

    const handleMouseDown = (e) => {
      state.drawing = true;
      const rect = overlay.getBoundingClientRect();
      state.startPt = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const handleMouseMove = (e) => {
      if (!state.drawing || !state.mode) return;
      
      const rect = overlay.getBoundingClientRect();
      const cur = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      const roiRect = {
        x: Math.min(state.startPt.x, cur.x),
        y: Math.min(state.startPt.y, cur.y),
        w: Math.abs(cur.x - state.startPt.x),
        h: Math.abs(cur.y - state.startPt.y)
      };

      if (state.mode === 'line') {
        state.roiLine = roiRect;
      } else if (state.mode === 'tip') {
        state.roiTip = roiRect;
      }
      
      drawOverlay();
    };

    const handleEnd = () => {
      state.drawing = false;
      state.mode = null;
      overlay.style.cursor = 'default';
      
      overlay.removeEventListener('mousedown', state.handleMouseDown);
      overlay.removeEventListener('mousemove', state.handleMouseMove);
      overlay.removeEventListener('mouseup', state.handleMouseUp);
      overlay.removeEventListener('mouseleave', state.handleMouseLeave);
    };

    // Store handlers on stateRef to easily remove them later
    state.handleMouseDown = handleMouseDown;
    state.handleMouseMove = handleMouseMove;
    state.handleMouseUp = handleEnd; // Mouseup and mouseleave should both stop drawing
    state.handleMouseLeave = handleEnd;

    overlay.addEventListener('mousedown', handleMouseDown);
    overlay.addEventListener('mousemove', handleMouseMove);
    overlay.addEventListener('mouseup', handleEnd);
    overlay.addEventListener('mouseleave', handleEnd);
  };

  const lineLevel = Math.min(100, Math.round((lineScore / kLine) * 100));
  const tipLevel = Math.min(100, Math.round((tipScore / kTip) * 100));

  return (
    <section className="bb-bite" aria-labelledby="bite-title">
      <header className="bb-bite-head">
        <h2 id="bite-title" className="bb-bite-title"><BrainCircuit size={30} aria-hidden="true" />KI-Bisserkennung</h2>
        <p className="bb-bite-eyebrow">Deine Rute im Blick. Kein Biss mehr verpassen.</p>
        {error && <p className="text-sm text-red-300 mt-2" role="alert" aria-live="assertive">{error}</p>}
      </header>

      <div className={`bb-bite-video${alarmActive ? ' is-alarm' : ''}`}>
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          autoPlay
          muted
          aria-label="Live Kamera-Stream fuer Bissanzeiger"
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'auto' }}
          role="img"
          aria-label="Interaktive Ruten-Erkennungsflaeche: Tuerkis umrahmtes Gebiet ist die Angelschnur-Region; Gelbes umrahmtes Gebiet ist die Rutenspitze-Region. Klicken und ziehen zum Zeichnen der Regions of Interest fuer Bissanzeige."
        />
        <canvas ref={procCanvasRef} className="hidden" role="presentation" aria-hidden="true" />
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {running ? (alarmActive ? 'Biss erkannt!' : 'Bisserkennung laeuft') : 'Bisserkennung gestoppt'}
        </div>
        {running && <span className="bb-bite-live"><i aria-hidden="true" />LIVE</span>}
        {!running && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-slate-300">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-60" aria-hidden="true" />
              <p>Kamera ist aus</p>
            </div>
          </div>
        )}
      </div>

      <div className="bb-bite-tiles">
        <div className={`bb-bite-tile${running ? ' is-green' : ''}`}>
          <Crosshair size={30} aria-hidden="true" />
          <strong>{running ? 'Aktiv' : 'Gestoppt'}</strong>
          <small>{running ? 'Kamera läuft' : 'Kamera starten'}</small>
        </div>
        <div className="bb-bite-tile">
          <BiteGauge value={lineLevel} />
          <strong>Schnur</strong>
          <small>Signal zur Schwelle</small>
        </div>
        <div className="bb-bite-tile">
          <BiteGauge value={tipLevel} />
          <strong>Rutenspitze</strong>
          <small>Signal zur Schwelle</small>
        </div>
        <div className={`bb-bite-tile${alarmActive ? ' is-alarm' : ''}`}>
          <BellRing size={30} aria-hidden="true" />
          <strong>{biteEvents.length}</strong>
          <small>Bisse erkannt</small>
        </div>
      </div>

      <div className="bb-card">
        <BiteDetectorControls
          running={running}
          kLine={kLine}
          kTip={kTip}
          lockTime={lockTime}
          onStartStop={running ? () => stopDetection(true) : startDetection}
          onRoiDraw={enableRoiDraw}
          onLineChange={setKLine}
          onTipChange={setKTip}
          onLockTimeChange={setLockTime}
        />
      </div>

      <section className="bb-card" aria-labelledby="bite-events-title">
        <div className="bb-section-head">
          <h3 id="bite-events-title" className="bb-section-title"><Clock size={22} aria-hidden="true" />Ereignisse heute</h3>
        </div>
        {biteEvents.length === 0 ? (
          <p className="bb-muted text-sm">Noch kein Biss erkannt. Starte die Kamera und markiere Schnur und Rutenspitze.</p>
        ) : (
          <ol className="bb-timeline">
            {biteEvents.map(event => (
              <li key={event.id} className={event.strength >= 1.5 ? 'is-red' : 'is-orange'}>
                <span className="bb-timeline-time">{new Date(event.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="bb-timeline-icon"><Activity size={20} aria-hidden="true" /></span>
                <span className="min-w-0">
                  <strong>{event.strength >= 1.5 ? 'Deutlicher Biss' : 'Möglicher Biss'}</strong>
                  <small>Bewegung an der {event.source} · {event.strength.toFixed(1)}× Schwelle</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <button type="button" className="bb-action bb-action-block" onClick={() => window.dispatchEvent(new CustomEvent('openCatchDialog'))}>
        <Fish size={20} aria-hidden="true" className="bb-action-icon" />
        <span>Fangdialog öffnen</span>
        <ChevronRight size={20} aria-hidden="true" className="bb-action-arrow" />
      </button>

      <BiteDetectorMetrics running={running} lineScore={lineScore} tipScore={tipScore} debugInfo={debugInfo} />
      <BiteDetectorInstructions />
    </section>
  );
}
function BiteGauge({ value }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v >= 100 ? 'var(--bb-red)' : v >= 60 ? 'var(--bb-orange)' : 'var(--bb-green)';
  return (
    <span className="bb-bite-gauge">
      <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} transform="rotate(-90 28 28)" />
      </svg>
      <span>{v}%</span>
    </span>
  );
}
