import { describe, it, expect } from 'vitest';
import { isQuotaExceeded, AI_QUOTA_EXCEEDED_CODE } from './aiQuota.js';

describe('isQuotaExceeded', () => {
  it('erkennt nur das aufgebrauchte Monatsvolumen', () => {
    expect(isQuotaExceeded({ status: 429, data: { code: AI_QUOTA_EXCEEDED_CODE } })).toBe(true);
    expect(isQuotaExceeded({ status: 429, data: { error: 'Zu viele Anfragen' } })).toBe(false);
    expect(isQuotaExceeded({ status: 500, data: { code: AI_QUOTA_EXCEEDED_CODE } })).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});
