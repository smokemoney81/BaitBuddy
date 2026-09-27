import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { classifyFeature, classifyChat, getModelRoutes, estimateCostEur } from './aiModelRouting.js';

describe('aiModelRouting', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('classifyChat', () => {
    it('erkennt kurze allgemeine Fragen als buddy_simple_text', () => {
      expect(classifyChat('Welcher Köder bei Regen?')).toEqual({ category: 'buddy_simple_text', tier: 'low' });
    });

    it('erkennt persönlichen Datenbezug (Fangbuch/Trip) als buddy_personal_data', () => {
      expect(classifyChat('Was habe ich letzten Trip gefangen?')).toEqual({ category: 'buddy_personal_data', tier: 'low' });
    });

    it('erkennt Anleitungs-/Vergleichsfragen als buddy_complex', () => {
      expect(classifyChat('Wie montiere ich ein Karolina-Rig Schritt für Schritt?')).toEqual({ category: 'buddy_complex', tier: 'medium' });
    });

    it('erkennt sehr lange Nachrichten als buddy_complex', () => {
      expect(classifyChat('a'.repeat(300))).toEqual({ category: 'buddy_complex', tier: 'medium' });
    });
  });

  describe('classifyFeature', () => {
    it('leitet chat aus der letzten Nutzer-Nachricht ab', () => {
      const result = classifyFeature('chat', { body: { messages: [{ role: 'user', content: 'Was fange ich heute an meinem Spot?' }] } });
      expect(result.category).toBe('buddy_personal_data');
      expect(result.feature).toBe('chat');
      expect(result.model).toBeTruthy();
      expect(result.credits).toBeGreaterThan(0);
    });

    it('ordnet vision/analyze-catch/analyze-photo derselben Bildkategorie zu', () => {
      for (const feature of ['vision', 'analyze-catch', 'analyze-photo']) {
        const r = classifyFeature(feature, {});
        expect(r.category).toBe('fish_image_analysis');
        expect(r.tier).toBe('vision');
        expect(r.images).toBe(1);
      }
    });

    it('recognize-gear ist eine eigene Bildkategorie', () => {
      expect(classifyFeature('recognize-gear', {}).category).toBe('gear_image_analysis');
    });

    it('tts liefert Sekunden aus Textlänge statt fixem Wert', () => {
      const r = classifyFeature('tts', { body: { text: 'a'.repeat(140) } });
      expect(r.tier).toBe('voice');
      expect(r.voiceSeconds).toBeGreaterThan(0);
      expect(r.credits).toBeGreaterThan(0);
      expect(r.model).toBeNull();
    });

    it('realtime-session nutzt eine konfigurierbare feste Sitzungsdauer', () => {
      process.env.REALTIME_SESSION_BILLED_SECONDS = '30';
      const r = classifyFeature('realtime-session', {});
      expect(r.voiceSeconds).toBe(30);
    });

    it('unbekanntes Feature fällt auf die kleinste Textkategorie zurück, nie auf 0', () => {
      const r = classifyFeature('does-not-exist', {});
      expect(r.category).toBe('buddy_simple_text');
      expect(r.credits).toBeGreaterThan(0);
    });

    it('satellite-analysis läuft auf der high-Stufe', () => {
      expect(classifyFeature('satellite-analysis', {}).tier).toBe('high');
    });
  });

  describe('getModelRoutes', () => {
    it('nutzt ANTHROPIC_MODEL für low/medium ohne weitere Konfiguration', () => {
      process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5';
      delete process.env.ANTHROPIC_MODEL_HIGH;
      delete process.env.AI_MODEL_ROUTES_JSON;
      const routes = getModelRoutes();
      expect(routes.low).toBe('claude-haiku-4-5');
      expect(routes.medium).toBe('claude-haiku-4-5');
      expect(routes.voice).toBeNull();
    });

    it('ANTHROPIC_MODEL_HIGH überschreibt nur die high-Stufe', () => {
      process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5';
      process.env.ANTHROPIC_MODEL_HIGH = 'claude-opus-4-8';
      const routes = getModelRoutes();
      expect(routes.high).toBe('claude-opus-4-8');
      expect(routes.low).toBe('claude-haiku-4-5');
    });

    it('AI_MODEL_ROUTES_JSON überschreibt gezielt einzelne Stufen', () => {
      process.env.AI_MODEL_ROUTES_JSON = JSON.stringify({ vision: 'claude-opus-4-8' });
      expect(getModelRoutes().vision).toBe('claude-opus-4-8');
    });
  });

  describe('estimateCostEur', () => {
    it('liefert einen positiven Betrag für Text-Stufen', () => {
      const r = classifyFeature('fishing-recommendation', {});
      expect(estimateCostEur(r)).toBeGreaterThan(0);
    });

    it('nutzt die Voice-Schätzung für die voice-Stufe', () => {
      const r = classifyFeature('tts', { body: { text: 'a'.repeat(28) } });
      expect(estimateCostEur(r)).toBeGreaterThan(0);
    });
  });
});
