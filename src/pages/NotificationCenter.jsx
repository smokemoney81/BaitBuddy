import React, { useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, Fish, CloudLightning, Trophy, Users,
  Wrench, Info, Clock, Trash2, CheckCheck, ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PageTitle from "@/components/layout/PageTitle";

const CATEGORY_CONFIG = {
  catch:    { label: "Fangbuch",         icon: Fish,          color: "var(--bb-cyan)",   bg: "rgba(8,145,178,0.2)", borderColor: "rgba(14,116,144,0.4)" },
  weather:  { label: "Wetterwarnungen",  icon: CloudLightning,color: "#fbbf24",          bg: "rgba(120,53,15,0.2)", borderColor: "rgba(161,98,7,0.4)" },
  events:   { label: "Events",           icon: Trophy,        color: "#c084fc",          bg: "rgba(88,28,135,0.2)", borderColor: "rgba(126,34,206,0.4)" },
  community:{ label: "Community",        icon: Users,         color: "#60a5fa",          bg: "rgba(30,58,138,0.2)", borderColor: "rgba(37,99,235,0.4)" },
  gear:     { label: "Ausrüstung",       icon: Wrench,        color: "#fb923c",          bg: "rgba(124,45,18,0.2)", borderColor: "rgba(194,65,12,0.4)" },
  system:   { label: "System",           icon: Bell,          color: "var(--bb-muted)",  bg: "rgba(31,41,55,0.4)", borderColor: "rgba(55,65,81,0.4)" },
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
    <div className="bb-card transition-all" style={{ background: cfg.bg, borderColor: cfg.borderColor }}>
      <div className="pt-3 pb-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0" style={{ color: cfg.color }}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-white leading-snug">{item.title}</p>
                {item.body && <p className="text-xs mt-0.5" style={{ color: 'var(--bb-muted)' }}>{item.body}</p>}
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: 'rgba(75,85,99,0.8)' }}>{formatRelative(item.ts)}</span>
            </div>

            {item.reason && (
              <div className="mt-1.5">
                <button
                  onClick={() => setShowReason(v => !v)}
                  className="flex items-center gap-1 text-xs transition"
                  style={{ color: 'var(--bb-muted)' }}
                >
                  <Info size={12} />
                  Warum bekomme ich das?
                  {showReason ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showReason && (
                  <p className="mt-1 text-xs pl-4 italic" style={{ color: 'var(--bb-muted)' }}>{item.reason}</p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 rounded hover:bg-gray-700/50 hover:text-red-400 transition flex-shrink-0"
            style={{ color: 'rgba(75,85,99,0.8)' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationCenter() {
  useFeatureTracking("notification_center");

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
    <div className="bb-page" style={{ paddingBottom: '6rem' }}>
      {/* Header */}
      <div>
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <PageTitle
            className="flex-1 min-w-0"
            title="Deine Benachrichtigungen"
            subtitle={unreadCount > 0 ? `${unreadCount} ungelesen` : 'Wetter, Fänge, Events und mehr.'}
          />
          {history.length > 0 && (
            <button onClick={clearAll} className="text-xs flex items-center gap-1 transition hover:text-red-400" style={{ color: 'var(--bb-muted)' }}>
              <Trash2 size={14} /> Alle löschen
            </button>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Permission Banner */}
        {permission !== "granted" && (
          <div className="p-3 rounded-xl flex items-center justify-between gap-3" style={{ background: 'rgba(30,58,138,0.2)', border: '1px solid rgba(37,99,235,0.4)' }}>
            <div className="flex items-center gap-2">
              <Bell size={16} className="flex-shrink-0" style={{ color: '#60a5fa' }} />
              <p className="text-xs" style={{ color: '#93c5fd' }}>
                {permission === "denied"
                  ? "Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben."
                  : "Erlaube Benachrichtigungen, um keine wichtigen Meldungen zu verpassen."}
              </p>
            </div>
            {permission !== "denied" && (
              <button className="bb-action text-xs flex-shrink-0" style={{ background: '#1d4ed8', padding: '0.25rem 0.75rem' }} onClick={requestPermission}>
                Erlauben
              </button>
            )}
          </div>
        )}

        {/* Globaler Schalter + Ruhemodus */}
        <div className="bb-card" style={{ background: 'rgba(31,41,55,0.4)', borderColor: 'rgba(55,65,81,0.4)' }}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {globalEnabled ? <Bell size={16} style={{ color: '#60a5fa' }} /> : <BellOff size={16} style={{ color: 'var(--bb-muted)' }} />}
                <span className="text-sm font-medium text-white">Benachrichtigungen</span>
              </div>
              <Switch checked={globalEnabled} onCheckedChange={setGlobalEnabled} />
            </div>

            {globalEnabled && (
              <div className="space-y-2 pt-1" style={{ borderTop: '1px solid rgba(55,65,81,0.4)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} style={{ color: 'var(--bb-muted)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--bb-muted)' }}>Ruhezeiten (keine Benachrichtigungen)</span>
                  {isInQuietHours() && (
                    <span className="bb-pill-info" style={{ fontSize: '0.75rem', color: '#fbbf24', border: '1px solid rgba(161,98,7,0.7)', background: 'rgba(120,53,15,0.2)' }}>Aktiv</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--bb-muted)' }}>Von</span>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={e => setQuietStart(e.target.value)}
                    className="border text-white text-xs rounded px-2 py-1"
                    style={{ background: 'var(--bb-surface)', borderColor: 'var(--bb-border)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--bb-muted)' }}>bis</span>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={e => setQuietEnd(e.target.value)}
                    className="border text-white text-xs rounded px-2 py-1"
                    style={{ background: 'var(--bb-surface)', borderColor: 'var(--bb-border)' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Kategorien */}
        {globalEnabled && (
          <div className="bb-card" style={{ background: 'rgba(31,41,55,0.4)', borderColor: 'rgba(55,65,81,0.4)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--bb-muted)' }}>Kategorien</p>
              <div className="space-y-2.5">
                {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <div key={cat} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Icon size={16} style={{ color: cfg.color }} />
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
            </div>
          </div>
        )}

        {/* Verlauf */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bb-muted)' }}>Verlauf</p>
            <span className="text-xs" style={{ color: 'rgba(75,85,99,0.8)' }}>{filtered.length} Einträge</span>
          </div>

          {/* Filter-Chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter("all")}
              className="text-xs px-3 py-1 rounded-full border transition"
              style={activeFilter === "all"
                ? { background: '#1d4ed8', borderColor: '#2563eb', color: '#fff' }
                : { borderColor: 'var(--bb-border)', color: 'var(--bb-muted)' }
              }
            >
              Alle
            </button>
            {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className="text-xs px-3 py-1 rounded-full border transition"
                style={activeFilter === cat
                  ? { background: 'var(--bb-surface)', borderColor: 'rgba(107,114,128,0.5)', color: '#fff' }
                  : { borderColor: 'rgba(55,65,81,0.5)', color: 'var(--bb-muted)' }
                }
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3">
              <CheckCheck size={40} style={{ color: 'rgba(55,65,81,0.7)' }} />
              <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Keine Benachrichtigungen</p>
              <p className="text-xs" style={{ color: 'rgba(75,85,99,0.8)' }}>
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
