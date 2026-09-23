import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Wrench, Plus, Trash2, Calendar, AlertTriangle, CheckCircle, Loader2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { gearMaintenance, ai, entities } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const URGENCY_STYLE = {
  "Sofort":       "bg-red-900/40 text-red-300 border-red-700",
  "Bald":         "bg-amber-900/40 text-amber-300 border-amber-700",
  "Routinemäßig": "bg-blue-900/40 text-blue-300 border-blue-700",
  "OK":           "bg-green-900/40 text-green-300 border-green-700",
};

const MAINTENANCE_ACTIONS = [
  "Schnurwechsel",
  "Rollenpflege / Ölen",
  "Rutenkontrolle",
  "Hakenprüfung",
  "Köderbox aufräumen",
  "Verbindungen prüfen",
  "Reinigung",
  "Reparatur",
  "Sonstiges",
];

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isOverdue(next_due_at) {
  if (!next_due_at) return false;
  return new Date(next_due_at) < new Date();
}

export default function GearMaintenance() {
  useFeatureTracking("gear_maintenance");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showLog, setShowLog]     = useState(false);
  const [logForm, setLogForm]     = useState({ gear_item_id: "", gear_name: "", category: "Sonstiges", action: "", notes: "", next_due_at: "" });
  const [gearItems, setGearItems] = useState([]);
  const [aiTips, setAiTips]       = useState(null);
  const [loadingTips, setLoadingTips] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["gear-maintenance"],
    queryFn: () => gearMaintenance.list(),
  });

  const { data: usageData = [] } = useQuery({
    queryKey: ["gear-usage"],
    queryFn: () => gearMaintenance.usage(),
  });

  const logMutation = useMutation({
    mutationFn: (entry) => gearMaintenance.log(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gear-maintenance"] });
      toast.success("Wartung eingetragen");
      setShowLog(false);
      setLogForm({ gear_item_id: "", gear_name: "", category: "Sonstiges", action: "", notes: "", next_due_at: "" });
    },
    onError: (e) => toast.error("Fehler: " + (e?.message || "Speichern fehlgeschlagen")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => gearMaintenance.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gear-maintenance"] });
      toast.success("Eintrag gelöscht");
    },
  });

  // Ausrüstungsliste für Dropdown
  useEffect(() => {
    entities.GearItem.list().then(items => setGearItems(Array.isArray(items) ? items : [])).catch(() => {});
  }, []);

  const handleGearSelect = (id) => {
    const item = gearItems.find(g => g.id === id);
    if (item) setLogForm(f => ({ ...f, gear_item_id: id, gear_name: item.name || "", category: item.category || "Sonstiges" }));
  };

  const handleSubmit = () => {
    if (!logForm.gear_name?.trim() || !logForm.action?.trim()) {
      toast.error("Ausrüstung und Aktion erforderlich");
      return;
    }
    logMutation.mutate(logForm);
  };

  const loadAiTips = async () => {
    if (gearItems.length === 0) { toast.info("Zuerst Ausrüstung anlegen"); return; }
    setLoadingTips(true);
    try {
      const enriched = gearItems.slice(0, 20).map(g => {
        const usage = usageData.find(u => u.gear_item_id === g.id);
        const lastMaint = logs.find(l => l.gear_item_id === g.id);
        return {
          name: g.name,
          category: g.category || "Sonstiges",
          tripCount: usage?.trip_count || 0,
          lastMaintained: lastMaint ? formatDate(lastMaint.performed_at) : "Nie",
        };
      });
      const res = await ai.gearMaintenanceTips(enriched);
      setAiTips(res);
    } catch {
      toast.error("KI-Tipps konnten nicht geladen werden");
    } finally {
      setLoadingTips(false);
    }
  };

  // Fällige Wartungen: logs mit next_due_at in der Vergangenheit
  const overdue = logs.filter(l => isOverdue(l.next_due_at));

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bb-bg)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur px-4 py-3" style={{ background: 'var(--bb-surface)', borderBottom: '1px solid var(--bb-border)' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg" style={{ color: 'var(--bb-muted)' }}>
              <ArrowLeft size={20} />
            </button>
            <Wrench size={20} style={{ color: '#f59e0b' }} />
            <h1 className="text-lg font-bold" style={{ color: 'var(--bb-text)' }}>Ausrüstungswartung</h1>
          </div>
          <button
            className="bb-action h-8 text-sm"
            style={{ background: '#b45309' }}
            onClick={() => setShowLog(true)}
          >
            <Plus size={14} className="mr-1" />
            Eintragen
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Überfällige Wartungen */}
        {overdue.length > 0 && (
          <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="flex items-center gap-2" style={{ color: '#f87171' }}>
              <AlertTriangle size={16} />
              <span className="text-sm font-semibold">{overdue.length} überfällige Wartung{overdue.length > 1 ? "en" : ""}</span>
            </div>
            {overdue.map(l => (
              <p key={l.id} className="text-xs pl-6" style={{ color: '#fca5a5' }}>
                {l.gear_name} — {l.action} (fällig {formatDate(l.next_due_at)})
              </p>
            ))}
          </div>
        )}

        {/* KI-Tipps */}
        <div className="bb-card" style={{ background: 'var(--bb-surface)' }}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} style={{ color: '#facc15' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--bb-text)' }}>KI-Wartungsanalyse</span>
              </div>
              <button
                className="bb-secondary h-7 text-xs"
                style={{ borderColor: '#a16207', color: '#fde047' }}
                onClick={loadAiTips}
                disabled={loadingTips}
              >
                {loadingTips ? <Loader2 size={12} className="animate-spin" /> : "Analysieren"}
              </button>
            </div>

            {aiTips && (
              <div className="space-y-2">
                {aiTips.generalTip && (
                  <p className="text-xs italic" style={{ color: 'var(--bb-muted)' }}>{aiTips.generalTip}</p>
                )}
                {(aiTips.recommendations || []).map((rec, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg" style={{ background: 'var(--bb-bg)' }}>
                    <span className={`bb-pill-info text-xs mt-0.5 flex-shrink-0 border ${URGENCY_STYLE[rec.urgency] || URGENCY_STYLE["Routinemäßig"]}`}>
                      {rec.urgency}
                    </span>
                    <div>
                      <p className="text-xs font-medium" style={{ color: 'var(--bb-text)' }}>{rec.itemName}</p>
                      <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{rec.action}</p>
                      {rec.reason && <p className="text-xs mt-0.5" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>{rec.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!aiTips && !loadingTips && (
              <p className="text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>Analysiert Nutzung und letzte Wartungen deiner Ausrüstung.</p>
            )}
          </div>
        </div>

        {/* Wartungsprotokoll */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bb-muted)' }}>Protokoll</p>
            <span className="text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.5 }}>{logs.length} Einträge</span>
          </div>

          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--bb-muted)' }} />
            </div>
          )}

          {!isLoading && logs.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <Wrench size={40} style={{ color: 'var(--bb-border)' }} />
              <p className="text-sm" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>Noch keine Wartungen eingetragen.</p>
              <p className="text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.4 }}>Trage Schnurwechsel, Rollenpflege & Co. ein, um Wartungsintervalle zu verfolgen.</p>
            </div>
          )}

          {logs.map(log => (
            <div
              key={log.id}
              className="bb-card"
              style={{
                borderColor: isOverdue(log.next_due_at) ? 'rgba(239,68,68,0.4)' : 'var(--bb-border)',
                background: isOverdue(log.next_due_at) ? 'rgba(239,68,68,0.05)' : 'var(--bb-surface)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} style={{ color: '#22c55e' }} className="flex-shrink-0" />
                    <span className="text-sm font-medium" style={{ color: 'var(--bb-text)' }}>{log.gear_name}</span>
                    <span className="bb-pill-info text-xs" style={{ background: 'var(--bb-bg)', color: 'var(--bb-muted)' }}>{log.category}</span>
                  </div>
                  <p className="text-xs mt-1 pl-5" style={{ color: 'var(--bb-muted)' }}>{log.action}</p>
                  {log.notes && <p className="text-xs mt-0.5 pl-5" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>{log.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5 pl-5 text-xs" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(log.performed_at)}
                    </span>
                    {log.next_due_at && (
                      <span style={{ color: isOverdue(log.next_due_at) ? '#f87171' : 'var(--bb-muted)' }}>
                        nächste: {formatDate(log.next_due_at)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(log.id)}
                  className="p-1.5 rounded transition"
                  style={{ color: 'var(--bb-muted)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Wartung eintragen Dialog */}
      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-base">Wartung eintragen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {gearItems.length > 0 ? (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Ausrüstung</label>
                <Select onValueChange={handleGearSelect}>
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white text-sm">
                    <SelectValue placeholder="Ausrüstungsgegenstand wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {gearItems.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Ausrüstungsname</label>
                <Input
                  value={logForm.gear_name}
                  onChange={e => setLogForm(f => ({ ...f, gear_name: e.target.value }))}
                  placeholder="z.B. Shimano Sienna 2500"
                  className="bg-gray-800 border-gray-600 text-white text-sm"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Aktion</label>
              <Select value={logForm.action} onValueChange={v => setLogForm(f => ({ ...f, action: v }))}>
                <SelectTrigger className="bg-gray-800 border-gray-600 text-white text-sm">
                  <SelectValue placeholder="Was wurde gemacht?" />
                </SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Notizen (optional)</label>
              <Textarea
                value={logForm.notes}
                onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Details zur Wartung ..."
                className="bg-gray-800 border-gray-600 text-white text-sm resize-none"
                rows={2}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nächste Wartung (optional)</label>
              <Input
                type="date"
                value={logForm.next_due_at}
                onChange={e => setLogForm(f => ({ ...f, next_due_at: e.target.value }))}
                className="bg-gray-800 border-gray-600 text-white text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowLog(false)} className="p-2 rounded-lg" style={{ color: 'var(--bb-muted)' }}>Abbrechen</button>
            <button
              onClick={handleSubmit}
              disabled={logMutation.isPending}
              className="bb-action"
              style={{ background: '#b45309' }}
            >
              {logMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Speichern"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
