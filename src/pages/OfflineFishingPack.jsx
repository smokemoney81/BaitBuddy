import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Download, WifiOff, CheckCircle, RefreshCw, Trash2,
  MapPin, Scale, FileText, CloudOff, Loader2, AlertTriangle, Clock
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { entities } from "@/api/frontendClient";

const PACK_KEY = "bb_offline_pack_meta";
const PACK_DATA_KEY = "bb_offline_pack_data";

const PACK_SECTIONS = [
  {
    id: "spots",
    label: "Meine Spots",
    icon: MapPin,
    color: "text-cyan-400",
    description: "Alle gespeicherten Angelplätze mit GPS-Koordinaten",
    estimatedKB: 50,
  },
  {
    id: "catches",
    label: "Fangbuch",
    icon: Scale,
    color: "text-green-400",
    description: "Letzten 200 Einträge aus dem Fangbuch",
    estimatedKB: 120,
  },
  {
    id: "rules",
    label: "Schonzeiten & Regeln",
    icon: FileText,
    color: "text-amber-400",
    description: "Schonzeiten für die 20 häufigsten Fischarten",
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
  return Date.now() - ts > 24 * 60 * 60 * 1000; // > 24h
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
  { species: "Hecht", schonzeit: "01.02.–30.04.", mindestmaß: "50 cm", hinweis: "Bundeslandabhängig" },
  { species: "Zander", schonzeit: "01.03.–31.05.", mindestmaß: "40–45 cm", hinweis: "Regional unterschiedlich" },
  { species: "Karpfen", schonzeit: "Keine bundesweit", mindestmaß: "35 cm", hinweis: "Vereinsregeln prüfen" },
  { species: "Forelle (Bach)", schonzeit: "01.10.–15.03.", mindestmaß: "25 cm", hinweis: "Meist Oktober–März" },
  { species: "Forelle (Regenbogen)", schonzeit: "Keine", mindestmaß: "25 cm", hinweis: "Teichwirtschaft" },
  { species: "Barsch", schonzeit: "01.03.–31.05.", mindestmaß: "15 cm", hinweis: "Regional variiert" },
  { species: "Rotauge", schonzeit: "15.03.–15.05.", mindestmaß: "15 cm", hinweis: "Regional" },
  { species: "Aal", schonzeit: "Teils ganzjährig gesperrt", mindestmaß: "45 cm", hinweis: "EU-Schutzmaßnahmen" },
  { species: "Wels", schonzeit: "15.04.–15.06.", mindestmaß: "50–70 cm", hinweis: "Regional unterschiedlich" },
  { species: "Schleie", schonzeit: "01.04.–31.05.", mindestmaß: "25 cm", hinweis: "Regional" },
  { species: "Brachse", schonzeit: "01.04.–31.05.", mindestmaß: "25 cm", hinweis: "Regional" },
  { species: "Döbel", schonzeit: "Selten geregelt", mindestmaß: "20 cm", hinweis: "Vereinsregeln" },
  { species: "Quappe", schonzeit: "Keine bundesweit", mindestmaß: "25 cm", hinweis: "Regional" },
  { species: "Lachs", schonzeit: "15.08.–31.12.", mindestmaß: "60 cm", hinweis: "Bundeslandabhängig" },
  { species: "Huchen", schonzeit: "01.02.–31.05.", mindestmaß: "60 cm", hinweis: "Donau-Einzugsgebiet" },
  { species: "Äsche", schonzeit: "01.03.–31.05.", mindestmaß: "30 cm", hinweis: "Regional unterschiedlich" },
  { species: "Rapfen", schonzeit: "01.04.–30.06.", mindestmaß: "35 cm", hinweis: "Regional" },
  { species: "Karausche", schonzeit: "Keine", mindestmaß: "20 cm", hinweis: "Regional" },
  { species: "Güster", schonzeit: "01.04.–31.05.", mindestmaß: "15 cm", hinweis: "Regional" },
  { species: "Maräne", schonzeit: "15.09.–31.01.", mindestmaß: "35 cm", hinweis: "Norddeutschland" },
];

export default function OfflineFishingPack() {
  useFeatureTracking("offline_fishing_pack");
  const navigate = useNavigate();

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
    if (!isOnline) { toast.error("Kein Internet — Pack-Aktualisierung nicht möglich"); return; }
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

      // Persist to localStorage
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
    toast.success("Offline-Daten gelöscht");
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
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <WifiOff className="w-5 h-5 text-teal-400" />
            <h1 className="text-lg font-bold text-white">Offline-Angelpack</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-xs text-gray-400">{isOnline ? "Online" : "Offline"}</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Status-Banner */}
        {!isOnline && (
          <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-700/40 flex items-center gap-2">
            <CloudOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">Offline-Modus aktiv — gespeicherte Daten werden genutzt.</p>
          </div>
        )}

        {anyStale && isOnline && (
          <div className="p-3 rounded-xl bg-orange-900/20 border border-orange-700/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <p className="text-xs text-orange-300">Einige Daten sind älter als 24 Stunden.</p>
            </div>
            <Button size="sm" className="bg-orange-700 hover:bg-orange-600 text-white h-7 text-xs" onClick={downloadAll}>
              <RefreshCw className="w-3 h-3 mr-1" /> Alle aktualisieren
            </Button>
          </div>
        )}

        {/* Übersicht */}
        <Card className="bg-gray-800/40 border-gray-700/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-white">Pack-Übersicht</p>
                <p className="text-xs text-gray-400">
                  {totalKB > 0 ? `${formatBytes(totalKB)} lokal gespeichert` : "Noch kein Inhalt heruntergeladen"}
                </p>
              </div>
              {allReady ? (
                <Badge className="bg-green-800/50 text-green-300 border border-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" /> Bereit
                </Badge>
              ) : (
                <Button
                  size="sm"
                  className="bg-teal-700 hover:bg-teal-600 text-white h-7 text-xs"
                  onClick={downloadAll}
                  disabled={!isOnline || Object.values(downloading).some(Boolean)}
                >
                  <Download className="w-3 h-3 mr-1" /> Alles laden
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sektionen */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Inhalte</p>

          {PACK_SECTIONS.map(sec => {
            const Icon = sec.icon;
            const secMeta = meta[sec.id];
            const hasData = !!secMeta?.ts;
            const stale   = hasData && isStale(secMeta.ts);
            const dlActive = downloading[sec.id];
            const prog    = progress[sec.id];

            return (
              <Card key={sec.id} className="border-gray-700/50 bg-gray-800/40">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${sec.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-white">{sec.label}</p>
                          {hasData && !stale && (
                            <Badge variant="outline" className="text-xs text-green-400 border-green-700 bg-green-900/20">
                              <CheckCircle className="w-2.5 h-2.5 mr-1" />Aktuell
                            </Badge>
                          )}
                          {stale && (
                            <Badge variant="outline" className="text-xs text-orange-400 border-orange-700 bg-orange-900/20">
                              <Clock className="w-2.5 h-2.5 mr-1" />Veraltet
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{sec.description}</p>
                        {hasData && (
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <span>{secMeta.count} Einträge · {formatBytes(secMeta.sizeKB)}</span>
                            <span>·</span>
                            <span>{formatDate(secMeta.ts)}</span>
                          </p>
                        )}
                        {dlActive && prog !== undefined && (
                          <div className="mt-2">
                            <Progress value={prog} className="h-1.5 bg-gray-700" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {hasData && (
                        <button
                          onClick={() => deleteSection(sec.id)}
                          className="p-1.5 rounded hover:bg-red-900/30 text-gray-600 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <Button
                        size="sm"
                        variant={hasData ? "outline" : "default"}
                        className={hasData
                          ? "border-gray-600 text-gray-300 hover:bg-gray-700 h-7 text-xs"
                          : "bg-teal-700 hover:bg-teal-600 text-white h-7 text-xs"
                        }
                        onClick={() => downloadSection(sec.id)}
                        disabled={!isOnline || dlActive}
                      >
                        {dlActive ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            {hasData ? <RefreshCw className="w-3 h-3 mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                            {hasData ? "Aktualisieren" : "Laden"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Schonzeiten-Vorschau (wenn geladen) */}
        {meta.rules?.ts && (
          <Card className="bg-gray-800/40 border-gray-700/40">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Offline-Schonzeiten (Vorschau)</p>
                <button
                  onClick={() => setExpandedRules(v => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  {expandedRules ? "Weniger" : "Alle anzeigen"}
                </button>
              </div>
              <div className="space-y-1.5">
                {(expandedRules ? OFFLINE_RULES : OFFLINE_RULES.slice(0, 5)).map(r => (
                  <div key={r.species} className="flex items-start justify-between gap-2 py-1 border-b border-gray-700/30 last:border-0">
                    <span className="text-sm text-white font-medium">{r.species}</span>
                    <div className="text-right">
                      <p className="text-xs text-amber-300">{r.schonzeit}</p>
                      <p className="text-xs text-gray-500">Mindestmaß: {r.mindestmaß}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Card className="bg-gray-800/20 border-gray-700/30">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-500">
              Offline-Daten werden im lokalen Gerätespeicher gesichert. Sie sind auch ohne Internetverbindung abrufbar.
              Schonzeiten-Angaben sind Richtwerte — lokale Regelungen des Angelverbands können abweichen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
