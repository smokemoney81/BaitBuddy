// TypeSafe Jev — optionale Decision-Layer-Anfrage (Intent-/Kontext-Routing).
//
// Phase 0 (Infrastruktur, siehe CLAUDE.md „Jev Decision Layer"): dieser Client
// wird ausschließlich im SHADOW MODE aufgerufen — er darf niemals eine echte
// Benutzer-Antwort, einen DB-Schreibzugriff, Auth, Zahlungen oder gesetzliche
// Regeln beeinflussen. Ausfall/Timeout/Fehler sind IMMER fail-open: der Aufrufer
// bekommt `null` zurück und macht mit der bestehenden (regelbasierten) Logik
// weiter, ohne jede Verzögerung der eigentlichen Antwort.
import { fetchWithTimeout, FetchTimeoutError } from './fetchWithTimeout.js';

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_TIMEOUT_MS = 800;
const JEV_MODEL = 'jev-latest';

function cleanKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^["']|["']$/g, '').trim();
  return trimmed || null;
}

export function getJevApiKey() {
  return cleanKey(process.env.TYPESAFE_API_KEY);
}

// Globaler Schalter. Ohne beide Bedingungen bleibt Jev vollständig inaktiv —
// kein Netzwerk-Call, kein Overhead. Siehe CLAUDE.md für die einzelnen
// Modul-Flags (JEV_BUDDY, JEV_SHADOW_MODE etc.), die zusätzlich zu dieser
// globalen Schranke geprüft werden.
export function isJevEnabled() {
  return process.env.JEV_ENABLED === 'true' && Boolean(getJevApiKey());
}

export function isJevShadowMode() {
  return process.env.JEV_SHADOW_MODE !== 'false';
}

// Phase 2 (aktive Kontext-Steuerung durch Jev statt reinem Shadow-Logging).
// Per CLAUDE.md-Regel erst aktivieren, nachdem echte Shadow-Mode-Daten
// ausgewertet wurden — Default ist deshalb aus, unabhängig von JEV_ENABLED.
export function isJevBuddyActive() {
  return isJevEnabled() && process.env.JEV_BUDDY === 'true';
}

// Phase 2 für die Fangbuch-Muster-Klassifizierung (siehe jevFangbuchEvidence.js).
// Gleiche Regel: erst nach Auswertung echter Shadow-Mode-Daten aktivieren.
export function isJevFangbuchActive() {
  return isJevEnabled() && process.env.JEV_FANGBUCH === 'true';
}

// Phase 2 für das Spot-Re-Ranking (siehe jevSpotRanking.js). Gleiche Regel:
// erst nach Auswertung echter Shadow-Mode-Daten aktivieren.
export function isJevSpotsActive() {
  return isJevEnabled() && process.env.JEV_SPOTS === 'true';
}

/**
 * Ruft Jev mit einem state/questions-Bundle auf. Liefert die rohen
 * `answers` aus der TypeSafe-Antwort oder `null` bei Fehler/Timeout/Deaktivierung.
 * Wirft NIE — jeder Fehlerfall wird abgefangen und protokolliert.
 */
export async function askJev({ state, questions }) {
  if (!isJevEnabled()) return null;
  const apiKey = getJevApiKey();
  try {
    const res = await fetchWithTimeout(
      JEV_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      },
      JEV_TIMEOUT_MS
    );
    if (!res.ok) {
      console.error('Jev: Upstream-Fehler', res.status);
      return null;
    }
    const data = await res.json();
    return data?.answers || null;
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      console.error('Jev: Zeitüberschreitung', error.message);
    } else {
      console.error('Jev: Aufruf fehlgeschlagen', error?.message || error);
    }
    return null;
  }
}
