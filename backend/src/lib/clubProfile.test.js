import { describe, it, expect } from 'vitest';
import { validateClubProfile } from './clubProfile.js';

describe('validateClubProfile', () => {
  it('übernimmt gültige Angaben und normalisiert Links', () => {
    const result = validateClubProfile({
      name: '  Angelverein Möhnesee e.V. ', website: 'av-moehnesee.de', founded_year: '1985', member_count: 482,
      rules: ['Nur mit Vereinsausweis angeln', ' '], waters: [{ name: 'Möhnesee', region: 'NRW', species: ['Zander', 'Hecht'] }],
      phone: '02924 123456', email: 'info@av-moehnesee.de',
    }, { requireName: true });
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      name: 'Angelverein Möhnesee e.V.', website: 'https://av-moehnesee.de/', founded_year: 1985, member_count: 482,
      rules: ['Nur mit Vereinsausweis angeln'], waters: [{ name: 'Möhnesee', region: 'NRW', species: ['Zander', 'Hecht'] }],
    });
  });

  it.each([
    [{ name: 'A' }, /Name/],
    [{ name: 'Verein', website: 'javascript:alert(1)' }, /Website/],
    [{ name: 'Verein', email: 'keine-mail' }, /E-Mail/],
    [{ name: 'Verein', founded_year: 1500 }, /Gründungsjahr/],
    [{ name: 'Verein', rules: Array.from({ length: 13 }, () => 'x') }, /Regeln/],
  ])('lehnt %j ab', (body, message) => {
    const result = validateClubProfile(body, { requireName: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(message);
  });

  it('lässt beim Ändern nicht gesendete Felder unangetastet', () => {
    expect(validateClubProfile({ motto: 'Angeln verbindet' })).toEqual({ ok: true, value: { motto: 'Angeln verbindet' } });
  });
});
