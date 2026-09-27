import { describe, it, expect, beforeEach } from 'vitest';
import { setAdContextActive, getActiveAdContexts, subscribeAdContexts } from './adActiveContext';

describe('adActiveContext', () => {
  beforeEach(() => {
    // Register leeren, indem alle bekannten Kontexte deaktiviert werden.
    for (const ctx of getActiveAdContexts()) setAdContextActive(ctx, false);
  });

  it('startet leer', () => {
    expect(getActiveAdContexts()).toEqual([]);
  });

  it('aktiviert und deaktiviert einen Kontext', () => {
    setAdContextActive('bite_detector', true);
    expect(getActiveAdContexts()).toContain('bite_detector');
    setAdContextActive('bite_detector', false);
    expect(getActiveAdContexts()).not.toContain('bite_detector');
  });

  it('benachrichtigt Abonnenten bei Änderungen', () => {
    const seen = [];
    const unsubscribe = subscribeAdContexts((contexts) => seen.push(contexts));
    setAdContextActive('camera_active', true);
    setAdContextActive('camera_active', false);
    unsubscribe();
    expect(seen).toEqual([['camera_active'], []]);
  });

  it('doppeltes Aktivieren/Deaktivieren löst keine erneute Benachrichtigung aus', () => {
    const seen = [];
    const unsubscribe = subscribeAdContexts((contexts) => seen.push(contexts));
    setAdContextActive('voice_session', true);
    setAdContextActive('voice_session', true);
    unsubscribe();
    expect(seen.length).toBe(1);
  });
});
