import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <Wrench className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-bold text-white">Ausrüstungswartung</h1>
          </div>
          <Button
            size="sm"
            className="bg-amber-700 hover:bg-amber-600 text-white h-8"
            onClick={() => setShowLog(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Eintragen
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Überfällige Wartungen */}
        {overdue.length > 0 && (
          <div className="p-3 rounded-xl bg-red-900/20 border border-red-700/40 space-y-2">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-semibold">{overdue.length} überfällige Wartung{overdue.length > 1 ? "en" : ""}</span>
            </div>
            {overdue.map(l => (
              <p key={l.id} className="text-xs text-red-300 pl-6">
                {l.gear_name} — {l.action} (fällig {formatDate(l.next_due_at)})
              </p>
            ))}
          </div>
        )}

        {/* KI-Tipps */}
        <Card className="bg-gray-800/40 border-gray-700/40">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-white">KI-Wartungsanalyse</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-yellow-700 text-yellow-300 hover:bg-yellow-900/30 h-7 text-xs"
                onClick={loadAiTips}
                disabled={loadingTips}
              >
                {loadingTips ? <Loader2 className="w-3 h-3 animate-spin" /> : "Analysieren"}
              </Button>
            </div>

            {aiTips && (
              <div className="space-y-2">
                {aiTips.generalTip && (
                  <p className="text-xs text-gray-400 italic">{aiTips.generalTip}</p>
                )}
                {(aiTips.recommendations || []).map((rec, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-700/40">
                    <Badge variant="outline" className={`text-xs mt-0.5 flex-shrink-0 ${URGENCY_STYLE[rec.urgency] || URGENCY_STYLE["Routinemäßig"]}`}>
                      {rec.urgency}
                    </Badge>
                    <div>
                      <p className="text-xs font-medium text-white">{rec.itemName}</p>
                      <p className="text-xs text-gray-400">{rec.action}</p>
                      {rec.reason && <p className="text-xs text-gray-500 mt-0.5">{rec.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!aiTips && !loadingTips && (
              <p className="text-xs text-gray-500">Analysiert Nutzung und letzte Wartungen deiner Ausrüstung.</p>
            )}
          </CardContent>
        </Card>

        {/* Wartungsprotokoll */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Protokoll</p>
            <span className="text-xs text-gray-600">{logs.length} Einträge</span>
          </div>

          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          )}

          {!isLoading && logs.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <Wrench className="w-10 h-10 text-gray-700" />
              <p className="text-sm text-gray-500">Noch keine Wartungen eingetragen.</p>
              <p className="text-xs text-gray-600">Trage Schnurwechsel, Rollenpflege & Co. ein, um Wartungsintervalle zu verfolgen.</p>
            </div>
          )}

          {logs.map(log => (
            <Card key={log.id} className={`border ${isOverdue(log.next_due_at) ? "border-red-800/60 bg-red-950/20" : "border-gray-700/50 bg-gray-800/40"}`}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-white">{log.gear_name}</span>
                      <Badge variant="secondary" className="text-xs bg-gray-700/60 text-gray-300">{log.category}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 pl-5">{log.action}</p>
                    {log.notes && <p className="text-xs text-gray-500 mt-0.5 pl-5">{log.notes}</p>}
                    <div className="flex items-center gap-3 mt-1.5 pl-5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(log.performed_at)}
                      </span>
                      {log.next_due_at && (
                        <span className={isOverdue(log.next_due_at) ? "text-red-400" : "text-gray-500"}>
                          nächste: {formatDate(log.next_due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(log.id)}
                    className="p-1.5 rounded hover:bg-red-900/30 text-gray-600 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
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
                placeholder="Details zur Wartung …"
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
            <Button variant="ghost" onClick={() => setShowLog(false)} className="text-gray-400">Abbrechen</Button>
            <Button
              onClick={handleSubmit}
              disabled={logMutation.isPending}
              className="bg-amber-700 hover:bg-amber-600 text-white"
            >
              {logMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
