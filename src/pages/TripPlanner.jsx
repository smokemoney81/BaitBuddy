import React, { useState, useEffect, useMemo } from "react";
import { User } from "@/entities/User";
import { analytics, events } from "@/api/frontendClient";
import { useEventActivityTracking } from "@/hooks/useEventActivityTracking";
import PremiumGuard from "@/components/premium/PremiumGuard";
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
import PageTitle from "@/components/layout/PageTitle";

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
    } catch {
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
    } catch {
      toast.error("Trip konnte nicht gelöscht werden");
    }
  };

  if (loading) {
    return (
      <div className="bb-page">
        <div className="max-w-6xl mx-auto animate-pulse space-y-4">
          <div className="h-8 rounded w-1/3" style={{ background: 'var(--bb-surface)' }} />
          <div className="h-16 rounded" style={{ background: 'var(--bb-surface)' }} />
          <div className="h-32 rounded" style={{ background: 'var(--bb-surface)' }} />
          <div className="h-32 rounded" style={{ background: 'var(--bb-surface)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <PageTitle className="flex-1 min-w-0" title="Trips & Planung" subtitle="Plane deine Touren mit allen Details – und sammle durch Nutzung Event-Punkte." />
          <button onClick={openNewTrip} className="bb-action">
            <Plus size={16} className="mr-2" /> Neuer Trip
          </button>
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
          <div className="bb-card">
            <div className="p-8 text-center">
              <Compass size={48} className="mx-auto mb-3" style={{ color: 'rgba(6,182,212,0.7)' }} />
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--bb-cyan)' }}>Noch keine Trips geplant</h3>
              <p className="mb-6" style={{ color: 'var(--bb-muted)' }}>Lege deinen ersten Trip an und trag alles ein, was deine Tour braucht.</p>
              <button onClick={openNewTrip} className="bb-action" style={{ background: '#059669' }}>
                <Plus size={16} className="mr-2" /> Ersten Trip planen
              </button>
            </div>
          </div>
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
                  <div
                    key={plan.id}
                    className={`bb-card cursor-pointer transition-all hover:border-emerald-600/50 ${
                      selectedPlan?.id === plan.id ? "border-emerald-600 bg-emerald-900/20" : ""
                    } ${plan.is_active ? "border-l-4 border-l-emerald-500" : ""}`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    <div className="pb-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <div className="text-lg font-semibold truncate" style={{ color: 'var(--bb-cyan)' }}>{plan.title}</div>
                          {plan.is_active && <span className="bb-pill-info" style={{ background: '#059669', color: '#fff', fontSize: '0.75rem' }}>Aktiv</span>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button className="p-2 rounded-lg" style={{ color: plan.is_active ? '#34d399' : 'var(--bb-muted)' }}
                            aria-label={plan.is_active ? "Deaktivieren" : "Aktivieren"}
                            onClick={(e) => { e.stopPropagation(); toggleActivePlan(plan); }}>
                            <Power size={16} aria-hidden="true" />
                          </button>
                          <button className="p-2 rounded-lg" style={{ color: 'var(--bb-muted)' }}
                            aria-label="Bearbeiten"
                            onClick={(e) => { e.stopPropagation(); openEditTrip(plan); }}>
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button className="p-2 rounded-lg hover:text-red-400" style={{ color: 'var(--bb-muted)' }}
                            aria-label="Löschen"
                            onClick={(e) => { e.stopPropagation(); deletePlan(plan.id); }}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {plan.target_fish && (
                          <span className="bb-pill-info" style={{ background: 'rgba(8,145,178,0.3)', color: '#a5f3fc', border: '1px solid rgba(14,116,144,0.7)', fontSize: '0.75rem' }}>
                            <Fish size={12} className="mr-1" />{plan.target_fish}
                          </span>
                        )}
                        {spot.water_type && (
                          <span className="bb-pill-info" style={{ background: 'transparent', border: '1px solid var(--bb-border)', color: '#d1d5db', fontSize: '0.75rem' }}>
                            <Anchor size={12} className="mr-1" />{spot.water_type}
                          </span>
                        )}
                        {details.method && (
                          <span className="bb-pill-info" style={{ background: 'transparent', border: '1px solid var(--bb-border)', color: '#d1d5db', fontSize: '0.75rem' }}>
                            <Compass size={12} className="mr-1" />{details.method}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm" style={{ color: '#d1d5db' }}>
                        {spot.name && (
                          <div className="flex items-center gap-2"><MapPin size={16} style={{ color: 'var(--bb-cyan)' }} /> {spot.name}</div>
                        )}
                        {when && (
                          <div className="flex items-center gap-2"><Calendar size={16} style={{ color: '#fbbf24' }} /> {when}{details.duration_hours ? ` · ${details.duration_hours} Std` : ""}</div>
                        )}
                        {distance != null && (
                          <div className="flex items-center gap-2" style={{ color: 'var(--bb-muted)' }}>
                            <Ruler size={16} style={{ color: '#34d399' }} /> {distance.toFixed(1)} km Luftlinie
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
                <div className="bb-card">
                  <div className="p-8 text-center" style={{ color: 'var(--bb-muted)' }}>
                    Wähle einen Trip aus der Liste, um alle Details zu sehen.
                  </div>
                </div>
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
        <Icon size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--bb-cyan)' }} />
        <span className="w-28 shrink-0" style={{ color: 'var(--bb-muted)' }}>{label}</span>
        <span style={{ color: '#e5e7eb' }}>{value}</span>
      </div>
    ) : null;

  return (
    <div className="bb-card">
      <div className="bb-form-title">{plan.title}</div>
      <div className="flex flex-wrap gap-2 mt-2">
        {plan.target_fish && <span className="bb-pill-info" style={{ background: '#059669', color: '#fff' }}>{plan.target_fish}</span>}
        {when && <span className="bb-pill-info" style={{ background: 'transparent', border: '1px solid var(--bb-border)', color: 'var(--bb-muted)' }}>{when}</span>}
        {plan.is_active && <span className="bb-pill-info animate-pulse" style={{ background: '#059669', color: '#fff' }}>Aktiver Trip</span>}
      </div>
      <div className="grid gap-4 mt-4">
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
          <button className="bb-secondary w-full text-sm" onClick={() => onNavigate(spot)}>
            <Navigation size={16} className="mr-2" /> Navigation starten <ExternalLink size={12} className="ml-2" />
          </button>
        )}

        {details.gear && (
          <div>
            <h4 className="font-semibold mb-1 text-sm" style={{ color: 'var(--bb-cyan)' }}>Ausrüstung</h4>
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#d1d5db' }}>{details.gear}</p>
          </div>
        )}

        {Array.isArray(plan.steps) && plan.steps.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2 text-sm flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
              <ListChecks size={16} /> Packliste / Checkliste
            </h4>
            <ul className="space-y-1">
              {plan.steps.map((step, i) => (
                <li key={i} className="text-sm flex items-start gap-2" style={{ color: '#d1d5db' }}>
                  <span className="mt-1" style={{ color: '#34d399' }}>•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {details.notes && (
          <div>
            <h4 className="font-semibold mb-1 text-sm" style={{ color: 'var(--bb-cyan)' }}>Notizen</h4>
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#d1d5db' }}>{details.notes}</p>
          </div>
        )}

        {/* Offline-Notizen (lokal) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm" style={{ color: 'var(--bb-cyan)' }}>Notizen vor Ort (Offline)</h4>
            <span className="bb-pill-info" style={{ fontSize: '0.75rem', background: 'rgba(5,150,105,0.2)', border: '1px solid #059669', color: '#6ee7b7' }}>Lokal gespeichert</span>
          </div>
          {editingNotes[plan.id] ? (
            <div className="space-y-2">
              <Textarea
                value={offlineNotes[plan.id] || ""}
                onChange={(e) => setOfflineNotes((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                placeholder="Schreibe deine Beobachtungen vor Ort ..."
                className="bg-gray-800/50 border-gray-700 text-white min-h-[100px]"
              />
              <button
                onClick={() => { saveOfflineNotes(plan.id, offlineNotes[plan.id] || ""); setEditingNotes((p) => ({ ...p, [plan.id]: false })); }}
                className="bb-action w-full text-sm" style={{ background: '#059669' }}
              >
                <Save size={16} className="mr-2" /> Speichern
              </button>
            </div>
          ) : (
            <div>
              <div className="rounded-lg p-3 min-h-[60px] max-h-[200px] overflow-y-auto mb-2" style={{ background: 'rgba(0,0,0,.25)' }}>
                <p className="text-sm whitespace-pre-wrap" style={{ color: '#d1d5db' }}>
                  {offlineNotes[plan.id] || "Noch keine Notizen. Klicke auf Bearbeiten."}
                </p>
              </div>
              <button onClick={() => setEditingNotes((p) => ({ ...p, [plan.id]: true }))} className="bb-secondary w-full text-sm">
                Bearbeiten
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="bb-secondary" onClick={() => onToggle(plan)}
            style={plan.is_active ? { background: 'rgba(5,150,105,0.2)', borderColor: '#059669' } : {}}>
            <Power size={16} className="mr-2" /> {plan.is_active ? "Deaktivieren" : "Aktivieren"}
          </button>
          <button className="bb-secondary flex-1" onClick={() => onEdit(plan)}>
            <Pencil size={16} className="mr-2" /> Bearbeiten
          </button>
          <button className="bb-action flex-1" onClick={() => onDelete(plan.id)} style={{ background: '#dc2626' }}>
            <Trash2 size={16} className="mr-2" /> Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TripPlanner() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setUser(await User.me());
      } catch {
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bb-page flex items-center justify-center">
        <div style={{ color: 'var(--bb-cyan)' }}>Laden...</div>
      </div>
    );
  }

  return (
    <PremiumGuard user={user} requiredPlan="basic" feature="Der Trip-Planer">
      <TripPlannerContent />
    </PremiumGuard>
  );
}
