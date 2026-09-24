// Zustand und Anfrage der Geräte-Berechtigungen (Mikrofon, Kamera, Standort).
//
// Die Permissions API liefert den Zustand, ohne einen Dialog auszulösen. Sie
// fehlt aber teils (ältere WebViews, Safari kennt 'camera'/'microphone' erst ab
// 16) — dann melden wir 'unknown' statt einen Zustand zu raten. Anfragen laufen
// über die echte Funktion (getUserMedia / getCurrentPosition), weil es keine
// separate "nur fragen"-API gibt. Entziehen kann eine Web-App eine Berechtigung
// nicht; das geht nur in den System- bzw. Browser-Einstellungen.

export const PERMISSION_KINDS = ['microphone', 'camera', 'geolocation'];

export async function queryPermission(kind) {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: kind });
    return status?.state || 'unknown';
  } catch {
    // Name wird von dieser Engine nicht unterstützt.
    return 'unknown';
  }
}

// Meldet Änderungen (z. B. wenn der Nutzer die Berechtigung in den
// Systemeinstellungen entzieht). Gibt eine Abmelde-Funktion zurück.
export async function watchPermission(kind, onChange) {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return () => {};
  try {
    const status = await navigator.permissions.query({ name: kind });
    const handler = () => onChange(status.state);
    status.addEventListener?.('change', handler);
    return () => status.removeEventListener?.('change', handler);
  } catch {
    return () => {};
  }
}

function stopStream(stream) {
  stream?.getTracks?.().forEach(track => track.stop());
}

// Löst den System-Dialog aus und gibt den neuen Zustand zurück.
export async function requestPermission(kind) {
  try {
    if (kind === 'geolocation') {
      if (!navigator.geolocation) return 'unsupported';
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 60000 });
      });
      return 'granted';
    }
    if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
    const constraints = kind === 'camera' ? { video: true } : { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Nur die Freigabe holen — Aufnahme sofort wieder beenden.
    stopStream(stream);
    return 'granted';
  } catch (error) {
    const name = error?.name || '';
    // PERMISSION_DENIED (Geolocation) = 1
    if (name === 'NotAllowedError' || name === 'SecurityError' || error?.code === 1) return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unsupported';
    return queryPermission(kind);
  }
}
