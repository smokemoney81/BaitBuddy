# Google OAuth Setup Guide

Google-Login funktioniert nur, wenn in der **Supabase-Console** die OAuth-Konfiguration richtig eingestellt ist.

## Schritt 1: Google Cloud Projekt erstellen/wählen

1. Gehe zu [Google Cloud Console](https://console.cloud.google.com)
2. Erstelle ein neues Projekt oder wähle ein existierendes
3. Aktiviere die **Google+ API** (`googleapis.com`)

## Schritt 2: OAuth 2.0 Credentials erstellen

1. Gehe zu **APIs & Services → Credentials**
2. Klicke **Create Credentials → OAuth 2.0 Client ID**
3. Wähle Application Type: **Web Application**
4. Name: z. B. "BaitBuddy Web"
5. **Authorized JavaScript origins** (URIs, auf denen die App läuft):
   ```
   https://localhost:3000
   https://localhost:5173
   https://app.baitbuddy.example
   https://catchgbt.com
   https://*.vercel.app
   ```
6. **Authorized redirect URIs** (wo OAuth nach Login zurück kommt):
   ```
   https://localhost:3000/auth/v1/callback
   https://localhost:5173/auth/v1/callback
   https://app.baitbuddy.example/auth/v1/callback
   https://catchgbt.com/auth/v1/callback
   https://*.vercel.app/auth/v1/callback
   ```
7. Speichern → **Client ID** und **Client Secret** kopieren

## Schritt 3: Supabase OAuth Provider konfigurieren

1. Gehe zum **Supabase Dashboard** → dein Projekt
2. **Authentication → Providers → Google**
3. **Enabled** aktivieren
4. **Client ID** und **Client Secret** einfügen (von Google Cloud)
5. Speichern

## Schritt 4: Redirect-URLs in Supabase einstellen

1. **Authentication → URL Configuration**
2. Stelle folgende URLs ein:
   - **Site URL** (Hauptdomain deiner App):
     ```
     https://app.baitbuddy.example
     ```
   - **Redirect URLs** (wo die App nach OAuth zurück kommt):
     ```
     https://app.baitbuddy.example/AuthCallback
     app://baitbuddy/auth/callback
     http://localhost:3000/AuthCallback
     http://localhost:5173/AuthCallback
     ```

## Schritt 5: Umgebungsvariablen setzen

Frontend (`.env` oder `.env.production`):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PUBLIC_URL=https://app.baitbuddy.example
```

⚠️ **Wichtig**: `VITE_PUBLIC_URL` muss mit `https://` beginnen und darf **keinen** Trailing Slash haben.

## Debugging: OAuth funktioniert immer noch nicht?

Prüfe folgendes im Browser Developer Tools:

1. **Console auf Fehler prüfen**: `F12 → Console`
   - Fehler wie "invalid_redirect_uri" bedeutet, die Redirect-URL ist nicht in Google Cloud konfiguriert
   - "access_denied" bedeutet, der Google-Login wurde abgelehnt

2. **OAuth-Redirect-URL überprüfen**: 
   ```javascript
   // Im Browser Console eingeben:
   import { buildPublicUrl } from './src/lib/publicUrl.js'
   console.log(buildPublicUrl('/AuthCallback'))
   // Sollte z. B. ausgeben: https://app.baitbuddy.example/AuthCallback
   ```

3. **Netzwerk-Tab prüfen**: (F12 → Network)
   - Suche nach `signInWithOAuth` Anfrage
   - Die Response sollte eine `url` Feld mit der OAuth-URL haben

4. **Supabase Logs checken**:
   - Gehe zu **Authentication → Logs** in der Supabase-Console
   - Suche nach OAuth-Fehlern

## Android Native App

Zusätzliche URL für native Redirect:

Google Cloud (Authorized redirect URIs):
```
https://your-project.supabase.co/auth/v1/callback
```

Supabase (Redirect URLs):
```
app://baitbuddy/auth/callback
```

Die Deep-Link wird durch die Capacitor-Handler in `src/lib/deepLinkHandler.js` verarbeitet.

## Testing lokal

```bash
# Frontend starten
npm run dev

# Öffne http://localhost:5173
# Klicke auf "Mit Google fortfahren"
# Du solltest zu Google redirected werden
```

---

## Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|--------|--------|
| `invalid_redirect_uri` | Redirect-URL nicht in Google Cloud konfiguriert | URL zu "Authorized redirect URIs" hinzufügen |
| `access_denied` | Google-Login abgelehnt | Nutzer hat Zugriff verweigert, versuchen Sie es erneut |
| Blank Page nach OAuth | Session wird nicht geholt | Browser-Konsole auf Fehler prüfen, `AuthCallback.jsx` Debug-Logs lesen |
| iOS/Android: Bleibt im Browser stecken | Deep-Link nicht registriert | Stelle sicher, dass `app://baitbuddy/auth/callback` in Supabase konfiguriert ist |
| `Redirect page could not be loaded at 'http://localhost:5173/...'` | VITE_PUBLIC_URL mit http statt https | `VITE_PUBLIC_URL` immer mit `https://` beginnen (auch lokal, wenn möglich) |
