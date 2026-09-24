import { Router } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth, getFreshUser, invalidateCachedUser } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { sendDbError } from '../lib/errorResponse.js';
import { PLAN_RANK, resolvePlan } from '../lib/planResolver.js';

const router = Router();

const REWARD_DAYS = 7;
const REWARD_PLAN_ID = 'elite'; // Ultimate

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O/1/I für Lesbarkeit

function generateCode(length = 8) {
  let code = '';
  const randBytes = randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[randBytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function normalizeCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Erzeugt oder liest den Referral-Code des aktuellen Nutzers. Der Code wird in
// zwei Stellen gespiegelt: im user_metadata (fürs Frontend-Rendering ohne
// Backend-Call) UND in user_referral_codes (für den Reverse-Lookup beim
// Redeem). Bei einem Race auf demselben Code wird bis zu 5x neu gewürfelt.
async function ensureReferralCode(user) {
  const existingCode = normalizeCode(user.user_metadata?.referral_code || '');
  if (existingCode) {
    // Ältere Nutzer haben den Code bereits im user_metadata, aber noch keinen
    // Eintrag im Lookup-Table. Nachtragen nur, wenn der Code frei ist — ein
    // Upsert hätte einen Code, der schon einem ANDEREN Nutzer gehört, auf
    // diesen Nutzer umgebogen (user_metadata ist clientseitig beschreibbar).
    const { data: owner, error: ownerErr } = await supabase
      .from('user_referral_codes')
      .select('user_id')
      .eq('code', existingCode)
      .maybeSingle();
    if (ownerErr) throw ownerErr;
    if (owner?.user_id === user.id) return existingCode;
    if (!owner) {
      const { error: insErr } = await supabase
        .from('user_referral_codes')
        .insert({ code: existingCode, user_id: user.id });
      if (!insErr) return existingCode;
      if (insErr.code !== '23505') throw insErr;
    }
    // Code gehört jemand anderem → unten einen neuen, eigenen Code vergeben.
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCode(8);
    const { error } = await supabase
      .from('user_referral_codes')
      .insert({ code: candidate, user_id: user.id });
    if (!error) {
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata || {}), referral_code: candidate },
      });
      invalidateCachedUser(user.id);
      return candidate;
    }
    // 23505 = unique_violation → Code kollidiert, neu würfeln
    if (error.code !== '23505') throw error;
  }
  throw new Error('Konnte keinen eindeutigen Referral-Code erzeugen');
}

router.get('/referrals/me', requireAuth, async (req, res) => {
  try {
    const freshUser = await getFreshUser(req.user);
    const code = await ensureReferralCode(freshUser);

    const { count, error: countError } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', req.user.id);
    if (countError) return sendDbError(res, countError);

    const meta = freshUser.user_metadata || {};
    return res.json({
      ok: true,
      code,
      referral_count: count || 0,
      reward_days: REWARD_DAYS,
      reward_plan_id: REWARD_PLAN_ID,
      already_referred: !!meta.referred_by,
    });
  } catch (e) {
    return sendDbError(res, e);
  }
});

// Löst einen Referral-Code ein: markiert den aktuellen Nutzer als vom Inhaber
// des Codes eingeladen, protokolliert die Empfehlung und verlängert den
// Ultimate-Plan des Referrers um REWARD_DAYS Tage. Idempotent: pro Nutzer
// nur einmal möglich (via referred_by-Flag und UNIQUE auf referred_user_id).
router.post('/referrals/redeem', requireAuth, async (req, res) => {
  const code = normalizeCode(req.body?.code);
  if (!code) {
    return res.status(400).json({ error: 'Referral-Code fehlt' });
  }

  const self = await getFreshUser(req.user);
  const meta = self.user_metadata || {};
  if (meta.referred_by) {
    return res.status(409).json({
      error: 'Du hast bereits einen Einladungscode eingelöst',
      code: 'already_redeemed',
    });
  }

  const { data: mapping, error: mapErr } = await supabase
    .from('user_referral_codes')
    .select('user_id')
    .eq('code', code)
    .maybeSingle();
  if (mapErr) return sendDbError(res, mapErr);
  if (!mapping) {
    return res.status(404).json({ error: 'Einladungscode ungültig' });
  }

  const referrerUserId = mapping.user_id;
  if (referrerUserId === req.user.id) {
    return res.status(400).json({ error: 'Der eigene Code kann nicht eingelöst werden' });
  }

  // Referral protokollieren. UNIQUE(referred_user_id) verhindert Doppelbuchung
  // selbst bei paralleler Anfrage.
  const { error: insertErr } = await supabase.from('referrals').insert({
    referrer_user_id: referrerUserId,
    referred_user_id: req.user.id,
    referral_code: code,
    reward_days: REWARD_DAYS,
    reward_plan_id: REWARD_PLAN_ID,
  });
  if (insertErr) {
    if (insertErr.code === '23505') {
      return res.status(409).json({
        error: 'Diese Einladung wurde bereits eingelöst',
        code: 'already_redeemed',
      });
    }
    return sendDbError(res, insertErr);
  }

  // Referrer belohnen: Ultimate um 7 Tage verlängern. Läuft der Plan bereits
  // (Ultimate/Elite/Friends) → an bestehendes Ablaufdatum ranhängen; sonst
  // ab jetzt +7 Tage. Ein niedrigerer Plan wird auf Elite hochgestuft.
  const { data: refUserRes, error: refUserErr } =
    await supabase.auth.admin.getUserById(referrerUserId);
  if (refUserErr || !refUserRes?.user) {
    // Referrer konnte nicht geladen werden → Log bleibt bestehen, aber wir
    // signalisieren dem Frontend "eingelöst" ohne Reward-Detail.
    return res.json({ ok: true, reward_extended: false });
  }

  // Plan-Felder leben in app_metadata — nur dort liest resolvePlan() sie.
  // Die Belohnung landete früher in user_metadata und wurde deshalb nie
  // wirksam. Sie läuft jetzt über den Ultimate-Pass (premium_pass_*), den
  // resolvePlan() bereits kennt: Er hebt einen niedrigeren Plan für die
  // Laufzeit auf Ultimate, ohne das eigentliche Abo (Basic/Pro, inkl.
  // Google-Play-Ablaufdatum) anzutasten, und setzt einen höheren Plan
  // (friends) nie herab. An eine laufende Ultimate-Laufzeit — Abo oder
  // früherer Pass — wird angehängt, sonst gilt ab jetzt.
  const referrer = refUserRes.user;
  const referrerApp = referrer.app_metadata || {};
  const now = Date.now();
  const toMs = (iso) => {
    const ms = iso ? new Date(iso).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  };
  const planId = referrerApp.premium_plan_id || 'free';
  const paidUltimateUntil = referrerApp.premium_trial !== true
    && (PLAN_RANK[planId] ?? 0) >= PLAN_RANK.elite
    ? toMs(referrerApp.premium_expires_at)
    : 0;
  const base = Math.max(now, paidUltimateUntil, toMs(referrerApp.premium_pass_expires_at));
  const newExpiresAt = new Date(base + REWARD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const mergedApp = {
    ...referrerApp,
    premium_pass_started_at: referrerApp.premium_pass_started_at
      && toMs(referrerApp.premium_pass_expires_at) > now
      ? referrerApp.premium_pass_started_at
      : new Date(now).toISOString(),
    premium_pass_expires_at: newExpiresAt,
    referral_reward_count: (referrerApp.referral_reward_count || 0) + 1,
    referral_last_reward_at: new Date(now).toISOString(),
  };
  const nextPlanId = resolvePlan({ app_metadata: mergedApp }, new Date(now)).effectiveId;

  const { error: updRefErr } = await supabase.auth.admin.updateUserById(referrerUserId, {
    app_metadata: mergedApp,
  });
  if (updRefErr) return sendDbError(res, updRefErr);
  invalidateCachedUser(referrerUserId);

  // Neuen Nutzer als eingelöst markieren, damit er nicht mehrfach einlöst.
  const { error: updSelfErr } = await supabase.auth.admin.updateUserById(req.user.id, {
    user_metadata: {
      ...meta,
      referred_by: code,
      referred_at: new Date().toISOString(),
    },
  });
  if (updSelfErr) return sendDbError(res, updSelfErr);
  invalidateCachedUser(req.user.id);

  return res.json({
    ok: true,
    reward_extended: true,
    reward_days: REWARD_DAYS,
    reward_plan_id: nextPlanId,
    reward_expires_at: newExpiresAt,
  });
});

export default router;
