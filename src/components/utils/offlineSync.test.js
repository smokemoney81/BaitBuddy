import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntities, mockApi, onlineState, mockPhotoStorage } = vi.hoisted(() => ({
  mockEntities: { Catch: { create: vi.fn() } },
  mockApi: { getToken: vi.fn(() => 'test-token'), post: vi.fn() },
  onlineState: { current: true },
  mockPhotoStorage: {
    getUnsyncdOfflinePhotos: vi.fn(async () => []),
    markPhotoAsSynced: vi.fn(async () => {}),
    markPhotoSyncError: vi.fn(async () => {}),
    cleanupSyncedPhotos: vi.fn(async () => {}),
  },
}));

vi.mock('@/api/frontendClient', () => ({ entities: mockEntities, api: mockApi }));
vi.mock('@/utils/networkStatus', () => ({
  isOnline: () => onlineState.current,
  onOnlineStatusChange: vi.fn(() => () => {}),
}));
vi.mock('@/utils/offlinePhotoStorage', () => mockPhotoStorage);

import {
  addToOfflineCatchQueue,
  getOfflineCatchQueue,
  removeFromOfflineCatchQueue,
  clearOfflineCatchQueue,
  syncOfflineCatches,
  syncOfflinePhotos,
  syncOfflineData,
  getOfflineCatchIdMap,
  createCatchWithOfflineSupport,
  initAutoSync,
  stopAutoSync,
} from './offlineSync';

describe('offlineSync – Catch-Queue', () => {
  beforeEach(() => {
    localStorage.clear();
    onlineState.current = true;
    mockEntities.Catch.create.mockReset();
    mockApi.getToken.mockReturnValue('test-token');
  });

  it('fuegt einen Fang mit Metadaten zur Queue hinzu', () => {
    const entry = addToOfflineCatchQueue({ species: 'Hecht' });
    expect(entry.__id).toMatch(/^offline_/);
    expect(entry.__synced).toBe(false);
    expect(getOfflineCatchQueue()).toHaveLength(1);
  });

  it('entfernt einen Eintrag anhand seiner __id', () => {
    const entry = addToOfflineCatchQueue({ species: 'Zander' });
    removeFromOfflineCatchQueue(entry.__id);
    expect(getOfflineCatchQueue()).toHaveLength(0);
  });

  it('leert die gesamte Queue', () => {
    addToOfflineCatchQueue({ species: 'Barsch' });
    addToOfflineCatchQueue({ species: 'Aal' });
    clearOfflineCatchQueue();
    expect(getOfflineCatchQueue()).toHaveLength(0);
  });

  it('createCatchWithOfflineSupport speichert offline in die Queue statt zu senden', async () => {
    onlineState.current = false;
    const result = await createCatchWithOfflineSupport({ species: 'Karpfen' });
    expect(mockEntities.Catch.create).not.toHaveBeenCalled();
    expect(result.__id).toMatch(/^offline_/);
    expect(getOfflineCatchQueue()).toHaveLength(1);
  });

  it('createCatchWithOfflineSupport sendet direkt, wenn online', async () => {
    onlineState.current = true;
    mockEntities.Catch.create.mockResolvedValue({ id: 'server-1' });
    const result = await createCatchWithOfflineSupport({ species: 'Karpfen' });
    expect(mockEntities.Catch.create).toHaveBeenCalledWith({ species: 'Karpfen' });
    expect(result).toEqual({ id: 'server-1' });
  });

  it('syncOfflineCatches synchronisiert erfolgreich und entfernt aus der Queue', async () => {
    addToOfflineCatchQueue({ species: 'Hecht' });
    mockEntities.Catch.create.mockResolvedValue({ id: 'server-1' });

    const result = await syncOfflineCatches();

    expect(result).toMatchObject({ synced: 1, failed: 0, errors: [] });
    expect(getOfflineCatchQueue()).toHaveLength(0);
  });

  it('syncOfflineCatches behaelt fehlgeschlagene Eintraege in der Queue', async () => {
    addToOfflineCatchQueue({ species: 'Hecht' });
    mockEntities.Catch.create.mockRejectedValue(new Error('Netzwerkfehler'));

    const result = await syncOfflineCatches();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(getOfflineCatchQueue()).toHaveLength(1);
  });

  it('syncOfflineCatches synchronisiert nicht, wenn offline', async () => {
    onlineState.current = false;
    addToOfflineCatchQueue({ species: 'Hecht' });

    const result = await syncOfflineCatches();

    expect(result).toMatchObject({ synced: 0, failed: 0, errors: [] });
    expect(mockEntities.Catch.create).not.toHaveBeenCalled();
    expect(getOfflineCatchQueue()).toHaveLength(1);
  });

  it('syncOfflineCatches synchronisiert nicht ohne Auth-Token', async () => {
    mockApi.getToken.mockReturnValue(null);
    addToOfflineCatchQueue({ species: 'Hecht' });

    const result = await syncOfflineCatches();

    expect(result).toMatchObject({ synced: 0, failed: 0, errors: [] });
    expect(mockEntities.Catch.create).not.toHaveBeenCalled();
    expect(getOfflineCatchQueue()).toHaveLength(1);
  });

  it('addToOfflineCatchQueue wirft, wenn die Queue voll ist (Cap)', () => {
    for (let i = 0; i < 200; i++) {
      addToOfflineCatchQueue({ species: `Fisch-${i}` });
    }
    expect(getOfflineCatchQueue()).toHaveLength(200);
    expect(() => addToOfflineCatchQueue({ species: 'Ueberlaeufer' })).toThrow(/voll/);
    expect(getOfflineCatchQueue()).toHaveLength(200);
  });
});

describe('offlineSync – Foto-Sync', () => {
  const photo = () => ({
    id: 7,
    fileName: 'fang.jpg',
    mimeType: 'image/jpeg',
    // "abc" als ArrayBuffer — btoa('abc') === 'YWJj'
    fileData: new Uint8Array([97, 98, 99]).buffer,
    synced: false,
  });

  beforeEach(() => {
    onlineState.current = true;
    mockApi.getToken.mockReturnValue('test-token');
    mockApi.post.mockReset();
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockReset().mockResolvedValue([]);
    mockPhotoStorage.markPhotoAsSynced.mockClear();
    mockPhotoStorage.markPhotoSyncError.mockClear();
    mockPhotoStorage.cleanupSyncedPhotos.mockClear();
  });

  it('laedt Fotos als Base64 auf /api/files/upload hoch und markiert sie als gesynct', async () => {
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photo()]);
    mockApi.post.mockResolvedValue({ file_url: 'https://storage/fang.jpg' });

    const result = await syncOfflinePhotos();

    expect(mockApi.post).toHaveBeenCalledWith('/api/files/upload', {
      file_base64: 'YWJj',
      file_name: 'fang.jpg',
      file_type: 'image/jpeg',
    });
    expect(mockPhotoStorage.markPhotoAsSynced).toHaveBeenCalledWith(7);
    expect(mockPhotoStorage.cleanupSyncedPhotos).toHaveBeenCalled();
    expect(result).toEqual({ synced: 1, failed: 0, deferred: 0, errors: [] });
  });

  it('entfernt Pfadanteile aus dem Dateinamen (Backend-Path-Traversal-Schutz)', async () => {
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([
      { ...photo(), fileName: '../evil/fang.jpg' },
    ]);
    mockApi.post.mockResolvedValue({ file_url: 'https://storage/fang.jpg' });

    await syncOfflinePhotos();

    expect(mockApi.post.mock.calls[0][1].file_name).toBe('fang.jpg');
  });

  it('markiert Fotos mit Fehler, wenn der Upload fehlschlaegt', async () => {
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photo()]);
    mockApi.post.mockRejectedValue(new Error('HTTP 500'));

    const result = await syncOfflinePhotos();

    expect(mockPhotoStorage.markPhotoAsSynced).not.toHaveBeenCalled();
    expect(mockPhotoStorage.markPhotoSyncError).toHaveBeenCalledWith(7, 'HTTP 500');
    expect(result.failed).toBe(1);
  });

  it('synchronisiert nicht ohne Auth-Token', async () => {
    mockApi.getToken.mockReturnValue(null);
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photo()]);

    const result = await syncOfflinePhotos();

    expect(mockApi.post).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0, deferred: 0, errors: [] });
  });
});

describe('offlineSync – initAutoSync / plan-updated', () => {
  beforeEach(() => {
    localStorage.clear();
    onlineState.current = false;
    mockEntities.Catch.create.mockReset();
    mockApi.getToken.mockReturnValue('test-token');
    stopAutoSync();
  });

  it('synchronisiert nach einem plan-updated-Event (Login)', async () => {
    addToOfflineCatchQueue({ species: 'Hecht' });
    mockEntities.Catch.create.mockResolvedValue({ id: 'server-1' });

    initAutoSync();
    onlineState.current = true;
    window.dispatchEvent(new Event('plan-updated'));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockEntities.Catch.create).toHaveBeenCalled();
    stopAutoSync();
  });
});

describe('offlineSync – Offline Photo Integration with Catches', () => {
  beforeEach(() => {
    localStorage.clear();
    onlineState.current = false;
    mockApi.getToken.mockReturnValue('test-token');
    mockApi.post.mockReset();
    mockEntities.Catch.update = vi.fn().mockResolvedValue({});
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockReset().mockResolvedValue([]);
  });

  it('verlinkt offline Fangfoto mit Fang und lädt beide hoch', async () => {
    const photoWithCatchId = {
      id: 7,
      fileName: 'fang.jpg',
      mimeType: 'image/jpeg',
      fileData: new Uint8Array([97, 98, 99]).buffer,
      synced: false,
      catchId: 'offline_12345', // Verlinkt mit dem offline erfassten Fang
    };

    // Der Fang wurde bereits synchronisiert: die Zuordnung Pseudo-ID → Server-ID
    // steht in localStorage.
    localStorage.setItem('bb_offline_catch_id_map', JSON.stringify({ offline_12345: 'srv-1' }));
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoWithCatchId]);
    mockApi.post.mockResolvedValue({ file_url: 'https://storage/fang.jpg' });

    onlineState.current = true;
    const result = await syncOfflinePhotos();

    // Foto wird hochgeladen
    expect(mockApi.post).toHaveBeenCalledWith('/api/files/upload', {
      file_base64: 'YWJj',
      file_name: 'fang.jpg',
      file_type: 'image/jpeg',
    });

    // Fang wird unter seiner ECHTEN Server-ID aktualisiert, nicht unter der
    // lokalen Pseudo-ID (die kennt der Server nicht).
    expect(mockEntities.Catch.update).toHaveBeenCalledWith(
      'srv-1',
      { photo_url: 'https://storage/fang.jpg' }
    );

    expect(result).toEqual({ synced: 1, failed: 0, deferred: 0, errors: [] });
  });

  it('synct Foto ohne catchId ohne Fang-Update', async () => {
    const photoWithoutCatchId = {
      id: 8,
      fileName: 'fang2.jpg',
      mimeType: 'image/jpeg',
      fileData: new Uint8Array([100, 101, 102]).buffer,
      synced: false,
      catchId: null, // Nicht mit Fang verlinkt
    };

    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoWithoutCatchId]);
    mockApi.post.mockResolvedValue({ file_url: 'https://storage/fang2.jpg' });

    onlineState.current = true;
    await syncOfflinePhotos();

    // Foto wird hochgeladen
    expect(mockApi.post).toHaveBeenCalled();

    // Aber Fang wird NICHT aktualisiert (kein catchId)
    expect(mockEntities.Catch.update).not.toHaveBeenCalled();
  });

  it('markiert Foto mit Fehler auch wenn Fang-Update fehlschlägt', async () => {
    const photoWithCatchId = {
      id: 9,
      fileName: 'fang3.jpg',
      mimeType: 'image/jpeg',
      fileData: new Uint8Array([103, 104, 105]).buffer,
      synced: false,
      catchId: 'offline_99999',
    };

    localStorage.setItem('bb_offline_catch_id_map', JSON.stringify({ offline_99999: 'srv-3' }));
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoWithCatchId]);
    mockApi.post.mockResolvedValue({ file_url: 'https://storage/fang3.jpg' });
    mockEntities.Catch.update.mockRejectedValue(new Error('Fang nicht gefunden'));

    onlineState.current = true;
    await syncOfflinePhotos();

    // Foto wird trotzdem als synced markiert (Upload erfolgreich)
    expect(mockPhotoStorage.markPhotoAsSynced).toHaveBeenCalledWith(9);

    // Versuch, Fang zu aktualisieren, fehlgeschlagen — aber nicht kritisch
    expect(mockEntities.Catch.update).toHaveBeenCalledWith(
      'srv-3',
      { photo_url: 'https://storage/fang3.jpg' }
    );
  });
});

// Regressionstests fuer den Akzeptanztest aus Meilenstein 2: Flugmodus → Fang
// inklusive Foto speichern → App schliessen → Internet an → Daten erscheinen
// korrekt (und VERKNUEPFT) auf dem Server.
//
// Der Fehler: offline erfasste Faenge tragen nur eine lokale Pseudo-ID
// (`offline_…`); das Foto zeigte darauf und der Foto-Sync schickte genau diese
// Pseudo-ID an `Catch.update`. Der Server kennt sie nicht — das Foto landete
// unverknuepft im Storage. Verschaerft dadurch, dass Fang- und Foto-Sync
// parallel liefen.
describe('offlineSync – Fang/Foto-Verknüpfung über den Offline-Sync', () => {
  const photoFor = (catchId, id = 1) => ({
    id,
    fileName: 'fang.jpg',
    mimeType: 'image/jpeg',
    fileData: new Uint8Array([97, 98, 99]).buffer,
    synced: false,
    catchId,
  });

  beforeEach(() => {
    localStorage.clear();
    onlineState.current = true;
    mockApi.getToken.mockReturnValue('test-token');
    mockApi.post.mockReset().mockResolvedValue({ file_url: 'https://storage/fang.jpg' });
    mockEntities.Catch.create.mockReset();
    mockEntities.Catch.update = vi.fn().mockResolvedValue({});
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockReset().mockResolvedValue([]);
    mockPhotoStorage.markPhotoAsSynced.mockClear();
    mockPhotoStorage.markPhotoSyncError.mockClear();
  });

  it('merkt sich die Server-ID jedes synchronisierten Offline-Fangs', async () => {
    const entry = addToOfflineCatchQueue({ species: 'Hecht' });
    mockEntities.Catch.create.mockResolvedValue({ id: 'srv-42' });

    const result = await syncOfflineCatches();

    expect(result.synced).toBe(1);
    expect(getOfflineCatchIdMap()).toEqual({ [entry.__id]: 'srv-42' });
  });

  it('verknüpft das Foto nach dem Sync mit der echten Server-ID (Akzeptanztest)', async () => {
    // Offline: Fang und Foto werden lokal erfasst.
    onlineState.current = false;
    const entry = addToOfflineCatchQueue({ species: 'Zander', weight_kg: 3.2 });
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoFor(entry.__id, 5)]);

    // Wieder online: der Server vergibt die echte ID.
    onlineState.current = true;
    mockEntities.Catch.create.mockResolvedValue({ id: 'srv-99' });

    await syncOfflineData();

    expect(mockEntities.Catch.create).toHaveBeenCalledWith(
      expect.objectContaining({ species: 'Zander', weight_kg: 3.2 }),
    );
    // Entscheidend: NICHT die Pseudo-ID.
    expect(mockEntities.Catch.update).toHaveBeenCalledWith('srv-99', {
      photo_url: 'https://storage/fang.jpg',
    });
    expect(mockEntities.Catch.update).not.toHaveBeenCalledWith(
      entry.__id,
      expect.anything(),
    );
    expect(mockPhotoStorage.markPhotoAsSynced).toHaveBeenCalledWith(5);
    expect(getOfflineCatchQueue()).toHaveLength(0);
  });

  it('stellt ein Foto zurück, solange sein Fang noch in der Queue wartet', async () => {
    const entry = addToOfflineCatchQueue({ species: 'Barsch' });
    // Der Fang-Sync scheitert (z.B. Serverfehler), der Fang bleibt in der Queue.
    mockEntities.Catch.create.mockRejectedValue(new Error('500'));
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoFor(entry.__id, 6)]);

    const { photos } = await syncOfflineData();

    // Kein Upload ins Leere und kein Fehler — das Foto wartet auf den Fang.
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(mockEntities.Catch.update).not.toHaveBeenCalled();
    expect(mockPhotoStorage.markPhotoAsSynced).not.toHaveBeenCalled();
    expect(mockPhotoStorage.markPhotoSyncError).not.toHaveBeenCalled();
    expect(photos).toEqual({ synced: 0, failed: 0, deferred: 1, errors: [] });
  });

  it('holt das zurückgestellte Foto beim nächsten Lauf nach', async () => {
    const entry = addToOfflineCatchQueue({ species: 'Forelle' });
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoFor(entry.__id, 7)]);

    mockEntities.Catch.create.mockRejectedValueOnce(new Error('500'));
    await syncOfflineData();
    expect(mockApi.post).not.toHaveBeenCalled();

    mockEntities.Catch.create.mockResolvedValue({ id: 'srv-7' });
    const { photos } = await syncOfflineData();

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockEntities.Catch.update).toHaveBeenCalledWith('srv-7', {
      photo_url: 'https://storage/fang.jpg',
    });
    expect(photos.synced).toBe(1);
  });

  it('lädt ein verwaistes Foto unverknüpft hoch, statt es zu verlieren', async () => {
    // Pseudo-ID ohne Zuordnung UND ohne Fang in der Queue: der Fang kommt nicht
    // mehr (z.B. manuell aus der Queue entfernt). Das Foto trotzdem sichern.
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoFor('offline_weg', 8)]);

    const { photos } = await syncOfflineData();

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockEntities.Catch.update).not.toHaveBeenCalled();
    expect(mockPhotoStorage.markPhotoAsSynced).toHaveBeenCalledWith(8);
    expect(photos.synced).toBe(1);
  });

  it('synchronisiert Fänge vor Fotos, nicht parallel', async () => {
    const order = [];
    const entry = addToOfflineCatchQueue({ species: 'Wels' });
    mockEntities.Catch.create.mockImplementation(async () => {
      order.push('catch');
      return { id: 'srv-order' };
    });
    mockApi.post.mockImplementation(async () => {
      order.push('photo');
      return { file_url: 'https://storage/fang.jpg' };
    });
    mockPhotoStorage.getUnsyncdOfflinePhotos.mockResolvedValue([photoFor(entry.__id, 9)]);

    await syncOfflineData();

    expect(order).toEqual(['catch', 'photo']);
  });
});
