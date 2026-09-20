import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateWithJev,
  getJevStatus,
  regexBuddyContextNeeds,
  resolveBuddyContextNeeds,
} from './aiGateway.js';

const ORIGINAL_ENV = {
  JEV_ENABLED: process.env.JEV_ENABLED,
  JEV_MODEL: process.env.JEV_MODEL,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
};

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('aiGateway Jev decision layer', () => {
  beforeEach(() => {
    delete process.env.JEV_ENABLED;
    delete process.env.JEV_MODEL;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('JEV_ENABLED', ORIGINAL_ENV.JEV_ENABLED);
    restoreEnv('JEV_MODEL', ORIGINAL_ENV.JEV_MODEL);
    restoreEnv('AI_GATEWAY_API_KEY', ORIGINAL_ENV.AI_GATEWAY_API_KEY);
    restoreEnv('VERCEL_OIDC_TOKEN', ORIGINAL_ENV.VERCEL_OIDC_TOKEN);
  });

  it('uses deterministic regex routing when Jev is disabled', async () => {
    const evaluateFn = vi.fn();
    const result = await resolveBuddyContextNeeds(
      'Plane meinen Trip morgen. Wie wird das Wetter am Spot?',
      { id: 'user-1' },
      { evaluateFn }
    );

    expect(result).toEqual({
      wantsCatches: false,
      wantsRules: false,
      wantsPlanning: true,
      wantsSpots: true,
      wantsWeather: true,
      source: 'regex',
    });
    expect(evaluateFn).not.toHaveBeenCalled();
  });

  it('routes through Jev when explicitly enabled and gateway auth exists', async () => {
    process.env.JEV_ENABLED = '1';
    process.env.AI_GATEWAY_API_KEY = 'test-only-not-a-real-key';

    const evaluateFn = vi.fn().mockResolvedValue({
      answers: {
        wantsCatches: { type: 'boolean', probability: 0.97 },
        wantsRules: { type: 'boolean', probability: 0.03 },
        wantsPlanning: { type: 'boolean', probability: 0.93 },
        wantsSpots: { type: 'boolean', probability: 0.05 },
        wantsWeather: { type: 'boolean', probability: 0.10 },
      },
    });

    const result = await resolveBuddyContextNeeds(
      'Mach mir einen Plan auf Basis meiner letzten Fänge.',
      { id: 'user-42' },
      { evaluateFn }
    );

    expect(result).toEqual({
      wantsCatches: true,
      wantsRules: false,
      wantsPlanning: true,
      wantsSpots: true,
      wantsWeather: true,
      source: 'jev',
    });
    expect(evaluateFn).toHaveBeenCalledTimes(1);

    const call = evaluateFn.mock.calls[0][0];
    expect(call.model).toBe('typesafe-ai/jev');
    expect(call.providerOptions.gateway.zeroDataRetention).toBe(true);
    expect(call.providerOptions.gateway.disallowPromptTraining).toBe(true);
    expect(call.providerOptions.gateway.tags).toContain('feature-buddy-context-router');
    expect(call.providerOptions.gateway.user).toMatch(/^bb-[a-f0-9]{24}$/);
    expect(call.providerOptions.gateway.user).not.toContain('user-42');
  });

  it('fails open to regex routing when the gateway returns 402', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.AI_GATEWAY_API_KEY = 'test-only-not-a-real-key';

    const error = new Error('payment required');
    error.status = 402;
    const evaluateFn = vi.fn().mockRejectedValue(error);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await resolveBuddyContextNeeds(
      'Welche Schonzeit gilt für Hecht?',
      { id: 'user-1' },
      { evaluateFn }
    );

    expect(result).toEqual({
      ...regexBuddyContextNeeds('Welche Schonzeit gilt für Hecht?'),
      source: 'regex',
    });
    expect(warn).toHaveBeenCalled();
  });

  it('does not call Jev for oversized state payloads', async () => {
    process.env.JEV_ENABLED = 'true';
    process.env.VERCEL_OIDC_TOKEN = 'test-oidc-token';

    const evaluateFn = vi.fn();
    const result = await evaluateWithJev({
      state: { payload: 'x'.repeat(9_000) },
      questions: {
        route: {
          type: 'boolean',
          instructions: 'Route?',
          criteria: { true: 'yes', false: 'no' },
        },
      },
      evaluateFn,
    });

    expect(result).toBeNull();
    expect(evaluateFn).not.toHaveBeenCalled();
  });

  it('exposes configuration status without secret values', () => {
    process.env.JEV_ENABLED = 'yes';
    process.env.AI_GATEWAY_API_KEY = 'secret-value-that-must-not-leak';
    process.env.JEV_MODEL = 'typesafe-ai/jev';

    expect(getJevStatus()).toEqual({
      enabled: true,
      auth_configured: true,
      model: 'typesafe-ai/jev',
    });
    expect(JSON.stringify(getJevStatus())).not.toContain('secret-value-that-must-not-leak');
  });
});
