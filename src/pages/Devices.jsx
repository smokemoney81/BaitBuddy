import React, { useState } from "react";
import { usePlan } from "@/components/premium/PlanContext";
import {
  Radio,
  Camera,
  Battery,
  Wifi,
  WifiOff,
  Plus,
  Settings,
  ChevronRight,
  ChevronLeft,
  Zap,
  AlertCircle,
  Heart
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import BiteDetectorSection from "@/components/ai/BiteDetectorSection";
import DeviceHub from "@/components/devices/DeviceHub";
import PremiumGuard from "@/components/premium/PremiumGuard";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PageTitle from "@/components/layout/PageTitle";

export default function DevicesPage() {
  useFeatureTracking("geraete");
  const [selectedDevice, setSelectedDevice] = useState(null);
  // Plan vom Server (inkl. Testphase, Pass und Admin-Schalter „alle Tools
  // kostenlos“). Früher las die Seite premium_plan_id aus den Nutzer-Metadaten —
  // dort steht der Plan nicht, echte Pro-Kunden sahen die Sperre.
  const { hasFeature, loading } = usePlan();
  const hasAccess = hasFeature('pro');

  const devices = [
    {
      id: 'device_hub',
      name: 'Device Hub',
      icon: Wifi,
      status: 'connected',
      battery: 100,
      signal: 5,
      type: 'hub',
      features: ['BLE Inspector', 'Web Serial', 'Kamera', 'Echogram-Renderer'],
      color: '#00E5FF',
      hasDetail: true
    },
    {
      id: 'smartwatch',
      name: 'Smartwatch / HR-Monitor',
      icon: Heart,
      status: 'connected',
      battery: 95,
      signal: 5,
      type: 'wearable',
      features: ['Heart Rate Monitoring', 'Session Tracking', 'Live BPM', 'Statistiken'],
      color: '#f87171',
      hasDetail: true
    },
    {
      id: 'bite_detector',
      name: 'Bissanzeiger',
      icon: Radio,
      status: 'connected',
      battery: 85,
      signal: 4,
      type: 'bite_alarm',
      features: ['Push-Benachrichtigungen', 'LED-Steuerung', 'Vibration', 'Ton-Anpassung'],
      color: '#34d399',
      hasDetail: true
    },
    {
      id: 'ai_camera',
      name: 'KI-Kamera',
      icon: Camera,
      status: 'connected',
      battery: 92,
      signal: 5,
      type: 'camera',
      features: ['Live-Analyse', 'Fischerkennung', 'Foto-Speicherung'],
      color: '#60a5fa',
      link: 'AI'
    }
  ];

  const getStatusStyle = (status) => {
    if (status === 'connected') return { background: 'rgba(52,211,153,.15)', color: '#34d399', border: '1px solid rgba(52,211,153,.3)' };
    return { background: 'rgba(255,255,255,.06)', color: 'var(--bb-muted)', border: '1px solid var(--bb-border)' };
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'connected': return 'Verbunden';
      case 'offline': return 'Offline';
      default: return 'Unbekannt';
    }
  };

  const handleDeviceClick = (device) => {
    if (device.comingSoon) return;
    if (device.link) {
      window.location.href = createPageUrl(device.link);
      return;
    }
    if (device.hasDetail) {
      setSelectedDevice(device);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
        <div style={{ color: 'var(--bb-cyan)' }}>Laden...</div>
      </div>
    );
  }

  if (selectedDevice?.id === 'device_hub' || selectedDevice?.id === 'smartwatch') {
    return (
      <div className="bb-page">
        <button
          onClick={() => setSelectedDevice(null)}
          className="flex items-center gap-1 p-2 rounded-lg"
          style={{ color: 'var(--bb-cyan)' }}
        >
          <ChevronLeft size={18} />
          Zurück zu Geräten
        </button>
        <div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--bb-cyan)' }}>
            {selectedDevice.id === 'smartwatch' ? 'Smartwatch & Heart Rate Monitor' : 'Device Hub'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
            {selectedDevice.id === 'smartwatch'
              ? 'Verbinde Smartwatches und HR-Monitore via Bluetooth Low Energy'
              : 'Verbinde BLE-Geräte, Echolote, Kameras und weitere Hardware direkt mit BaitBuddy'}
          </p>
        </div>
        <DeviceHub />
      </div>
    );
  }

  if (selectedDevice?.id === 'bite_detector') {
    return (
      <div className="bb-page">
        <button
          onClick={() => setSelectedDevice(null)}
          className="flex items-center gap-1 p-2 rounded-lg"
          style={{ color: 'var(--bb-cyan)' }}
        >
          <ChevronLeft size={18} />
          Zurück zu Geräten
        </button>
        <BiteDetectorSection />
      </div>
    );
  }

  const mainContent = (
    <div className="bb-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageTitle className="flex-1 min-w-0" title="Deine Geräte" subtitle="Verbinde und steuere deine Angelgeräte." />
        <button
          className="bb-action flex items-center gap-2"
          onClick={() => handleDeviceClick(devices.find(d => d.id === 'device_hub'))}
        >
          <Plus size={16} />
          Hinzufügen
        </button>
      </div>

      {/* Status-Übersicht */}
      <div className="bb-stat-row">
        {[
          { label: 'Verbunden', value: devices.filter(d => d.status === 'connected').length, icon: Wifi, color: '#34d399' },
          { label: 'Offline', value: devices.filter(d => d.status === 'offline').length, icon: WifiOff, color: 'var(--bb-muted)' },
          { label: 'Gesamt', value: devices.length, icon: Zap, color: 'var(--bb-cyan)' },
        ].map(s => (
          <div key={s.label} className="bb-stat-card">
            <div className="flex items-center justify-between mb-2">
              <div className="bb-stat-label">{s.label}</div>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div className="bb-stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Geräte-Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((device) => {
          const Icon = device.icon;
          const statusStyle = getStatusStyle(device.status);
          return (
            <div
              key={device.id}
              className="bb-card cursor-pointer"
              style={{ padding: 0, opacity: device.comingSoon ? 0.6 : 1 }}
              onClick={() => handleDeviceClick(device)}
            >
              <div className="p-4 flex items-start justify-between" style={{ borderBottom: '1px solid var(--bb-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${device.color}15` }}>
                    <Icon size={22} style={{ color: device.color }} />
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">{device.name}</div>
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1"
                      style={statusStyle}
                    >
                      {getStatusText(device.status)}
                    </span>
                  </div>
                </div>
                {!device.comingSoon && <ChevronRight size={18} style={{ color: 'var(--bb-muted)' }} />}
              </div>
              <div className="p-4 space-y-3">
                {device.status === 'connected' && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Battery size={14} style={{ color: device.battery > 20 ? '#34d399' : '#f87171' }} />
                      <span style={{ color: 'var(--bb-muted)' }}>{device.battery}%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Wifi size={14} style={{ color: 'var(--bb-cyan)' }} />
                      <span style={{ color: 'var(--bb-muted)' }}>{device.signal}/5</span>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  {device.features.slice(0, 3).map((feature, idx) => (
                    <div key={idx} className="text-xs flex items-center gap-2" style={{ color: 'var(--bb-muted)' }}>
                      <div className="w-1 h-1 rounded-full" style={{ background: 'var(--bb-border)' }} />
                      {feature}
                    </div>
                  ))}
                </div>
                {device.comingSoon && (
                  <span className="bb-pill-info text-xs inline-flex items-center gap-1">
                    <Zap size={12} />
                    Demnächst verfügbar
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info-Box */}
      <div className="bb-card" style={{ borderColor: 'rgba(96,165,250,.3)' }}>
        <div className="flex items-start gap-3">
          <AlertCircle size={18} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div className="font-semibold mb-1" style={{ color: '#93c5fd' }}>Geräte-Simulation</div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--bb-muted)' }}>
              Die meisten Geräte befinden sich noch in der Entwicklung. Der <span style={{ color: '#34d399', fontWeight: 600 }}>Bissanzeiger</span>, die <span style={{ color: '#60a5fa', fontWeight: 600 }}>KI-Kamera</span> und die <span style={{ color: '#f87171', fontWeight: 600 }}>Smartwatch</span> sind bereits voll funktionsfähig.
              Weitere Geräte wie Echolote, Futterboote und Sensoren folgen in zukünftigen Updates.
            </p>
          </div>
        </div>
      </div>

      {/* Tutorial Link */}
      <Link
        to={createPageUrl('DeviceIntegration')}
        className="bb-card flex items-center justify-between"
        style={{ textDecoration: 'none' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,229,255,.1)' }}>
            <Settings size={20} style={{ color: 'var(--bb-cyan)' }} />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">Geräte-Integration Tutorial</div>
            <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>Lerne, wie du Geräte verbindest</div>
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--bb-muted)' }} />
      </Link>
    </div>
  );

  if (hasAccess) {
    return mainContent;
  }

  return (
    <PremiumGuard
      requiredPlan="pro"
      feature="Die Geräteintegration ist ein Pro-Feature"
    >
      {mainContent}
    </PremiumGuard>
  );
}
