import { describe, it, expect } from 'vitest';
import { buildDirectory, searchDirectory } from './clubDirectory';

const clubs = [
  { id: 'a1', name: 'Angelverein Möhnesee e.V.', category: 'club', city: 'Möhnesee', postal_code: '59519', coordinates: { lat: 51.5, lng: 8.1 } },
  { id: 'a2', name: 'ASV Berlin', category: 'club', city: 'Berlin', postal_code: '10117' },
];
const parks = [
  { id: 'a1', name: 'Doppelt', category: 'club' },
  { id: 'p1', name: 'Forellensee', category: 'spot' },
  { id: 'p2', name: 'Angelpark Grafenmühle', category: 'club', address: { city: 'Bottrop' } },
];

describe('clubDirectory', () => {
  it('führt Vereine aus beiden Quellen ohne Doppelte und ohne Nicht-Vereine zusammen', () => {
    const dir = buildDirectory(clubs, parks);
    expect(dir.map(e => e.ref)).toEqual(['p2', 'a1', 'a2']);
    expect(dir.find(e => e.ref === 'p2').city).toBe('Bottrop');
    expect(dir.find(e => e.ref === 'a1')).toMatchObject({ latitude: 51.5, longitude: 8.1 });
  });

  it('sucht nach Name, Ort und PLZ', () => {
    const dir = buildDirectory(clubs, parks);
    expect(searchDirectory(dir, 'möhne').map(e => e.ref)).toEqual(['a1']);
    expect(searchDirectory(dir, 'berlin').map(e => e.ref)).toEqual(['a2']);
    expect(searchDirectory(dir, '595').map(e => e.ref)).toEqual(['a1']);
  });
});
