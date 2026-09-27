import { describe, expect, it } from 'vitest';
import { extractWakeCommand, resolveNavigationCommand } from './GlobalWakeWordListener';

describe('GlobalWakeWordListener command parsing', () => {
  it('extracts a command after the default wake word', () => {
    expect(extractWakeCommand('Hey Buddy öffne Karte', 'Hey Buddy')).toBe('öffne karte');
  });

  it('tolerates common speech-recognition variants for Hey Buddy', () => {
    expect(extractWakeCommand('Hallo Baddy zeige Wetter', 'Hey Buddy')).toBe('zeige wetter');
    expect(extractWakeCommand('Okay Buddi öffne Karte', 'Hey Buddy')).toBe('öffne karte');
  });

  it('supports a custom multi-word wake phrase', () => {
    expect(extractWakeCommand('Petri Heil zeige Wetter', 'Petri Heil')).toBe('zeige wetter');
  });

  it('does not match a custom wake word inside a longer word', () => {
    expect(extractWakeCommand('Buddys Karte öffnen', 'Buddy')).toBeNull();
  });

  it('returns an empty command when only the wake phrase is spoken', () => {
    expect(extractWakeCommand('Hey Buddy', 'Hey Buddy')).toBe('');
  });

  it('resolves common spoken navigation commands', () => {
    expect(resolveNavigationCommand('öffne karte')).toBe('Map');
    expect(resolveNavigationCommand('geh bitte zu wetter')).toBe('Weather');
    expect(resolveNavigationCommand('zeige logbuch')).toBe('Logbook');
  });

  it('leaves non-navigation commands to the Buddy', () => {
    expect(resolveNavigationCommand('welcher köder passt jetzt')).toBeNull();
  });
});
