import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  resolvePlan: vi.fn(),
}));

vi.mock('./supabase.js', () => ({ supabase: mocks.supabase }));
vi.mock('./planResolver.js', () => ({ resolvePlan: mocks.resolvePlan }));

import { resolveServerToolAccess } from './toolEntitlements.js';

function unlockQuery(result) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

describe('resolveServerToolAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a permanent server-owned Premium Voice unlock without Premium', async () => {
    const chain = unlockQuery({ data: { unlock_type: 'level' }, error: null });
    mocks.supabase.from.mockReturnValue(chain);
    mocks.resolvePlan.mockReturnValue({ isActive: false });

    await expect(resolveServerToolAccess({
      user: { id: '00000000-0000-0000-0000-000000000001' },
      toolId: 'premium_voice',
    })).resolves.toMatchObject({ allowed: true, source: 'level' });
  });

  it('allows an active Premium user when no permanent unlock exists', async () => {
    const chain = unlockQuery({ data: null, error: null });
    mocks.supabase.from.mockReturnValue(chain);
    mocks.resolvePlan.mockReturnValue({ isActive: true });

    await expect(resolveServerToolAccess({
      user: { id: '00000000-0000-0000-0000-000000000001' },
      toolId: 'premium_voice',
    })).resolves.toMatchObject({ allowed: true, source: 'premium' });
  });

  it('fails closed when neither Premium nor a permanent unlock exists', async () => {
    const chain = unlockQuery({ data: null, error: null });
    mocks.supabase.from.mockReturnValue(chain);
    mocks.resolvePlan.mockReturnValue({ isActive: false });

    await expect(resolveServerToolAccess({
      user: { id: '00000000-0000-0000-0000-000000000001' },
      toolId: 'premium_voice',
    })).resolves.toMatchObject({ allowed: false, entitled: false });
  });

  it('still allows an active Premium user when the unlock ledger read errors (fail-safe)', async () => {
    // Regression (§39): a ledger read error must not hard-lock an Ultimate user.
    const chain = unlockQuery({ data: null, error: { message: 'ledger unavailable' } });
    mocks.supabase.from.mockReturnValue(chain);
    mocks.resolvePlan.mockReturnValue({ isActive: true });

    await expect(resolveServerToolAccess({
      user: { id: '00000000-0000-0000-0000-000000000001' },
      toolId: 'premium_voice',
    })).resolves.toMatchObject({ allowed: true, source: 'premium' });
  });

  it('fails safe (no access, no throw) when the ledger errors and there is no Premium', async () => {
    const chain = unlockQuery({ data: null, error: { message: 'ledger unavailable' } });
    mocks.supabase.from.mockReturnValue(chain);
    mocks.resolvePlan.mockReturnValue({ isActive: false });

    await expect(resolveServerToolAccess({
      user: { id: '00000000-0000-0000-0000-000000000001' },
      toolId: 'premium_voice',
    })).resolves.toMatchObject({ allowed: false, entitled: false });
  });

  it('rejects malformed tool identifiers before querying the database', async () => {
    await expect(resolveServerToolAccess({
      user: { id: '00000000-0000-0000-0000-000000000001' },
      toolId: 'premium voice',
    })).rejects.toThrow('Invalid tool identifier');

    expect(mocks.supabase.from).not.toHaveBeenCalled();
  });
});
