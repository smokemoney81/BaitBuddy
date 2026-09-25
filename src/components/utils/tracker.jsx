// Zentrale Tracking-Utility. Speichert Events ueber die TrackingEvent-Entity.
// Fehler werden still verschluckt, damit Tracking niemals die App stoert.

import { entities, api } from "@/api/frontendClient";
import { auth } from "@/api/auth";

let cachedUserId = null;

async function getUserId() {
  if (cachedUserId) return cachedUserId;
  try {
    const me = await auth.me();
    cachedUserId = me?.email || "guest";
  } catch {
    cachedUserId = "guest";
  }
  return cachedUserId;
}

// Seitenaufrufe landen als usage_sessions-Zeile (status 'view',
// feature_id 'page:<Route>') — daraus zählt der Admin-Bereich die
// meistgenutzten Tools (GET /api/superadmin/stats/tools). Nur angemeldete
// Nutzer: Gäste haben kein Konto, dem die Zeile gehören könnte. Vorher lief
// das über eine Entity ohne Endpunkt und wurde stillschweigend verworfen.
export async function trackPageView(pageName) {
  const page = String(pageName || "").split("/")[0];
  if (!page || !api.getToken()) return;
  try {
    await entities.UsageSession.create({
      session_id: `view_${page}_${Date.now()}`,
      feature_id: `page:${page}`,
      status: "view",
      started_at: new Date().toISOString(),
    });
  } catch {
    // silent
  }
}

export async function trackFeatureClick(featureId, metadata = {}) {
  if (!featureId) return;
  try {
    const user_id = await getUserId();
    await entities.TrackingEvent.create({
      user_id,
      event_type: "feature_click",
      feature_id: featureId,
      metadata,
    });
  } catch {
    // silent
  }
}

export function resetTrackerCache() {
  cachedUserId = null;
}