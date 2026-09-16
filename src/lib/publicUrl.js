// Liefert die öffentliche App-URL für Auth-Redirects (OAuth, Passwort-Reset).
// Wichtig: window.location.origin zeigt bei geschützten Vercel-Preview-Deployments
// auf eine URL, die nach dem Google-Login "You Need Access" erzwingt. Deshalb
// bevorzugen wir VITE_PUBLIC_URL (in .env.production auf die Live-Domain gesetzt).
// KRITISCH: VITE_PUBLIC_URL muss zwingend mit https:// beginnen. Ohne Protokoll
// behandelt Supabase die redirectTo-URL als relativen Pfad auf der Supabase-Domain,
// was zu "requested path is invalid"-Fehlern führt.
export function getPublicAppUrl() {
  const envUrl = import.meta.env?.VITE_PUBLIC_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    const cleaned = envUrl.trim().replace(/\/+$/, '');
    // Nur URLs mit Protokoll verwenden — ohne https:// würde Supabase die
    // redirectTo-URL als Pfad auf seiner eigenen Domain interpretieren.
    if (cleaned.startsWith('https://') || cleaned.startsWith('http://')) {
      return cleaned;
    }
    // Env-Var ohne Protokoll gesetzt: Protocol hinzufügen und auf origin fallen.
    if (cleaned.length > 0) {
      return `https://${cleaned}`;
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

export function buildPublicUrl(path = '/') {
  const base = getPublicAppUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
