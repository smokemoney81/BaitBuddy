import React, { useState, useEffect, useMemo } from "react";
import { User } from "@/entities/User";
import { analytics, events } from "@/api/frontendClient";
import { useEventActivityTracking } from "@/hooks/useEventActivityTracking";
import PremiumGuard from "@/components/premium/PremiumGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FishingPlan } from "@/entities/FishingPlan";
import {
  Trash2, Plus, Power, Navigation, Clock, ExternalLink, Save,
  MapPin, Fish, Calendar, Pencil, ListChecks, Compass, Users, Anchor, Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "@/components/location/LocationManager";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import TripLiveTicker from "@/components/LiveTrip/TripLiveTicker";
import TripPlannerWizard from "@/components/trip/TripPlannerWizard";
import { notifyAction, actionMessages } from "@/lib/actionNotifications";

// spot_info normalisieren (Objekt = neu, String = alte Datensätze).
function readSpot(spotInfo) {
  if (spotInfo && typeof spotInfo === "object") {
    return {
      name: spotInfo.name || "",
      water_type: spotInfo.water_type || "",
      lat: spotInfo.lat != null ? Number(spotInfo.lat) : null,
      lon: spotInfo.lon != null ? Number(spotInfo.lon) : null,
    };
  }
  const text = typeof spotInfo === "string" ? spotInfo : "";
  const m = text.match(/Koordinaten:\s*([\d.\-]+),\s*([\d.\-]+)/);
  return {
    name: text.split("\n")[0] || "",
    water_type: "",
    lat: m ? parseFloat(m[1]) : null,
    lon: m ? parseFloat(m[2]) : null,
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function TripPlannerContent() {
  useFeatureTracking("fishing_plan");
  const { trackTripFinish } = useEventActivityTracking();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const { currentLocation } = useLocation();
  const [offlineNotes, setOfflineNotes] = useState({});
  const [editingNotes, setEditingNotes] = useState({});
  const [formOpen, setFormOpen] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const [editingPlan, setEditingPlan] = useState(null);
  const [activeEventId, setActiveEventId] = useState(null);

  useEffect(() => {
    loadPlans();
    loadOfflineNotes();

    const loadActiveEvent = async () => {
      try {
        const event = await events.getActiveEvent();
        if (event?.active_event?.id) {
          setActiveEventId(event.active_event.id);
        }
      } catch {
        // Event loading non-critical
      }
    };
    loadActiveEvent();
  }, []);

  const loadOfflineNotes = () => {
    try {
      setOfflineNotes(JSON.parse(localStorage.getItem("trip_offline_notes") || "{}"));
    } catch (error) {
      console.warn('TripPlanner: Offline-Notizen konnten nicht gelesen werden:', error);
    }
  };

  const saveOfflineNotes = (planId, notes) => {
    const updated = { ...offlineNotes, [planId]: notes };
    setOfflineNotes(updated);
    localStorage.setItem("trip_offline_notes", JSON.stringify(updated));
    toast.success("Notiz gespeichert");
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const fetched = await FishingPlan.list("-created_at");
      const list = Array.isArray(fetched) ? fetched : [];
      // Aktive und zeitlich nächste Trips zuerst.
      list.sort((a, b) => {
        if (!!b.is_active - !!a.is_active) return !!b.is_active - !!a.is_active;
        const ta = a.planned_date ? new Date(a.planned_date).getTime() : Infinity;
        const tb = b.planned_date ? new Date(b.planned_date).getTime() : Infinity;
        return ta - tb;
      });
      setPlans(list);
      setSelectedPlan((prev) => (prev ? list.find((p) => p.id === prev.id) || null : prev));
    } catch (error) {
      console.error('TripPlanner: Tourenpläne konnten nicht geladen werden:', error);
    }
    setLoading(false);
  };

  const handleSaveTrip = async (payload, planId) => {
    try {
      if (planId) {
        await FishingPlan.update(planId, payload);
        toast.success("Trip aktualisiert");
        const msg = actionMessages.tripUpdated(payload.title);
        notifyAction(msg.title, msg);
      } else {
        await FishingPlan.create(payload);
        toast.success("Trip gespeichert");
        const msg = actionMessages.tripCreated(payload.title);
        notifyAction(msg.title, msg);
        analytics.track({
          eventName: "fishing_plan_created",
          properties: { target_fish: payload.target_fish, has_coords: payload.spot_info?.lat != null },
        });
      }
      await loadPlans();
      window.dispatchEvent(new Event("active-trips-updated"));
    } catch (error) {
      toast.error("Trip konnte nicht gespeichert werden");
      throw error;
    }
  };

  const openNewTrip = () => { setEditingPlan(null); setFormOpen(true); };
  const openEditTrip = (plan) => { setEditingPlan(plan); setFormOpen(true); };

  const openNavigation = (spot) => {
    if (spot.lat == null || spot.lon == null) return;
    const origin = currentLocation?.lat != null ? `${currentLocation.lat},${currentLocation.lon}&` : "";
    const url = `https://www.google.com/maps/dir/?api=1&${origin ? `origin=${currentLocation.lat},${currentLocation.lon}&` : ""}destination=${spot.lat},${spot.lon}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const toggleActivePlan = async (plan) => {
    const newState = !plan.is_active;
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, is_active: newState } : p)));
    setSelectedPlan((prev) => (prev?.id === plan.id ? { ...prev, is_active: newState } : prev));
    try {
      await FishingPlan.update(plan.id, { is_active: newState });
      window.dispatchEvent(new Event("active-trips-updated"));
      if (newState) {
        analytics.track({ eventName: "fishing_trip_started", properties: { target_fish: plan.target_fish } });
      } else if (activeEventId) {
        trackTripFinish(activeEventId);
      }
      toast.success(newState ? "Trip aktiviert" : "Trip deaktiviert");
      const msg = newState
        ? actionMessages.tripActivated(plan.title)
        : actionMessages.tripDeactivated(plan.title);
      notifyAction(msg.title, msg);
    } catch (error) {
      toast.error("Status konnte nicht gespeichert werden");
      await loadPlans();
    }
  };

  const deletePlan = async (planId) => {
    if (!confirm("Trip wirklich löschen?")) return;
    try {
      await FishingPlan.delete(planId);
      await loadPlans();
      if (selectedPlan?.id === planId) setSelectedPlan(null);
      window.dispatchEvent(new Event("active-trips-updated"));
      toast.success("Trip gelöscht");
      const msg = actionMessages.tripDeleted();
      notifyAction(msg.title, msg);
    } catch (error) {
      toast.error("Trip konnte nicht gelöscht werden");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 p-6">
        <div className="max-w-6xl mx-auto animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/3" />
          <div className="h-16 bg-gray-800 rounded" />
          <div className="h-32 bg-gray-800 rounded" />
          <div className="h-32 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-6 pb-32">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">
              Meine Trips
            </h1>
            <p className="text-sm text-gray-400">Plane deine Touren mit allen Details — und sammle durch Nutzung Event-Punkte.</p>
          </div>
          <Button onClick={openNewTrip} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" /> Neuer Trip
          </Button>
        </div>

        <TripLiveTicker plans={plans} />

        {formOpen ? (
          <div className="max-w-2xl mx-auto">
            <TripPlannerWizard
              key={`wizard-${editingPlan?.id || 'new'}`}
              onClose={() => setFormOpen(false)}
              onSave={handleSaveTrip}
              plan={editingPlan}
              currentLocation={currentLocation}
            />
          </div>
        ) : plans.length === 0 ? (
          <Card className="glass-morphism border-gray-800">
            <CardContent className="p-8 text-center">
              <Compass className="w-12 h-12 text-cyan-500/70 mx-auto mb-3" />
              <h3 className="text-xl font-semibold text-cyan-400 mb-2">Noch keine Trips geplant</h3>
              <p className="text-gray-400 mb-6">Lege deinen ersten Trip an und trag alles ein, was deine Tour braucht.</p>
              <Button onClick={openNewTrip} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> Ersten Trip planen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Liste */}
            <div className="space-y-4">
              {plans.map((plan) => {
                const spot = readSpot(plan.spot_info);
                const when = formatDateTime(plan.planned_date);
                const details = plan.details && typeof plan.details === "object" ? plan.details : {};
                const distance =
                  spot.lat != null && currentLocation?.lat != null
                    ? haversineKm(currentLocation.lat, currentLocation.lon, spot.lat, spot.lon)
                    : null;

                return (
                  <Card
                    key={plan.id}
                    className={`glass-morphism border-gray-800 cursor-pointer transition-all hover:border-emerald-600/50 ${
                      selectedPlan?.id === plan.id ? "border-emerald-600 bg-emerald-900/20" : ""
                    } ${plan.is_active ? "border-l-4 border-l-emerald-500" : ""}`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <CardTitle className="text-cyan-400 text-lg truncate">{plan.title}</CardTitle>
                          {plan.is_active && <Badge className="bg-emerald-600 text-white text-xs">Aktiv</Badge>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" aria-label={plan.is_active ? "Deaktivieren" : "Aktivieren"}
                            onClick={(e) => { e.stopPropagation(); toggleActivePlan(plan); }}
                            className={plan.is_active ? "text-emerald-400" : "text-gray-400 hover:text-white"}>
                            <Power aria-hidden="true" className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Bearbeiten"
                            onClick={(e) => { e.stopPropagation(); openEditTrip(plan); }}
                            className="text-gray-400 hover:text-white">
                            <Pencil aria-hidden="true" className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Löschen"
                            onClick={(e) => { e.stopPropagation(); deletePlan(plan.id); }}
                            className="text-gray-400 hover:text-red-400">
                            <Trash2 aria-hidden="true" className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {plan.target_fish && <Badge className="bg-cyan-900/60 text-cyan-200 border border-cyan-700"><Fish className="w-3 h-3 mr-1" />{plan.target_fish}</Badge>}
                        {spot.water_type && <Badge variant="outline" className="text-gray-300"><Anchor className="w-3 h-3 mr-1" />{spot.water_type}</Badge>}
                        {details.method && <Badge variant="outline" className="text-gray-300"><Compass className="w-3 h-3 mr-1" />{details.method}</Badge>}
                      </div>
                      <div className="space-y-1 text-sm text-gray-300">
                        {spot.name && (
                          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-cyan-400" /> {spot.name}</div>
                        )}
                        {when && (
                          <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-400" /> {when}{details.duration_hours ? ` · ${details.duration_hours} Std` : ""}</div>
                        )}
                        {distance != null && (
                          <div className="flex items-center gap-2 text-gray-400">
                            <Ruler className="w-4 h-4 text-emerald-400" /> {distance.toFixed(1)} km Luftlinie
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Detail */}
            <div className="lg:sticky lg:top-6 self-start">
              {selectedPlan ? (
                <TripDetail
                  plan={selectedPlan}
                  spot={readSpot(selectedPlan.spot_info)}
                  currentLocation={currentLocation}
                  offlineNotes={offlineNotes}
                  editingNotes={editingNotes}
                  setOfflineNotes={setOfflineNotes}
                  setEditingNotes={setEditingNotes}
                  saveOfflineNotes={saveOfflineNotes}
                  onNavigate={openNavigation}
                  onToggle={toggleActivePlan}
                  onEdit={openEditTrip}
                  onDelete={deletePlan}
                />
              ) : (
                <Card className="glass-morphism border-gray-800">
                  <CardContent className="p-8 text-center text-gray-400">
                    Wähle einen Trip aus der Liste, um alle Details zu sehen.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TripDetail({
  plan, spot, currentLocation, offlineNotes, editingNotes,
  setOfflineNotes, setEditingNotes, saveOfflineNotes, onNavigate, onToggle, onEdit, onDelete,
}) {
  const details = plan.details && typeof plan.details === "object" ? plan.details : {};
  const when = formatDateTime(plan.planned_date);
  const distance = useMemo(
    () => (spot.lat != null && currentLocation?.lat != null
      ? haversineKm(currentLocation.lat, currentLocation.lon, spot.lat, spot.lon) : null),
    [spot, currentLocation],
  );

  const Row = ({ icon: Icon, label, value }) =>
    value ? (
      <div className="flex items-start gap-2 text-sm">
        <Icon className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
        <span className="text-gray-400 w-28 shrink-0">{label}</span>
        <span className="text-gray-200">{value}</span>
      </div>
    ) : null;

  return (
    <Card className="glass-morphism border-gray-800">
      <CardHeader>
        <CardTitle className="text-cyan-400">{plan.title}</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          {plan.target_fish && <Badge className="bg-emerald-600">{plan.target_fish}</Badge>}
          {when && <Badge variant="outline">{when}</Badge>}
          {plan.is_active && <Badge className="bg-emerald-600 animate-pulse">Aktiver Trip</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Row icon={MapPin} label="Spot" value={spot.name} />
          <Row icon={Anchor} label="Gewässer" value={spot.water_type} />
          <Row icon={Compass} label="Methode" value={details.method} />
          <Row icon={Fish} label="Köder" value={details.bait} />
          <Row icon={Clock} label="Dauer" value={details.duration_hours ? `${details.duration_hours} Std` : null} />
          <Row icon={Users} label="Begleiter" value={details.companions} />
          <Row icon={Ruler} label="Entfernung" value={distance != null ? `${distance.toFixed(1)} km Luftlinie` : null} />
        </div>

        {spot.lat != null && spot.lon != null && (
          <Button variant="outline" size="sm" onClick={() => onNavigate(spot)} className="w-full">
            <Navigation className="w-4 h-4 mr-2" /> Navigation starten <ExternalLink className="w-3 h-3 ml-2" />
          </Button>
        )}

        {details.gear && (
          <div>
            <h4 className="font-semibold text-cyan-400 mb-1 text-sm">Ausrüstung</h4>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{details.gear}</p>
          </div>
        )}

        {Array.isArray(plan.steps) && plan.steps.length > 0 && (
          <div>
            <h4 className="font-semibold text-cyan-400 mb-2 text-sm flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Packliste / Checkliste
            </h4>
            <ul className="space-y-1">
              {plan.steps.map((step, i) => (
                <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {details.notes && (
          <div>
            <h4 className="font-semibold text-cyan-400 mb-1 text-sm">Notizen</h4>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">{details.notes}</p>
          </div>
        )}

        {/* Offline-Notizen (lokal) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-cyan-400 text-sm">Notizen vor Ort (Offline)</h4>
            <Badge className="text-xs bg-emerald-600/20 border-emerald-600 text-emerald-300">Lokal gespeichert</Badge>
          </div>
          {editingNotes[plan.id] ? (
            <div className="space-y-2">
              <Textarea
                value={offlineNotes[plan.id] || ""}
                onChange={(e) => setOfflineNotes((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                placeholder="Schreibe deine Beobachtungen vor Ort ..."
                className="bg-gray-800/50 border-gray-700 text-white min-h-[100px]"
              />
              <Button
                onClick={() => { saveOfflineNotes(plan.id, offlineNotes[plan.id] || ""); setEditingNotes((p) => ({ ...p, [plan.id]: false })); }}
                className="w-full bg-emerald-600 hover:bg-emerald-700" size="sm"
              >
                <Save className="w-4 h-4 mr-2" /> Speichern
              </Button>
            </div>
          ) : (
            <div>
              <div className="bg-gray-800/50 rounded-lg p-3 min-h-[60px] max-h-[200px] overflow-y-auto mb-2">
                <p className="text-gray-300 text-sm whitespace-pre-wrap">
                  {offlineNotes[plan.id] || "Noch keine Notizen. Klicke auf Bearbeiten."}
                </p>
              </div>
              <Button onClick={() => setEditingNotes((p) => ({ ...p, [plan.id]: true }))} variant="outline" className="w-full" size="sm">
                Bearbeiten
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" onClick={() => onToggle(plan)}
            className={plan.is_active ? "bg-emerald-600/20 border-emerald-600" : ""}>
            <Power className="w-4 h-4 mr-2" /> {plan.is_active ? "Deaktivieren" : "Aktivieren"}
          </Button>
          <Button variant="outline" onClick={() => onEdit(plan)} className="flex-1">
            <Pencil className="w-4 h-4 mr-2" /> Bearbeiten
          </Button>
          <Button variant="destructive" onClick={() => onDelete(plan.id)} className="flex-1">
            <Trash2 className="w-4 h-4 mr-2" /> Löschen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TripPlanner() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setUser(await User.me());
      } catch (e) {
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-cyan-400">Laden...</div>
      </div>
    );
  }

  return (
    <PremiumGuard user={user} requiredPlan="basic" feature="Der Trip-Planer">
      <TripPlannerContent />
    </PremiumGuard>
  );
}
