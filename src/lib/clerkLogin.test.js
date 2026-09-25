import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authMock = { clerkConfig: vi.fn() };
vi.mock('@/api/auth', () => ({ auth: authMock }));

const { isClerkLoginAvailable, isClerkHashRoute, clerkPublishableKey, _resetClerkAvailability } = await import('./clerkLogin');

beforeEach(() => {
  vi.clearAllMocks();
  _resetClerkAvailability();
});

afterEach(() => vi.unstubAllEnvs());

describe('clerkLogin', () => {
  it('ist ohne Publishable Key nie verfügbar und fragt den Server nicht', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    expect(await isClerkLoginAvailable()).toBe(false);
    expect(authMock.clerkConfig).not.toHaveBeenCalled();
  });

  it('braucht zusätzlich die Freigabe des Servers', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', ' pk_test_x ');
    expect(clerkPublishableKey()).toBe('pk_test_x');
    authMock.clerkConfig.mockResolvedValue({ enabled: false });
    expect(await isClerkLoginAvailable()).toBe(false);
    _resetClerkAvailability();
    authMock.clerkConfig.mockResolvedValue({ enabled: true });
    expect(await isClerkLoginAvailable()).toBe(true);
  });

  it('merkt sich einen Fehler nicht, sondern fragt beim nächsten Mal neu', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x');
    authMock.clerkConfig.mockRejectedValueOnce(new Error('offline'));
    expect(await isClerkLoginAvailable()).toBe(false);
    authMock.clerkConfig.mockResolvedValueOnce({ enabled: true });
    expect(await isClerkLoginAvailable()).toBe(true);
    expect(authMock.clerkConfig).toHaveBeenCalledTimes(2);
  });

  it('erkennt Clerk-Hash-Routen', () => {
    expect(isClerkHashRoute('#/sso-callback')).toBe(true);
    expect(isClerkHashRoute('#access_token=abc')).toBe(false);
    expect(isClerkHashRoute('')).toBe(false);
    expect(isClerkHashRoute(undefined)).toBe(false);
  });
});
