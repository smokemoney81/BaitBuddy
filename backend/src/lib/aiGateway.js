import { createHash } from 'node:crypto';
import { experimental_evaluate as evaluate } from 'ai';

const DEFAULT_JEV_MODEL = 'typesafe-ai/jev';
const MAX_JEV_STATE_CHARS = 8_000;
const MAX_BUDDY_MESSAGE_CHARS = 4_000;
const TRUE_THRESHOLD = 0.8;
const FALSE_THRESHOLD = 0.2;

function envEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

export function isJevEnabled() {
  return envEnabled(process.env.JEV_ENABLED);
}

export function hasAiGatewayAuth() {
  return Boolean(
    String(process.env.AI_GATEWAY_API_KEY || '').trim()
    || String(process.env.VERCEL_OIDC_TOKEN || '').trim()
  );
}

export function getJevStatus() {
  return {
    enabled: isJevEnabled(),
    auth_configured: hasAiGatewayAuth(),
    model: process.env.JEV_MODEL || DEFAULT_JEV_MODEL,
  };
}

function safeFeatureTag(feature) {
  const value = String(feature || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return value || 'unknown';
}

function hashUserTag(user) {
  const source = user?.id || user?.email;
  if (!source) return undefined;
  return `bb-${createHash('sha256').update(String(source)).digest('hex').slice(0, 24)}`;
}

function payloadSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function statusFromError(error) {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.cause?.status,
    error?.cause?.statusCode,
  ];
  return candidates.find((value) => Number.isInteger(value)) ?? null;
}

/**
 * Server-only wrapper around Vercel AI Gateway's Jev evaluator.
 *
 * Jev is intentionally used only as a decision/evaluation engine. It never
 * produces user-visible BaitBuddy prose; Anthropic remains the generative LLM.
 * When disabled, unconfigured, rate-limited or unavailable this function fails
 * open and returns null so existing application logic continues to work.
 */
export async function evaluateWithJev({
  state,
  questions,
  feature = 'unknown',
  user = null,
  evaluateFn = evaluate,
} = {}) {
  if (!isJevEnabled() || !hasAiGatewayAuth()) return null;
  if (!questions || typeof questions !== 'object') return null;

  const stateChars = payloadSize(state);
  const questionChars = payloadSize(questions);
  if (!Number.isFinite(stateChars) || stateChars + questionChars > MAX_JEV_STATE_CHARS) {
    console.warn('[Jev] Evaluation skipped: payload exceeds configured input limit');
    return null;
  }

  const featureTag = safeFeatureTag(feature);
  const userTag = hashUserTag(user);
  const gatewayOptions = {
    zeroDataRetention: true,
    disallowPromptTraining: true,
    tags: ['baitbuddy', 'jev', `feature-${featureTag}`],
    ...(userTag ? { user: userTag } : {}),
  };

  try {
    return await evaluateFn({
      model: process.env.JEV_MODEL || DEFAULT_JEV_MODEL,
      state,
      questions,
      providerOptions: {
        gateway: gatewayOptions,
      },
    });
  } catch (error) {
    const status = statusFromError(error);
    if (status === 402) {
      console.warn('[Jev] AI Gateway rejected the request because billing/credits are unavailable; using fallback logic');
    } else if (status === 429) {
      console.warn('[Jev] AI Gateway rate-limited the request; using fallback logic');
    } else if (status === 503) {
      console.warn('[Jev] AI Gateway is temporarily unavailable; using fallback logic');
    } else {
      console.warn('[Jev] Evaluation failed; using fallback logic', {
        status,
        code: typeof error?.code === 'string' ? error.code.slice(0, 80) : null,
      });
    }
    return null;
  }
}

export function regexBuddyContextNeeds(message = '') {
  const text = String(message);
  const wantsCatches = /fang|fänge|gefangen|fangbuch|logbuch/i.test(text);
  const wantsRules = /schonzeit|mindestmaß|erlaubt|verboten|angelrecht|regel|erlaubnisschein|permit/i.test(text);
  const wantsPlanning = /trip|ausflug|tour|planung|vorbereitung|ausrüstung|ausruestung|packliste/i.test(text);
  const wantsSpots = wantsPlanning || /spot|angelplatz|wo angel|gewässer|gewaesser/i.test(text);
  const wantsWeather = wantsPlanning || /wetter|temperatur|wind|luftdruck|angelzeit|bedingungen/i.test(text);

  return {
    wantsCatches,
    wantsRules,
    wantsPlanning,
    wantsSpots,
    wantsWeather,
    source: 'regex',
  };
}

const BUDDY_CONTEXT_QUESTIONS = {
  wantsCatches: {
    type: 'boolean',
    instructions: 'Does the user request require their personal catch history, catch log or previous fishing results to answer well?',
    criteria: {
      true: 'The request asks about catches, logged results, personal fishing history, or patterns in previous catches.',
      false: 'The request can be answered without personal catch-history data.',
    },
  },
  wantsRules: {
    type: 'boolean',
    instructions: 'Does the request require fishing regulations or legal constraints?',
    criteria: {
      true: 'The request concerns closed seasons, minimum sizes, permits, bans, protected fish or other fishing rules.',
      false: 'No fishing-law or regulation context is needed.',
    },
  },
  wantsPlanning: {
    type: 'boolean',
    instructions: 'Is the user planning or preparing a fishing trip or outing?',
    criteria: {
      true: 'The user asks to plan, prepare, pack for or optimize an upcoming fishing trip or session.',
      false: 'The request is not about planning or preparing a fishing trip.',
    },
  },
  wantsSpots: {
    type: 'boolean',
    instructions: 'Would personal fishing spots or water/location context materially improve the answer?',
    criteria: {
      true: 'The request asks where to fish, compares waters/spots, or depends on location/spot context.',
      false: 'Personal spot or water-location data is not needed.',
    },
  },
  wantsWeather: {
    type: 'boolean',
    instructions: 'Would current or forecast weather/environmental conditions materially improve the answer?',
    criteria: {
      true: 'The request depends on weather, wind, temperature, pressure, timing or fishing conditions.',
      false: 'Weather/environmental data is not needed.',
    },
  },
};

function chooseBoolean(answer, fallback) {
  if (answer?.type !== 'boolean' || !Number.isFinite(answer.probability)) return fallback;
  if (answer.probability >= TRUE_THRESHOLD) return true;
  if (answer.probability <= FALSE_THRESHOLD) return false;
  return fallback;
}

/**
 * Decides which optional BaitBuddy context sources should be loaded.
 * Existing regex routing is always available as a deterministic fallback.
 */
export async function resolveBuddyContextNeeds(message, user, { evaluateFn = evaluate } = {}) {
  const fallback = regexBuddyContextNeeds(message);
  if (!isJevEnabled() || !hasAiGatewayAuth()) return fallback;

  const safeMessage = String(message || '').slice(0, MAX_BUDDY_MESSAGE_CHARS);
  if (!safeMessage.trim()) return fallback;

  const result = await evaluateWithJev({
    state: {
      user_message: safeMessage,
      application: 'BaitBuddy fishing assistant',
      task: 'Select only the context sources required to answer the user request.',
    },
    questions: BUDDY_CONTEXT_QUESTIONS,
    feature: 'buddy-context-router',
    user,
    evaluateFn,
  });

  if (!result?.answers) return fallback;

  const resolved = {
    wantsCatches: chooseBoolean(result.answers.wantsCatches, fallback.wantsCatches),
    wantsRules: chooseBoolean(result.answers.wantsRules, fallback.wantsRules),
    wantsPlanning: chooseBoolean(result.answers.wantsPlanning, fallback.wantsPlanning),
    wantsSpots: chooseBoolean(result.answers.wantsSpots, fallback.wantsSpots),
    wantsWeather: chooseBoolean(result.answers.wantsWeather, fallback.wantsWeather),
    source: 'jev',
  };

  // Trip planning normally needs both location and conditions. Keep this
  // invariant even if one individual evaluator answer is uncertain/negative.
  if (resolved.wantsPlanning) {
    resolved.wantsSpots = true;
    resolved.wantsWeather = true;
  }

  return resolved;
}
