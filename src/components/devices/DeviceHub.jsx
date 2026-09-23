import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Bluetooth,
  Camera,
  Waves,
  Thermometer,
  Scale,
  Radio,
  Activity,
  Settings,
  CheckCircle2,
  Heart,
  Play,
  Square,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { auth } from "@/api/auth";
import {
  withTimeout,
  retryWithBackoff,
  CONNECT_TIMEOUT_MS,
  RECONNECT_MAX_ATTEMPTS,
} from '@/lib/bleConnection';
import { parseBLE } from '@/lib/bleParsers';
import { EchogramRenderer, synthesizeIntensities } from './echogram';
import { BLE_DEVICES } from './bleDeviceCatalog';


export default function DeviceHub() {
  const canvasRef = useRef(null);
  const echogramRef = useRef(null);
  const videoRef = useRef(null);
  const bleInspectorRef = useRef({ device: null, server: null, characteristic: null });
  const sessionTimerRef = useRef(null);
  // Laufzeit-Handles je Gerät (nicht in State, da nicht renderrelevant und um
  // Stale-Closures im gattserverdisconnected-Listener zu vermeiden):
  // key -> { bleDevice, server, chars: [], manualDisconnect: bool, cancelReconnect: fn|null }
  const deviceRuntimeRef = useRef({});
  // Refs spiegeln den HR-Session-Zustand, damit die im Listener registrierten
  // Callbacks (recordHrSample) immer den aktuellen Wert sehen.
  const hrSessionActiveRef = useRef(false);
  const hrSessionIdRef = useRef(null);
  const mountedRef = useRef(true);

  const [logs, setLogs] = useState([]);
  const [telemetry, setTelemetry] = useState({ depth_m: null, temp_c: null });
  const [heartRate, setHeartRate] = useState(null);
  // key -> 'connecting' | 'connected' | 'reconnecting'. Fehlt der Key: getrennt.
  const [deviceStatus, setDeviceStatus] = useState({});
  const [cameraActive, setCameraActive] = useState(false);

  // HR Session State
  const [hrSessionActive, setHrSessionActive] = useState(false);
  const [hrSessionId, setHrSessionId] = useState(null);
  const [hrSessionStart, setHrSessionStart] = useState(null);
  const [hrSessionElapsed, setHrSessionElapsed] = useState('00:00');
  const [hrSamples, setHrSamples] = useState([]);

  const setStatusFor = (key, status) => {
    setDeviceStatus((prev) => {
      if (status === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === status) return prev;
      return { ...prev, [key]: status };
    });
  };
  
  // BLE Inspector State
  const [bleInspectorOpen, setBleInspectorOpen] = useState(false);
  const [bleServices, setBleServices] = useState([]);
  const [bleServiceInput, setBleServiceInput] = useState('');
  const [bleCharInput, setBleCharInput] = useState('');
  const [bleNotifyActive, setBleNotifyActive] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (canvasRef.current && !echogramRef.current) {
      echogramRef.current = new EchogramRenderer(canvasRef.current);
    }
  }, []);

  // HR-Session-Zustand in Refs spiegeln (Stale-Closure-Schutz für Listener).
  useEffect(() => {
    hrSessionActiveRef.current = hrSessionActive;
  }, [hrSessionActive]);
  useEffect(() => {
    hrSessionIdRef.current = hrSessionId;
  }, [hrSessionId]);

  // Vollständiges Aufräumen beim Verlassen der Seite: BLE-Handles trennen,
  // laufende Reconnects abbrechen und Kamera-Stream stoppen. Sonst bleiben
  // GATT-Verbindungen und der Kamera-Zugriff im Hintergrund aktiv.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      Object.values(deviceRuntimeRef.current).forEach((runtime) => {
        runtime.manualDisconnect = true;
        if (runtime.cancelReconnect) runtime.cancelReconnect();
        try {
          for (const { characteristic, handleValue } of runtime.chars || []) {
            characteristic.removeEventListener('characteristicvaluechanged', handleValue);
          }
          if (runtime.bleDevice?.gatt?.connected) {
            runtime.bleDevice.gatt.disconnect();
          }
        } catch { /* Handle bereits ungültig */ }
      });
      deviceRuntimeRef.current = {};

      try {
        if (bleInspectorRef.current.characteristic) {
          bleInspectorRef.current.characteristic.stopNotifications().catch(() => {});
        }
        if (bleInspectorRef.current.device?.gatt?.connected) {
          bleInspectorRef.current.device.gatt.disconnect();
        }
      } catch { /* Inspector-Handle bereits ungültig */ }

      const stream = videoRef.current?.srcObject;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // HR Session Timer
  useEffect(() => {
    if (hrSessionActive && hrSessionStart) {
      sessionTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - hrSessionStart;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        setHrSessionElapsed(`${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      }, 1000);
    } else {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    }
    
    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
  }, [hrSessionActive, hrSessionStart]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type }, ...prev].slice(0, 50));
  };

  // HR Session Management
  const startHrSession = async () => {
    if (!heartRate) {
      toast.error('Kein HR-Geraet verbunden');
      return;
    }
    
    const sessionId = `hr_session_${Date.now()}`;
    const now = Date.now();
    
    setHrSessionId(sessionId);
    setHrSessionStart(now);
    setHrSessionActive(true);
    setHrSamples([]);
    
    addLog(`HR Session gestartet: ${sessionId}`, 'success');
    toast.success('HR Session gestartet');
  };

  const stopHrSession = async () => {
    if (!hrSessionActive) return;
    
    const duration = Math.floor((Date.now() - hrSessionStart) / 1000);
    
    try {
      const _user = await auth.me();

      const avgBpm = hrSamples.length > 0
        ? Math.round(hrSamples.reduce((sum, s) => sum + s.bpm, 0) / hrSamples.length)
        : null;

      const _maxBpm = hrSamples.length > 0
        ? Math.max(...hrSamples.map(s => s.bpm))
        : null;

      const _minBpm = hrSamples.length > 0
        ? Math.min(...hrSamples.map(s => s.bpm))
        : null;
      
      addLog(
        `Session beendet: ${hrSessionId}, Dauer: ${duration}s, Samples: ${hrSamples.length}, Avg: ${avgBpm} bpm`, 
        'success'
      );
      
      toast.success(`Session beendet - ${duration}s, Avg: ${avgBpm} bpm`);
    } catch (error) {
      addLog(`Session-Fehler: ${error.message}`, 'error');
    }
    
    setHrSessionActive(false);
    setHrSessionId(null);
    setHrSessionStart(null);
    setHrSessionElapsed('00:00');
  };

  const recordHrSample = (bpm) => {
    // Refs statt State: dieser Callback läuft aus einem beim Verbinden
    // registrierten BLE-Listener und würde sonst veraltete Werte sehen.
    if (hrSessionActiveRef.current) {
      const sample = {
        ts: Date.now(),
        bpm,
        session_id: hrSessionIdRef.current
      };
      setHrSamples(prev => [...prev, sample]);
    }
  };

  // Abonniert alle konfigurierten Notify-Characteristics eines Geräts und gibt
  // die Characteristic-Handles zurück (für sauberes Stoppen beim Trennen).
  // Wird sowohl beim Erstverbinden als auch nach jedem Reconnect aufgerufen.
  const subscribeNotifications = async (server, device) => {
    const chars = [];
    for (const notifyConfig of device.notify) {
      const service = await server.getPrimaryService(notifyConfig.service);
      const characteristic = await service.getCharacteristic(notifyConfig.char);

      const handleValue = (event) => {
        const dataView = event.target.value;
        const parsed = parseBLE(dataView, device.parser);

        addLog(`${device.label}: ${JSON.stringify(parsed)}`, 'success');

        if (device.parser === 'heartRate' && parsed.bpm) {
          setHeartRate(parsed.bpm);
          recordHrSample(parsed.bpm);
        }

        if (device.parser === 'sonarSimple' && echogramRef.current) {
          const depth_m = parsed.depth_m ?? null;
          const temp_c = parsed.temp_c ?? null;
          const intensities = synthesizeIntensities(echogramRef.current.height, depth_m);
          const telemetryData = echogramRef.current.pushPing({ intensities, depth_m, temp_c });
          setTelemetry(telemetryData);
        }
      };

      characteristic.addEventListener('characteristicvaluechanged', handleValue);
      await characteristic.startNotifications();
      chars.push({ characteristic, handleValue });
    }
    return chars;
  };

  // Räumt HR-spezifischen Zustand auf, wenn ein HR-Gerät endgültig getrennt wird.
  const cleanupHeartRate = (device) => {
    if (device.parser === 'heartRate') {
      setHeartRate(null);
      if (hrSessionActiveRef.current) {
        stopHrSession();
      }
    }
  };

  // Automatische Wiederverbindung nach unerwartetem Abbruch. Nutzt das bereits
  // vorhandene Geräte-Handle (kein erneuter requestDevice-Dialog nötig) und
  // versucht es mit Exponential-Backoff. Bricht ab bei manuellem Trennen/Unmount.
  const reconnectDevice = async (device) => {
    const runtime = deviceRuntimeRef.current[device.key];
    if (!runtime || !runtime.bleDevice) return;

    let cancelled = false;
    runtime.cancelReconnect = () => { cancelled = true; };
    const shouldCancel = () => cancelled || runtime.manualDisconnect || !mountedRef.current;

    setStatusFor(device.key, 'reconnecting');
    addLog(`${device.label}: Verbindung verloren - versuche Wiederverbindung...`, 'warn');

    try {
      await retryWithBackoff(
        async (attempt) => {
          addLog(`${device.label}: Reconnect-Versuch ${attempt}/${RECONNECT_MAX_ATTEMPTS}`, 'info');
          const server = await withTimeout(
            runtime.bleDevice.gatt.connect(),
            CONNECT_TIMEOUT_MS,
            `Reconnect zu ${device.label}`
          );
          runtime.server = server;
          runtime.chars = await subscribeNotifications(server, device);
        },
        {
          maxAttempts: RECONNECT_MAX_ATTEMPTS,
          shouldCancel,
          onRetry: (attempt, delay) => {
            addLog(`${device.label}: nächster Versuch in ${Math.round(delay / 1000)}s`, 'info');
          },
        }
      );

      if (shouldCancel()) return;
      setStatusFor(device.key, 'connected');
      toast.success(`${device.label} wieder verbunden`);
      addLog(`${device.label} reconnected (BLE)`, 'success');
    } catch (error) {
      if (error.message === 'cancelled' || shouldCancel()) {
        return; // manuell/Unmount abgebrochen - keine Fehlermeldung
      }
      setStatusFor(device.key, null);
      cleanupHeartRate(device);
      toast.error(`${device.label}: Wiederverbindung fehlgeschlagen`);
      addLog(`${device.label}: reconnect aufgegeben (${error.message})`, 'error');
    } finally {
      runtime.cancelReconnect = null;
    }
  };

  // BLE Device Connection (Erstverbindung inkl. Geräteauswahl-Dialog)
  const connectBLEDevice = async (device) => {
    if (!navigator.bluetooth) {
      toast.error('Web Bluetooth wird nicht unterstuetzt');
      addLog('Web Bluetooth not supported', 'error');
      return;
    }

    // Doppel-Klick-/Mehrfach-Verbindungs-Schutz.
    const currentStatus = deviceStatus[device.key];
    if (currentStatus === 'connecting' || currentStatus === 'connected' || currentStatus === 'reconnecting') {
      return;
    }

    setStatusFor(device.key, 'connecting');

    try {
      let runtime = deviceRuntimeRef.current[device.key];
      let bleDevice = runtime?.bleDevice;

      if (!bleDevice) {
        const requestOptions = device.acceptAll
          ? { acceptAllDevices: true, optionalServices: device.optionalServices || [] }
          : { filters: [{ namePrefix: device.namePrefix }], optionalServices: device.optionalServices || [] };

        // requestDevice muss innerhalb der Nutzergeste laufen (kein Timeout-Wrap,
        // da der native Auswahl-Dialog beliebig lange offen bleiben darf).
        bleDevice = await navigator.bluetooth.requestDevice(requestOptions);

        runtime = { bleDevice, server: null, chars: [], manualDisconnect: false, cancelReconnect: null };
        deviceRuntimeRef.current[device.key] = runtime;

        // Listener nur einmal je Geräte-Handle registrieren.
        bleDevice.addEventListener('gattserverdisconnected', () => {
          const rt = deviceRuntimeRef.current[device.key];
          if (!rt) return;
          rt.chars = [];
          if (rt.manualDisconnect || !mountedRef.current) {
            return; // gewolltes Trennen - kein Reconnect
          }
          reconnectDevice(device);
        });
      }

      runtime.manualDisconnect = false;

      const server = await withTimeout(
        bleDevice.gatt.connect(),
        CONNECT_TIMEOUT_MS,
        `Verbindung zu ${device.label}`
      );
      runtime.server = server;

      if (device.notify && device.notify.length > 0) {
        runtime.chars = await subscribeNotifications(server, device);
        setStatusFor(device.key, 'connected');
        toast.success(`${device.label} verbunden`);
        addLog(`${device.label} connected (BLE)`, 'success');
      } else {
        // Kein Notify-Profil hinterlegt - Verbindung wieder lösen, da hier nichts
        // gestreamt werden kann; der Nutzer soll den BLE-Inspector verwenden.
        try { bleDevice.gatt.disconnect(); } catch { /* bereits getrennt */ }
        runtime.manualDisconnect = true;
        setStatusFor(device.key, null);
        toast.warning(`${device.label}: Keine UUIDs konfiguriert. Nutze BLE-Inspector.`);
        addLog(`${device.label}: keine UUIDs gesetzt - nutze BLE-Inspector`, 'warn');
      }
    } catch (error) {
      setStatusFor(device.key, null);
      if (error?.name === 'NotFoundError') {
        // Nutzer hat den Geräteauswahl-Dialog abgebrochen - keine Fehlermeldung.
        addLog(`${device.label}: Geräteauswahl abgebrochen`, 'info');
      } else {
        toast.error(`Verbindung fehlgeschlagen: ${error.message}`);
        addLog(`BLE connection error: ${error.message}`, 'error');
      }
    }
  };

  // Manuelles Trennen eines Geräts (unterdrückt Auto-Reconnect).
  const disconnectBLEDevice = (device) => {
    const runtime = deviceRuntimeRef.current[device.key];
    if (!runtime) {
      setStatusFor(device.key, null);
      return;
    }
    runtime.manualDisconnect = true;
    if (runtime.cancelReconnect) runtime.cancelReconnect();

    try {
      for (const { characteristic, handleValue } of runtime.chars || []) {
        characteristic.removeEventListener('characteristicvaluechanged', handleValue);
      }
      if (runtime.bleDevice?.gatt?.connected) {
        runtime.bleDevice.gatt.disconnect();
      }
    } catch (error) {
      addLog(`${device.label}: Fehler beim Trennen (${error.message})`, 'error');
    }

    runtime.chars = [];
    setStatusFor(device.key, null);
    cleanupHeartRate(device);
    toast.info(`${device.label} getrennt`);
    addLog(`${device.label} disconnected (manuell)`, 'warn');
  };

  // BLE Inspector
  const openBLEInspector = async () => {
    if (!navigator.bluetooth) {
      toast.error('Web Bluetooth wird nicht unterstuetzt');
      return;
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: []
      });

      bleInspectorRef.current.device = device;

      device.addEventListener('gattserverdisconnected', () => {
        addLog('BLE Inspector: disconnected', 'warn');
      });

      const server = await device.gatt.connect();
      bleInspectorRef.current.server = server;

      const services = await server.getPrimaryServices();
      const serviceList = [];

      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        const charList = characteristics.map(char => ({
          uuid: char.uuid,
          properties: Object.keys(char.properties).filter(k => char.properties[k])
        }));

        serviceList.push({
          uuid: service.uuid,
          characteristics: charList
        });
      }

      setBleServices(serviceList);
      setBleInspectorOpen(true);
      toast.success('Services/Characteristics gescannt');
      addLog('BLE Inspector: Services/Chars gelistet', 'success');
    } catch (error) {
      toast.error(`Inspector-Fehler: ${error.message}`);
      addLog(`BLE Inspector error: ${error.message}`, 'error');
    }
  };

  const startBLENotifications = async () => {
    const serviceId = bleServiceInput.trim();
    const charId = bleCharInput.trim();

    if (!bleInspectorRef.current.server) {
      toast.error('Kein GATT Server verbunden');
      return;
    }

    try {
      const service = await bleInspectorRef.current.server.getPrimaryService(serviceId);
      const characteristic = await service.getCharacteristic(charId);

      await characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const dataView = event.target.value;
        const u8 = new Uint8Array(dataView.buffer);
        const hexStr = [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
        
        addLog(`BLE Notify: ${hexStr} (${u8.length} bytes)`, 'info');

        // Try to parse as HR
        if (serviceId.includes('180d') || charId.includes('2a37')) {
          const parsed = parseBLE(dataView, 'heartRate');
          if (parsed.bpm) {
            setHeartRate(parsed.bpm);
            recordHrSample(parsed.bpm);
            addLog(`HR: ${parsed.bpm} bpm`, 'success');
          }
        }

        // Try to parse as sonar
        if (u8.length >= 4) {
          const depth_m = dataView.getUint16(0, true) / 100;
          const temp_c = dataView.getUint16(2, true) / 10;
          const intensities = u8.length > 4 
            ? [...u8.slice(4)].map(x => x & 0xff)
            : synthesizeIntensities(echogramRef.current.height, depth_m);

          const telemetryData = echogramRef.current.pushPing({ 
            intensities, 
            depth_m, 
            temp_c 
          });
          setTelemetry(telemetryData);
        }
      });

      bleInspectorRef.current.characteristic = characteristic;
      setBleNotifyActive(true);
      toast.success('Notifications gestartet');
      addLog('BLE Inspector: Notifications gestartet', 'success');
    } catch (error) {
      toast.error(`Notification-Fehler: ${error.message}`);
      addLog(`BLE notify error: ${error.message}`, 'error');
    }
  };

  const stopBLENotifications = async () => {
    try {
      if (bleInspectorRef.current.characteristic) {
        await bleInspectorRef.current.characteristic.stopNotifications();
      }
      setBleNotifyActive(false);
      toast.info('Notifications gestoppt');
      addLog('BLE Inspector: Notifications gestoppt', 'warn');
    } catch (error) {
      addLog(`Stop notify error: ${error.message}`, 'error');
    }
  };

  // Camera
  const connectCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        toast.success('Kamera verbunden');
        addLog('Camera connected', 'success');
      }
    } catch (error) {
      toast.error(`Kamera-Fehler: ${error.message}`);
      addLog(`Camera error: ${error.message}`, 'error');
    }
  };

  const disconnectCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
      toast.info('Kamera getrennt');
      addLog('Camera disconnected', 'warn');
    }
  };

  const categories = [
    { id: 'all', label: 'Alle Geraete', icon: Bluetooth },
    { id: 'wearables', label: 'Wearables & HR', icon: Heart },
    { id: 'scales', label: 'Waagen', icon: Scale },
    { id: 'reels', label: 'Rollen & Ruten', icon: Activity },
    { id: 'sonars', label: 'Echolote', icon: Waves },
    { id: 'sensors', label: 'Sensoren', icon: Thermometer },
    { id: 'buttons', label: 'Buttons', icon: Radio }
  ];

  const filteredDevices = selectedCategory === 'all' 
    ? BLE_DEVICES 
    : BLE_DEVICES.filter(d => d.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              className={selectedCategory === cat.id ? 'bg-cyan-600' : ''}
            >
              <Icon className="w-4 h-4 mr-2" />
              {cat.label}
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Controls */}
        <div className="space-y-6">
          {/* Heart Rate Monitor */}
          {heartRate !== null && (
            <Card className="glass-morphism border-red-600/50 bg-red-900/10">
              <CardHeader>
                <CardTitle className="text-red-400 text-base flex items-center gap-2">
                  <Heart className="w-5 h-5" />
                  Heart Rate Monitor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-6xl font-bold text-red-400 mb-2">
                    {heartRate || '--'}
                  </div>
                  <div className="text-sm text-gray-400">bpm</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-gray-500">Session</div>
                    <div className="text-white font-semibold">
                      {hrSessionActive ? 'AKTIV' : '--'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Dauer</div>
                    <div className="text-white font-semibold">{hrSessionElapsed}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Samples</div>
                    <div className="text-white font-semibold">{hrSamples.length}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={startHrSession}
                    disabled={hrSessionActive}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Session
                  </Button>
                  <Button
                    onClick={stopHrSession}
                    disabled={!hrSessionActive}
                    variant="outline"
                    className="flex-1"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* BLE Devices */}
          <Card className="glass-morphism border-gray-800">
            <CardHeader>
              <CardTitle className="text-cyan-400 text-base flex items-center gap-2">
                <Bluetooth className="w-5 h-5" />
                Bluetooth-Geraete ({filteredDevices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                {filteredDevices.map(device => {
                  const Icon = device.icon;
                  const status = deviceStatus[device.key];
                  const isConnected = status === 'connected';
                  const isConnecting = status === 'connecting';
                  const isReconnecting = status === 'reconnecting';
                  const hasConfig = device.notify && device.notify.length > 0;

                  return (
                    <div
                      key={device.key}
                      className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 text-${device.color}-400`} />
                        <div>
                          <div className="text-sm font-medium text-white">{device.label}</div>
                          <div className="text-xs text-gray-500">
                            {device.acceptAll ? 'Alle HR-Geraete' : hasConfig ? 'Konfiguriert' : 'Benoetigt Inspector'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isConnected && (
                          <>
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Verbunden
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => disconnectBLEDevice(device)}
                            >
                              Trennen
                            </Button>
                          </>
                        )}
                        {isReconnecting && (
                          <>
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              Reconnect
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => disconnectBLEDevice(device)}
                            >
                              Abbrechen
                            </Button>
                          </>
                        )}
                        {isConnecting && (
                          <Button size="sm" disabled className="bg-cyan-600">
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Verbindet...
                          </Button>
                        )}
                        {!status && (
                          <Button
                            size="sm"
                            onClick={() => connectBLEDevice(device)}
                            className="bg-cyan-600 hover:bg-cyan-700"
                          >
                            Verbinden
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* BLE Inspector */}
          <Card className="glass-morphism border-gray-800">
            <CardHeader>
              <CardTitle className="text-cyan-400 text-base flex items-center gap-2">
                <Settings className="w-5 h-5" />
                BLE-Inspector
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={openBLEInspector}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                Geraet scannen
              </Button>

              {bleInspectorOpen && (
                <>
                  <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                    {bleServices.map((service, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="text-cyan-400 font-mono">Service: {service.uuid}</div>
                        {service.characteristics.map((char, cidx) => (
                          <div key={cidx} className="text-gray-400 ml-4 font-mono">
                            Char: {char.uuid} [{char.properties.join(', ')}]
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Input
                      placeholder="Service UUID (z.B. 0000180d-...)"
                      value={bleServiceInput}
                      onChange={(e) => setBleServiceInput(e.target.value)}
                      className="bg-gray-900 border-gray-700"
                    />
                    <Input
                      placeholder="Characteristic UUID (z.B. 00002a37-...)"
                      value={bleCharInput}
                      onChange={(e) => setBleCharInput(e.target.value)}
                      className="bg-gray-900 border-gray-700"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={startBLENotifications}
                        disabled={bleNotifyActive}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        Start Notifications
                      </Button>
                      <Button
                        onClick={stopBLENotifications}
                        disabled={!bleNotifyActive}
                        variant="outline"
                        className="flex-1"
                      >
                        Stop
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Camera */}
          <Card className="glass-morphism border-gray-800">
            <CardHeader>
              <CardTitle className="text-cyan-400 text-base flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Kamera
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg border border-gray-800 bg-black"
                style={{ maxHeight: '240px' }}
              />
              <div className="flex gap-2">
                <Button
                  onClick={connectCamera}
                  disabled={cameraActive}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Verbinden
                </Button>
                <Button
                  onClick={disconnectCamera}
                  disabled={!cameraActive}
                  variant="outline"
                  className="flex-1"
                >
                  Trennen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Echogram & Logs */}
        <div className="space-y-6">
          {/* Echogram */}
          <Card className="glass-morphism border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-cyan-400 text-base flex items-center gap-2">
                  <Waves className="w-5 h-5" />
                  Echogram
                </CardTitle>
                <div className="text-xs text-gray-400">
                  {telemetry.depth_m !== null && `Tiefe: ${telemetry.depth_m.toFixed(2)}m`}
                  {telemetry.temp_c !== null && ` | Temp: ${telemetry.temp_c.toFixed(1)} C`}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <canvas
                ref={canvasRef}
                width={640}
                height={240}
                className="w-full rounded-lg border border-gray-800"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="text-xs text-gray-500 mt-2">
                Erwartet Intensitaeten [0..255] pro Ping. Ohne Intensitaeten wird eine synthetische Spalte generiert.
              </div>
            </CardContent>
          </Card>

          {/* Logs */}
          <Card className="glass-morphism border-gray-800">
            <CardHeader>
              <CardTitle className="text-cyan-400 text-base">Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="text-gray-500 text-center py-4">Keine Logs</div>
                ) : (
                  logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded ${
                        log.type === 'error' ? 'bg-red-900/20 text-red-400' :
                        log.type === 'warn' ? 'bg-yellow-900/20 text-yellow-400' :
                        log.type === 'success' ? 'bg-emerald-900/20 text-emerald-400' :
                        'bg-gray-900/50 text-gray-300'
                      }`}
                    >
                      <span className="text-gray-500">{log.timestamp}</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}