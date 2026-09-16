import { Router } from 'express';
import { supabase, supabaseUrl, supabaseKey } from '../lib/supabase.js';
import { requireAuth, isAdminEmail } from '../middleware/auth.js';
import { sendDbError } from '../lib/errorResponse.js';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';

const router = Router();

// Passwort-Login als direkter GoTrue-REST-Call — bewusst NICHT über
// supabase.auth.signInWithPassword().
//
// Grund: `supabase` ist ein prozessweit geteilter Service-Role-Client.
// signInWithPassword legt die entstehende User-Session AUF DIESEM CLIENT ab,
// und supabase-js baut den Authorization-Header pro Request aus der Session
// (getSession() ?? supabaseKey). Ab dem ersten Login sprechen deshalb alle
// PostgREST-Aufrufe des Backends nur noch als `authenticated` statt als
// `service_role` — RLS greift dann auch fürs Backend: Lesen liefert leere
// Ergebnisse, Schreiben scheitert mit "violates row-level security policy".
// Der Fehler ist zustandsabhängig (erst nach dem ersten Login einer Instanz)
// und trifft jede lang laufende Instanz gleichermaßen.
// /auth/refresh umgeht das aus demselben Grund bereits.
async function passwordGrant(email, password) {
  const r = await fetchWithTimeout(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: supabaseKey },
    body: JSON.stringify({ email, password }),
  }, 10000);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    return { error: data.error_description || data.msg || 'Anmeldung fehlgeschlagen' };
  }
  return { data };
}

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });

  const { data, error } = await passwordGrant(email, password);
  if (error) return res.status(401).json({ error });

  return res.json({
    token: data.access_token,
    refresh_token: data.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || '',
    },
  });
});

// Tauscht ein Refresh-Token gegen ein frisches Access-Token. Supabase-Access-
// Tokens laufen nach ~1h ab; das Frontend ruft diesen Endpunkt bei 401 auf,
// statt den Nutzer auszuloggen. Direkter GoTrue-REST-Call, um den geteilten
// Service-Role-Client nicht mit einer User-Session zu verunreinigen.
router.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token erforderlich' });

  try {
    const r = await fetchWithTimeout(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseKey },
      body: JSON.stringify({ refresh_token }),
    }, 10000);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) {
      return res.status(401).json({ error: 'Sitzung abgelaufen – bitte neu anmelden' });
    }
    return res.json({ token: data.access_token, refresh_token: data.refresh_token });
  } catch (e) {
    return sendDbError(res, e);
  }
});

router.post('/auth/register', async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });

  // Nutzer direkt bestätigt anlegen (Admin-API, Service-Role) — kein Warten auf
  // Bestätigungs-E-Mail nötig, damit der Login unmittelbar funktioniert.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createError) {
    const msg = /already.*registered|already.*exists|duplicate/i.test(createError.message || '')
      ? 'E-Mail ist bereits registriert. Bitte melde dich an.'
      : createError.message;
    return res.status(400).json({ error: msg });
  }

  // Neue Nutzer bekommen 24h Vollzugriff (Elite-Trial). Wir setzen die Metadaten
  // final NACH createUser, da der email_confirm-Schritt die Metadaten überschreibt.
  if (created?.user?.id) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.auth.admin.updateUserById(created.user.id, {
      user_metadata: { full_name },
      app_metadata: {
        premium_plan_id: 'elite',
        premium_expires_at: expiresAt,
        premium_trial: true,
        trial_started_at: now.toISOString(),
        trial_expires_at: expiresAt,
        trial_used: true,
      },
    }).catch((error) => {
      console.error('Fehler beim Setzen der Premium-Trial nach Registration:', error);
    });
  }

  // Frisch angelegten (bestätigten) Nutzer direkt einloggen, um ein Token zu liefern.
  // Auch hier der direkte GoTrue-Call, siehe Kommentar bei passwordGrant().
  const { data, error } = await passwordGrant(email, password);
  if (error) return res.status(401).json({ error });

  return res.json({
    token: data.access_token,
    refresh_token: data.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.full_name || '',
    },
  });
});

router.get('/auth/me', requireAuth, (req, res) => {
  return res.json({
    id: req.user.id,
    email: req.user.email,
    full_name: req.user.user_metadata?.full_name || '',
    created_at: req.user.created_at,
    ...req.user.user_metadata,
    // Nach dem Spread, damit die Metadaten den Admin-Status nicht faelschen
    // koennen (user_metadata ist teilweise vom Client beschreibbar).
    is_admin: isAdminEmail(req.user.email),
  });
});

// Aktualisiert die User-Metadaten (Credits, Profil, Profilbild, Theme, Referral …).
// Wird vom Frontend über auth.updateMe / auth.updateMyUserData genutzt. Die neuen
// Werte werden mit den bestehenden Metadaten gemerged, statt sie zu überschreiben.
// Whitelist: nur diese Felder dürfen vom Frontend gesetzt werden. Premium-/
// Guthaben-Felder (premium_plan_id, premium_expires_at, credits, …) sind
// geschützt und werden ausschließlich serverseitig gesetzt. 'settings' trägt
// die App-Einstellungen (Theme, Sprache, Audio, Ticker …) — ohne dieses Feld
// gingen alle Einstellungs-Speicherungen still verloren und jeder Browser
// zeigte seinen eigenen lokalen Stand.
const METADATA_WHITELIST = [
  'full_name', 'nickname', 'profile_image_url', 'profile_picture_url', 'bio',
  'theme', 'settings', 'referral_code', 'avatar_url', 'profile_complete',
  'first_open_at', 'feature_usage', 'feature_ratings', 'quiz_points', 'quiz_runs',
];
router.patch('/auth/me', requireAuth, async (req, res) => {
  const current = req.user.user_metadata || {};
  const sanitized = {};

  for (const key of METADATA_WHITELIST) {
    if (key in req.body) {
      sanitized[key] = req.body[key];
    }
  }

  const merged = { ...current, ...sanitized };
  // 'settings' tief mergen: einzelne Bereiche (Sprache, Theme, Audio) schicken
  // teils nur ihre eigenen Keys — ein flaches Ersetzen würde die übrigen
  // Einstellungen des Nutzers verwerfen.
  if (sanitized.settings && typeof sanitized.settings === 'object' && !Array.isArray(sanitized.settings)
    && current.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)) {
    merged.settings = { ...current.settings, ...sanitized.settings };
  }
  const { data, error } = await supabase.auth.admin.updateUserById(req.user.id, {
    user_metadata: merged,
  });
  if (error) return sendDbError(res, error);
  const u = data.user;
  return res.json({
    id: u.id,
    email: u.email,
    full_name: u.user_metadata?.full_name || '',
    created_at: u.created_at,
    ...u.user_metadata,
  });
});

// OAuth-Linking: Markiert, dass der User sich mit Google verlinkt hat.
// Nach Email-Login wird das Frontend diese API aufrufen, um den Migration-Status zu aktualisieren.
// Der User hat dann die Möglichkeit, sich zukünftig via Google anzumelden.
router.post('/auth/link-oauth', requireAuth, async (req, res) => {
  const { provider } = req.body || {};

  if (!provider || typeof provider !== 'string' || !/^[a-z]+$/.test(provider)) {
    return res.status(400).json({ error: 'Ungültiger Provider' });
  }

  try {
    const current = req.user.user_metadata || {};
    const merged = {
      ...current,
      oauth_linked: true,
      oauth_linked_provider: provider,
      oauth_linked_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.auth.admin.updateUserById(req.user.id, {
      user_metadata: merged,
    });

    if (error) return sendDbError(res, error);

    const u = data.user;
    return res.json({
      id: u.id,
      email: u.email,
      oauth_linked: true,
      oauth_linked_provider: provider,
      oauth_linked_at: merged.oauth_linked_at,
    });
  } catch (e) {
    return sendDbError(res, e);
  }
});

export default router;
