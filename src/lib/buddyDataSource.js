// Datenquelle des KI-Buddys — unabhängig davon, WELCHE Engine (Gerät/Cloud,
// siehe localLlm/localModel.js bb_ai_mode) eine Modellanfrage beantwortet,
// legt dies fest, OB überhaupt eine Modellanfrage gestellt wird:
//
// 'auto'     – Standard: bestehende Sofort-/Offline-Antworten aus der
//              Wissensbasis, wenn eindeutig zutreffend, sonst Modellanfrage.
// 'database' – nie eine Modellanfrage (weder Gerät noch Cloud), ausschließlich
//              die vorhandene Wissensbasis — geringstmöglicher Guthabenverbrauch.
// 'model'    – immer eine echte Modellanfrage (die in den Einstellungen
//              gewählte Engine bleibt maßgeblich), auch wenn die Wissensbasis
//              eine kostenlose Sofortantwort hätte liefern können.
//
// Gespeichert in localStorage, damit die Wahl App-Starts überlebt.

export const BUDDY_DATA_SOURCE_KEY = 'bb_buddy_data_source';
const VALID = ['auto', 'database', 'model'];

export function getBuddyDataSource() {
  try {
    const stored = localStorage.getItem(BUDDY_DATA_SOURCE_KEY);
    return VALID.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function setBuddyDataSource(mode) {
  try {
    localStorage.setItem(BUDDY_DATA_SOURCE_KEY, VALID.includes(mode) ? mode : 'auto');
  } catch {
    /* localStorage optional (Private Mode) */
  }
}
