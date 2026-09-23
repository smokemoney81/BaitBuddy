// Zentrale Tracking-Utility. Speichert Events ueber die TrackingEvent-Entity.
// Fehler werden still verschluckt, damit Tracking niemals die App stoert.

import { entities } from "@/api/frontendClient";
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

export async function trackPageView(pageName) {
  if (!pageName) return;
  try {
    const user_id = await getUserId();
    await entities.TrackingEvent.create({
      user_id,
      event_type: "page_view",
      page_name: pageName,
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