import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Bell, BellOff, Fish, CloudLightning, Trophy, Users,
  Wrench, Info, Clock, Trash2, CheckCheck, ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

const CATEGORY_CONFIG = {
  catch:    { label: "Fangbuch",         icon: Fish,          color: "text-cyan-400",   bg: "bg-cyan-900/20 border-cyan-700/40" },
  weather:  { label: "Wetterwarnungen",  icon: CloudLightning,color: "text-amber-400",  bg: "bg-amber-900/20 border-amber-700/40" },
  events:   { label: "Events",           icon: Trophy,        color: "text-purple-400", bg: "bg-purple-900/20 border-purple-700/40" },
  community:{ label: "Community",        icon: Users,         color: "text-blue-400",   bg: "bg-blue-900/20 border-blue-700/40" },
  gear:     { label: "Ausrüstung",       icon: Wrench,        color: "text-orange-400", bg: "bg-orange-900/20 border-orange-700/40" },
  system:   { label: "System",           icon: Bell,          color: "text-gray-400",   bg: "bg-gray-800/40 border-gray-700/40" },
};

const STORAGE_KEY_ENABLED  = "bb_action_notifications_enabled";
const STORAGE_KEY_CATS     = "bb_notification_category_prefs";
const STORAGE_KEY_QUIET_START = "bb_quiet_hours_start";
const STORAGE_KEY_QUIET_END   = "bb_quiet_hours_end";
const STORAGE_KEY_HISTORY  = "bb_notification_history";

function loadPref(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function formatRelative(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000)  return "Gerade eben";
  if (diff < 3600000) return `vor ${Math.floor(diff / 60000)} Min.`;
  if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std.`;
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function NotificationItem({ item, onDelete }) {
  const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.system;
  const Icon = cfg.icon;
  const [showReason, setShowReason] = useState(false);

  return (
    <Card className={`border ${cfg.bg} transition-all`}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex-shrink-0 ${cfg.color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-white leading-snug">{item.title}</p>
                {item.body && <p className="text-xs text-gray-400 mt-0.5">{item.body}</p>}
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0">{formatRelative(item.ts)}</span>
            </div>

            {item.reason && (
              <div className="mt-1.5">
                <button
                  onClick={() => setShowReason(v => !v)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  <Info className="w-3 h-3" />
                  Warum bekomme ich das?
                  {showReason ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showReason && (
                  <p className="mt-1 text-xs text-gray-500 pl-4 italic">{item.reason}</p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 rounded hover:bg-gray-700/50 text-gray-600 hover:text-red-400 transition flex-shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationCenter() {
  useFeatureTracking("notification_center");
  const navigate = useNavigate();

  const [globalEnabled, setGlobalEnabled]     = useState(() => loadPref(STORAGE_KEY_ENABLED, true));
  const [categoryPrefs, setCategoryPrefs]     = useState(() => loadPref(STORAGE_KEY_CATS, {
    catch: true, weather: true, events: true, community: true, gear: true, system: true,
  }));
  const [quietStart, setQuietStart]           = useState(() => loadPref(STORAGE_KEY_QUIET_START, "22:00"));
  const [quietEnd,   setQuietEnd]             = useState(() => loadPref(STORAGE_KEY_QUIET_END,   "07:00"));
  const [history,    setHistory]              = useState(loadHistory);
  const [activeFilter, setActiveFilter]       = useState("all");
  const [permission, setPermission]           = useState("default");

  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  useEffect(() => { savePref(STORAGE_KEY_ENABLED,   globalEnabled); }, [globalEnabled]);
  useEffect(() => { savePref(STORAGE_KEY_CATS,       categoryPrefs); }, [categoryPrefs]);
  useEffect(() => { savePref(STORAGE_KEY_QUIET_START, quietStart); }, [quietStart]);
  useEffect(() => { savePref(STORAGE_KEY_QUIET_END,   quietEnd); }, [quietEnd]);

  const requestPermission = async () => {
    if (!("Notification" in window)) { toast.error("Benachrichtigungen werden auf diesem Gerät nicht unterstützt"); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") toast.success("Benachrichtigungen aktiviert");
    else toast.error("Berechtigung verweigert");
  };

  const toggleCategory = useCallback((cat) => {
    setCategoryPrefs(prev => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const deleteItem = useCallback((id) => {
    setHistory(prev => {
      const next = prev.filter(n => n.id !== id);
      try { localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    try { localStorage.removeItem(STORAGE_KEY_HISTORY); } catch {}
    toast.success("Verlauf geleert");
  }, []);

  const filtered = activeFilter === "all"
    ? history
    : history.filter(n => n.category === activeFilter);

  const unreadCount = history.filter(n => !n.read).length;

  const isInQuietHours = () => {
    const now   = new Date();
    const [sh, sm] = quietStart.split(":").map(Number);
    const [eh, em] = quietEnd.split(":").map(Number);
    const mins  = now.getHours() * 60 + now.getMinutes();
    const start = sh * 60 + sm;
    const end   = eh * 60 + em;
    if (start <= end) return mins >= start && mins < end;
    return mins >= start || mins < end; // crosses midnight
  };

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <Bell className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-bold text-white">Benachrichtigungen</h1>
            {unreadCount > 0 && (
              <Badge className="bg-blue-600 text-white text-xs px-1.5">{unreadCount}</Badge>
            )}
          </div>
          {history.length > 0 && (
            <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition">
              <Trash2 className="w-3.5 h-3.5" /> Alle löschen
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Permission Banner */}
        {permission !== "granted" && (
          <div className="p-3 rounded-xl bg-blue-900/20 border border-blue-700/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-xs text-blue-300">
                {permission === "denied"
                  ? "Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben."
                  : "Erlaube Benachrichtigungen, um keine wichtigen Meldungen zu verpassen."}
              </p>
            </div>
            {permission !== "denied" && (
              <Button size="sm" className="bg-blue-700 hover:bg-blue-600 text-white h-7 text-xs flex-shrink-0" onClick={requestPermission}>
                Erlauben
              </Button>
            )}
          </div>
        )}

        {/* Globaler Schalter + Ruhemodus */}
        <Card className="bg-gray-800/40 border-gray-700/40">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {globalEnabled ? <Bell className="w-4 h-4 text-blue-400" /> : <BellOff className="w-4 h-4 text-gray-500" />}
                <span className="text-sm font-medium text-white">Benachrichtigungen</span>
              </div>
              <Switch checked={globalEnabled} onCheckedChange={setGlobalEnabled} />
            </div>

            {globalEnabled && (
              <div className="space-y-2 pt-1 border-t border-gray-700/40">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Ruhezeiten (keine Benachrichtigungen)</span>
                  {isInQuietHours() && (
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-700 bg-amber-900/20">Aktiv</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Von</span>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={e => setQuietStart(e.target.value)}
                    className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1"
                  />
                  <span className="text-xs text-gray-500">bis</span>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={e => setQuietEnd(e.target.value)}
                    className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kategorien */}
        {globalEnabled && (
          <Card className="bg-gray-800/40 border-gray-700/40">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Kategorien</p>
              <div className="space-y-2.5">
                {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <div key={cat} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                        <span className="text-sm text-white">{cfg.label}</span>
                      </div>
                      <Switch
                        checked={categoryPrefs[cat] ?? true}
                        onCheckedChange={() => toggleCategory(cat)}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Verlauf */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Verlauf</p>
            <span className="text-xs text-gray-600">{filtered.length} Einträge</span>
          </div>

          {/* Filter-Chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter("all")}
              className={`text-xs px-3 py-1 rounded-full border transition ${activeFilter === "all" ? "bg-blue-700 border-blue-600 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}
            >
              Alle
            </button>
            {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={`text-xs px-3 py-1 rounded-full border transition ${activeFilter === cat ? "bg-gray-700 border-gray-500 text-white" : "border-gray-700/50 text-gray-500 hover:border-gray-600"}`}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3">
              <CheckCheck className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-500">Keine Benachrichtigungen</p>
              <p className="text-xs text-gray-600">
                {activeFilter === "all" ? "Du bist auf dem neuesten Stand." : `Keine ${CATEGORY_CONFIG[activeFilter]?.label ?? ""}-Meldungen.`}
              </p>
            </div>
          )}

          {filtered.map(item => (
            <NotificationItem key={item.id} item={item} onDelete={deleteItem} />
          ))}
        </div>
      </div>
    </div>
  );
}
