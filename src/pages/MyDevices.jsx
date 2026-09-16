import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Watch, Camera, Zap, Radio, Plus,
  Bluetooth, ChevronRight, AlertCircle, CheckCircle2,
  Gauge
} from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';

/**
 * MyDevices 2.0 — Zentrale Seite für Geräte-Integration
 *
 * Zeigt Geräte in Kategorien:
 * - Wearables (Galaxy Watch, Garmin, etc.)
 * - Kameras (GoPro)
 * - Sensoren (BLE, Wetter, Umwelt)
 * - Sonar/Echolote (Deeper, Lowrance, Humminbird)
 *
 * Features:
 * - Verbindungs-Status pro Gerät
 * - Akkustand & letzter Kontakt
 * - Geführter Verbindungs-Flow
 * - Sonar-Puls-Animation beim Suchen
 */

const DEVICE_CATEGORIES = [
  {
    id: 'wearables',
    label: 'Wearables',
    icon: Watch,
    description: 'Smartwatch & Aktivitätstracker',
    devices: [
      { id: 'garmin', name: 'Garmin Watch', status: 'available', battery: null, lastContact: null },
      { id: 'galaxy', name: 'Galaxy Watch', status: 'available', battery: null, lastContact: null },
    ]
  },
  {
    id: 'cameras',
    label: 'Kameras',
    icon: Camera,
    description: 'Action- & Sportcams',
    devices: [
      { id: 'gopro', name: 'GoPro Hero', status: 'available', battery: null, lastContact: null },
    ]
  },
  {
    id: 'sensors',
    label: 'Sensoren',
    icon: Zap,
    description: 'BLE-Sensoren & Umweltdaten',
    devices: [
      { id: 'hr-sensor', name: 'Herzfrequenz-Sensor', status: 'connected', battery: 85, lastContact: '2 Min.' },
      { id: 'temp-sensor', name: 'Temperatur-Sensor', status: 'available', battery: null, lastContact: null },
    ]
  },
  {
    id: 'sonar',
    label: 'Sonar & Echolote',
    icon: Radio,
    description: 'Fischfinder & Tiefengeräte',
    devices: [
      { id: 'deeper', name: 'Deeper Start', status: 'available', battery: null, lastContact: null, planned: true },
      { id: 'lowrance', name: 'Lowrance', status: 'available', battery: null, lastContact: null, planned: true },
      { id: 'humminbird', name: 'Humminbird', status: 'available', battery: null, lastContact: null, planned: true },
    ]
  }
];

function getStatusColor(status) {
  return status === 'connected' ? 'text-green-400' : 'text-slate-400';
}

function getStatusIcon(status) {
  return status === 'connected' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />;
}

function DeviceCard({ device, categoryId }) {
  return (
    <Link
      to={`/DeviceIntegration?device=${device.id}&category=${categoryId}`}
      className="bb-card group cursor-pointer hover:bg-slate-700/40 transition-colors flex items-start gap-4"
    >
      <div className={`flex-1 min-w-0`}>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
            {device.name}
          </h3>
          {device.planned && (
            <span className="text-[10px] uppercase tracking-wide text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
              Geplant
            </span>
          )}
        </div>

        {device.status === 'connected' ? (
          <div className="text-xs text-green-400 flex items-center gap-1 mb-2">
            <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            Verbunden
          </div>
        ) : (
          <div className="text-xs text-slate-400 mb-2">Nicht verbunden</div>
        )}

        {(device.battery != null || device.lastContact) && (
          <div className="flex gap-3 text-[11px] text-slate-400">
            {device.battery != null && (
              <span className="flex items-center gap-1">
                <Gauge size={12} /> {device.battery}%
              </span>
            )}
            {device.lastContact && (
              <span>{device.lastContact}</span>
            )}
          </div>
        )}
      </div>

      <div className={`flex-shrink-0 ${getStatusColor(device.status)}`}>
        <ChevronRight size={20} />
      </div>
    </Link>
  );
}

function CategorySection({ category }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3 px-4">
        <category.icon className="text-cyan-300" size={24} />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-100">{category.label}</h2>
          <p className="text-xs text-slate-400">{category.description}</p>
        </div>
      </div>

      <div className="space-y-2 px-4">
        {category.devices.map(device => (
          <DeviceCard key={device.id} device={device} categoryId={category.id} />
        ))}
      </div>
    </section>
  );
}

/**
 * Sonar-Such-Animation — pulsierend bei Gerätesuche
 */
function SonarSearching() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="relative w-20 h-20">
        {/* Äußerer Puls */}
        <div className="absolute inset-0 rounded-full border-2 border-cyan-400/20 animate-pulse" />

        {/* Mittlerer Ring */}
        <div
          className="absolute inset-2 rounded-full border-2 border-cyan-400/40"
          style={{
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            animationDelay: '0.5s'
          }}
        />

        {/* Inneres Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Radio className="text-cyan-300 w-8 h-8" />
        </div>
      </div>
      <p className="text-sm text-slate-300">Geräte werden gesucht…</p>
    </div>
  );
}

export default function MyDevices() {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PageContainer title="Meine Geräte" subtitle="Verbundene Hardware & Integrations-Status">
      <div className="space-y-8 pb-8">
        {/* Header mit CTA */}
        <div className="bb-card space-y-4">
          <div>
            <p className="bb-eyebrow mb-2">Geräteverwaltung</p>
            <h1 className="bb-title">Meine Geräte</h1>
            <p className="bb-muted mt-2">Verbinde Hardware, um Echosondierungen, Sensor-Daten und Live-Tracking zu nutzen.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsSearching(!isSearching)}
              className="bb-action inline-flex gap-2"
            >
              <Bluetooth size={18} />
              Geräte suchen
            </button>
            <Link to="/DeviceIntegration" className="bb-secondary inline-flex gap-2">
              <Plus size={18} />
              Manuell hinzufügen
            </Link>
          </div>
        </div>

        {/* Such-Animation */}
        {isSearching && (
          <div className="bb-card">
            <SonarSearching />
            <button
              onClick={() => setIsSearching(false)}
              className="w-full mt-4 bb-secondary justify-center"
            >
              Abbrechen
            </button>
          </div>
        )}

        {/* Kategorien */}
        <div className="space-y-8">
          {DEVICE_CATEGORIES.map(category => (
            <CategorySection key={category.id} category={category} />
          ))}
        </div>

        {/* Info-Hinweis */}
        <div className="bb-card bg-blue-900/20 border border-blue-500/30 space-y-3">
          <div className="flex gap-3">
            <AlertCircle className="flex-shrink-0 text-blue-400" size={20} />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-blue-100">Kompatibilität:</p>
              <p className="text-blue-200/80">
                BLE-Sensoren: vollständig unterstützt. Echolote: Integration für Deeper, Lowrance und Humminbird in Planung.
                Wearables: Datenexport über offizielle APIs.
              </p>
            </div>
          </div>
        </div>

        {/* Footer-Info */}
        <div className="text-xs text-slate-400 px-4 py-4 border-t border-slate-700/50">
          <p>Verbindungen werden verschlüsselt übertragen. Sensor-Daten verbleiben lokal auf deinem Gerät.</p>
        </div>
      </div>
    </PageContainer>
  );
}
