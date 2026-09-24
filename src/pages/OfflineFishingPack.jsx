import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download, WifiOff, CheckCircle, RefreshCw, Trash2,
  MapPin, Scale, FileText, CloudOff, Loader2, AlertTriangle, Clock
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { entities } from "@/api/frontendClient";
import SubPageHeader from "@/components/layout/SubPageHeader";

const PACK_KEY = "bb_offline_pack_meta";
const PACK_DATA_KEY = "bb_offline_pack_data";

const PACK_SECTIONS = [
  {
    id: "spots",
    label: "Meine Spots",
    icon: MapPin,
    color: "var(--bb-cyan)",
    description: "Alle gespeicherten Angelplaetze mit GPS-Koordinaten",
    estimatedKB: 50,
  },
  {
    id: "catches",
    label: "Fangbuch",
    icon: Scale,
    color: "#4ade80",
    description: "Letzten 200 Eintraege aus dem Fangbuch",
    estimatedKB: 120,
  },
  {
    id: "rules",
    label: "Schonzeiten & Regeln",
    icon: FileText,
    color: "#fbbf24",
    description: "Schonzeiten fuer die 20 haeufigsten Fischarten",
    estimatedKB: 30,
  },
];

function formatBytes(kb) {
  if (kb < 1000) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function isStale(ts) {
  if (!ts) return true;
  return Date.now() - ts > 24 * 60 * 60 * 1000;
}

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(PACK_KEY) || "{}"); } catch { return {}; }
}

function saveMeta(meta) {
  try { localStorage.setItem(PACK_KEY, JSON.stringify(meta)); } catch {}
}

function loadPackData() {
  try { return JSON.parse(localStorage.getItem(PACK_DATA_KEY) || "{}"); } catch { return {}; }
}

function savePackData(data) {
  try { localStorage.setItem(PACK_DATA_KEY, JSON.stringify(data)); } catch {}
}

const OFFLINE_RULES = [
  { species: "Hecht", schonzeit: "01.02.–30.04.", mindestmass: "50 cm", hinweis: "Bundeslandabhaengig" },
  { species: "Zander", schonzeit: "01.03.–31.05.", mindestmass: "40–45 cm", hinweis: "Regional unterschiedlich" },
  { species: "Karpfen", schonzeit: "Keine bundesweit", mindestmass: "35 cm", hinweis: "Vereinsregeln pruefen" },
  { species: "Forelle (Bach)", schonzeit: "01.10.–15.03.", mindestmass: "25 cm", hinweis: "Meist Oktober–Maerz" },
  { species: "Forelle (Regenbogen)", schonzeit: "Keine", mindestmass: "25 cm", hinweis: "Teichwirtschaft" },
  { species: "Barsch", schonzeit: "01.03.–31.05.", mindestmass: "15 cm", hinweis: "Regional variiert" },
  { species: "Rotauge", schonzeit: "15.03.–15.05.", mindestmass: "15 cm", hinweis: "Regional" },
  { species: "Aal", schonzeit: "Teils ganzjaehrig gesperrt", mindestmass: "45 cm", hinweis: "EU-Schutzmassnahmen" },
  { species: "Wels", schonzeit: "15.04.–15.06.", mindestmass: "50–70 cm", hinweis: "Regional unterschiedlich" },
  { species: "Schleie", schonzeit: "01.04.–31.05.", mindestmass: "25 cm", hinweis: "Regional" },
  { species: "Brachse", schonzeit: "01.04.–31.05.", mindestmass: "25 cm", hinweis: "Regional" },
  { species: "Doebel", schonzeit: "Selten geregelt", mindestmass: "20 cm", hinweis: "Vereinsregeln" },
  { species: "Quappe", schonzeit: "Keine bundesweit", mindestmass: "25 cm", hinweis: "Regional" },
  { species: "Lachs", schonzeit: "15.08.–31.12.", mindestmass: "60 cm", hinweis: "Bundeslandabhaengig" },
  { species: "Huchen", schonzeit: "01.02.–31.05.", mindestmass: "60 cm", hinweis: "Donau-Einzugsgebiet" },
  { species: "Aesche", schonzeit: "01.03.–31.05.", mindestmass: "30 cm", hinweis: "Regional unterschiedlich" },
  { species: "Rapfen", schonzeit: "01.04.–30.06.", mindestmass: "35 cm", hinweis: "Regional" },
  { species: "Karausche", schonzeit: "Keine", mindestmass: "20 cm", hinweis: "Regional" },
  { species: "Guester", schonzeit: "01.04.–31.05.", mindestmass: "15 cm", hinweis: "Regional" },
  { species: "Maraene", schonzeit: "15.09.–31.01.", mindestmass: "35 cm", hinweis: "Norddeutschland" },
];

export default function OfflineFishingPack() {
  useFeatureTracking("offline_fishing_pack");
  const _navigate = useNavigate();

  const [meta, setMeta]           = useState(loadMeta);
  const [downloading, setDl]      = useState({});
  const [progress, setProgress]   = useState({});
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const [expandedRules, setExpandedRules] = useState(false);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const dn = () => setIsOnline(false);
    window.addEventListener("online",  up);
    window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);

  const downloadSection = useCallback(async (sectionId) => {
    if (!isOnline) { toast.error("Kein Internet — Pack-Aktualisierung nicht moeglich"); return; }
    setDl(prev => ({ ...prev, [sectionId]: true }));
    setProgress(prev => ({ ...prev, [sectionId]: 0 }));

    try {
      let data;
      let actualKB = 0;

      if (sectionId === "spots") {
        setProgress(prev => ({ ...prev, [sectionId]: 30 }));
        const spots = await entities.FishingSpot.list();
        data = spots;
        actualKB = Math.round(JSON.stringify(spots).length / 1024) || PACK_SECTIONS[0].estimatedKB;
        setProgress(prev => ({ ...prev, [sectionId]: 90 }));
      } else if (sectionId === "catches") {
        setProgress(prev => ({ ...prev, [sectionId]: 30 }));
        const catches = await entities.CatchEntry.list("-created_at", 200);
        data = catches;
        actualKB = Math.round(JSON.stringify(catches).length / 1024) || PACK_SECTIONS[1].estimatedKB;
        setProgress(prev => ({ ...prev, [sectionId]: 90 }));
      } else if (sectionId === "rules") {
        setProgress(prev => ({ ...prev, [sectionId]: 50 }));
        data = OFFLINE_RULES;
        actualKB = Math.round(JSON.stringify(OFFLINE_RULES).length / 1024) || PACK_SECTIONS[2].estimatedKB;
        setProgress(prev => ({ ...prev, [sectionId]: 90 }));
      }

      const packData = loadPackData();
      packData[sectionId] = data;
      savePackData(packData);

      setProgress(prev => ({ ...prev, [sectionId]: 100 }));

      const newMeta = {
        ...meta,
        [sectionId]: { ts: Date.now(), sizeKB: actualKB, count: Array.isArray(data) ? data.length : 0 },
      };
      setMeta(newMeta);
      saveMeta(newMeta);

      toast.success(`${PACK_SECTIONS.find(s => s.id === sectionId)?.label} heruntergeladen`);
    } catch (e) {
      toast.error("Download fehlgeschlagen: " + (e?.message || "Unbekannter Fehler"));
    } finally {
      setDl(prev => ({ ...prev, [sectionId]: false }));
      setTimeout(() => setProgress(prev => { const n = {...prev}; delete n[sectionId]; return n; }), 1200);
    }
  }, [isOnline, meta]);

  const deleteSection = useCallback((sectionId) => {
    const packData = loadPackData();
    delete packData[sectionId];
    savePackData(packData);
    const newMeta = { ...meta };
    delete newMeta[sectionId];
    setMeta(newMeta);
    saveMeta(newMeta);
    toast.success("Offline-Daten geloescht");
  }, [meta]);

  const downloadAll = useCallback(async () => {
    for (const sec of PACK_SECTIONS) {
      await downloadSection(sec.id);
    }
  }, [downloadSection]);

  const totalKB   = Object.values(meta).reduce((s, m) => s + (m?.sizeKB || 0), 0);
  const allReady  = PACK_SECTIONS.every(s => meta[s.id]?.ts && !isStale(meta[s.id]?.ts));
  const anyStale  = PACK_SECTIONS.some(s => meta[s.id]?.ts && isStale(meta[s.id]?.ts));

  return (
    <div className="bb-page">
      <SubPageHeader title="Offline-Angelpack" icon={WifiOff} iconColor="#2dd4bf" />

      {!isOnline && (
        <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' }}>
          <CloudOff size={16} className="flex-shrink-0" style={{ color: '#fbbf24' }} />
          <p className="text-xs" style={{ color: '#fcd34d' }}>Offline-Modus aktiv — gespeicherte Daten werden genutzt.</p>
        </div>
      )}

      {anyStale && isOnline && (
        <div className="p-3 rounded-xl flex items-center justify-between gap-2" style={{ background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.3)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="flex-shrink-0" style={{ color: '#fb923c' }} />
            <p className="text-xs" style={{ color: '#fdba74' }}>Einige Daten sind aelter als 24 Stunden.</p>
          </div>
          <button className="bb-action text-xs px-3 py-1" onClick={downloadAll}>
            <RefreshCw size={12} className="mr-1 inline" /> Alle aktualisieren
          </button>
        </div>
      )}

      {/* Uebersicht */}
      <div className="bb-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-white">Pack-Uebersicht</p>
            <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
              {totalKB > 0 ? `${formatBytes(totalKB)} lokal gespeichert` : "Noch kein Inhalt heruntergeladen"}
            </p>
          </div>
          {allReady ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
              style={{ background: 'rgba(34,197,94,.15)', color: '#86efac', border: '1px solid rgba(34,197,94,.3)' }}>
              <CheckCircle size={12} /> Bereit
            </span>
          ) : (
            <button
              className="bb-action text-xs px-3 py-1.5"
              onClick={downloadAll}
              disabled={!isOnline || Object.values(downloading).some(Boolean)}
            >
              <Download size={12} className="mr-1 inline" /> Alles laden
            </button>
          )}
        </div>
      </div>

      {/* Sektionen */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: 'var(--bb-muted)' }}>Inhalte</p>

        {PACK_SECTIONS.map(sec => {
          const Icon = sec.icon;
          const secMeta = meta[sec.id];
          const hasData = !!secMeta?.ts;
          const stale   = hasData && isStale(secMeta.ts);
          const dlActive = downloading[sec.id];
          const prog    = progress[sec.id];

          return (
            <div key={sec.id} className="bb-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color: sec.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white">{sec.label}</p>
                      {hasData && !stale && (
                        <span className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                          style={{ color: '#4ade80', border: '1px solid rgba(34,197,94,.3)', background: 'rgba(34,197,94,.1)' }}>
                          <CheckCircle size={10} />Aktuell
                        </span>
                      )}
                      {stale && (
                        <span className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                          style={{ color: '#fb923c', border: '1px solid rgba(249,115,22,.3)', background: 'rgba(249,115,22,.1)' }}>
                          <Clock size={10} />Veraltet
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--bb-muted)' }}>{sec.description}</p>
                    {hasData && (
                      <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'rgba(255,255,255,.3)' }}>
                        <span>{secMeta.count} Eintraege · {formatBytes(secMeta.sizeKB)}</span>
                        <span>·</span>
                        <span>{formatDate(secMeta.ts)}</span>
                      </p>
                    )}
                    {dlActive && prog !== undefined && (
                      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${prog}%`, background: 'var(--bb-cyan)' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {hasData && (
                    <button
                      onClick={() => deleteSection(sec.id)}
                      className="p-1.5 rounded transition"
                      style={{ color: 'rgba(255,255,255,.3)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    className={hasData ? "bb-secondary text-xs px-3 py-1.5" : "bb-action text-xs px-3 py-1.5"}
                    onClick={() => downloadSection(sec.id)}
                    disabled={!isOnline || dlActive}
                  >
                    {dlActive ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        {hasData ? <RefreshCw size={12} className="mr-1 inline" /> : <Download size={12} className="mr-1 inline" />}
                        {hasData ? "Aktualisieren" : "Laden"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Schonzeiten-Vorschau */}
      {meta.rules?.ts && (
        <div className="bb-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bb-muted)' }}>Offline-Schonzeiten (Vorschau)</p>
            <button
              onClick={() => setExpandedRules(v => !v)}
              className="text-xs transition"
              style={{ color: 'var(--bb-muted)' }}
            >
              {expandedRules ? "Weniger" : "Alle anzeigen"}
            </button>
          </div>
          <div className="space-y-1.5">
            {(expandedRules ? OFFLINE_RULES : OFFLINE_RULES.slice(0, 5)).map(r => (
              <div key={r.species} className="flex items-start justify-between gap-2 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                <span className="text-sm text-white font-medium">{r.species}</span>
                <div className="text-right">
                  <p className="text-xs" style={{ color: '#fcd34d' }}>{r.schonzeit}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,.3)' }}>Mindestmass: {r.mindestmass}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--bb-border)' }}>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>
          Offline-Daten werden im lokalen Geraetespeicher gesichert. Sie sind auch ohne Internetverbindung abrufbar.
          Schonzeiten-Angaben sind Richtwerte — lokale Regelungen des Angelverbands koennen abweichen.
        </p>
      </div>
    </div>
  );
}
