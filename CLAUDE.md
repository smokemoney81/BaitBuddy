# BaitBuddy — Entwicklungsrichtlinien für Claude

## 🎯 Projekt-Übersicht

**BaitBuddy** ist eine Angel-App mit AI-gestütztem KI-Buddy. 
- **Frontend**: Vite 6 + React 18, läuft im Capacitor 6 Android-WebView
- **Backend**: Express (Node.js) auf Vercel Serverless (Production Standard)
- **Datenbank**: Supabase (Postgres, GoTrue, Storage)
- **AI Provider**: Anthropic Claude (via Backend-API, andere Anbieter möglich hinter Abstraktionsschicht)

Wichtig: Kein React Native/Expo, keine Firebase.
Alles läuft über den eigenen REST-Backend in `src/api/frontendClient.js`.

## 📋 Sprache & Kommunikation

- **Immer auf Deutsch** antworten (Erklärungen, Zusammenfassungen, Texte)
- Code/Commits/PR-Titel dürfen englisch sein
- PR-Watching: Check-ins still im Hintergrund erledigen, nicht ankündigen

## 🚫 Kern-Standards: Absolut verboten

**Keine Platzhalter.** 
- Kein `TODO`, kein `Lorem ipsum`, keine Mock-Daten, keine `Coming soon`-Hülsen
- Immer echte Implementierung + echte API-Anbindung
- Falls Infos fehlen → nachfragen statt Platzhalter setzen

**Keine dekorativen Emojis im UI-Text.**
- ✅ Funktionale Emojis bleiben (Flaggen, Marker-Icons)
- ❌ Weg mit dekorativen Emojis in Labels, Buttons, Toasts, Fehlern
- Ersetzen durch `lucide-react` Icons

**AI-Provider nur über Backend-Abstraktionsschicht.**
- Sämtliche LLM-Anfragen über Backend-Endpoints (`/api/ai/chat`, `/api/ai/vision` …)
- Frontend darf keine LLM-Libraries oder Provider-Secrets verwenden
- API-Keys, Credentials, Provider-Spezifika bleiben serverseitig
- Heute: Anthropic Claude. Weitere Anbieter möglich hinter dieser Schicht
- Verhindert API-Key-Exposure, senkt Bundle-Size, zentralisiert Kontext

## 🏗️ Detailfragen?

Spezialregeln nach Thema in `.claude/rules/`:

| Thema | Datei |
|-------|-------|
| Auth-Systeme (2 Pfade) | `auth-system.md` |
| KI-Buddy (Core Feature) | `ai-buddy.md` |
| Referral-System | `referral-system.md` |
| Plan-Kauf (Stripe + Play) | `purchase-system.md` |
| 3D-Köder-Animation | `3d-lures.md` |
| Device-Features (BLE, GPS) | `device-features.md` |
| Plattform-Compat (WebView) | `platform-compat.md` |
| Infrastruktur (Vercel → CF) | `infrastructure.md` |
| Datenbank-Migrationen | `database-migrations.md` |
| Komplexe Aufgaben-Workflow | `complex-task-workflow.md` |

## ⚡ Performance-Anforderungen

- **App-Start:** Ziel < 3 Sekunden auf realen unterstützten Geräten
- **KI-Buddy Time-to-First-Token:** Ziel < 2 Sekunden unter normalen Netzwerkbedingungen (immer Streaming nutzen)
- **Längere KI-Antworten:** Dürfen nach erstem Token weiter streamen
- **UI-Thread:** Keine blockierenden AI-Requests
- **Low-End-Geräte:** Funktioniert mit ≤ 2GB RAM
- **Offline:** Core-Features funktionieren ohne Internet

**Regel:** Immer auf echten Devices testen, nicht nur Simulator.

## 🔄 Git & PR-Workflow

### Branches & Merging
1. Feature-Entwicklung auf designiertem Branch (siehe **System-Reminder**)
2. Pull Request mit aussagekräftiger Beschreibung
3. CI: lint + typecheck + tests + build
4. Code Review + Approval
5. Merge nach `main`
6. Production Deployment nur von `main`

### PR-Watching
- CI-Fails & Review-Kommentare → eigenverantwortlich beheben
- Check-ins an aktive Session/Check-In-Schedule gekoppelt (nicht beliebig dauerhaft im Hintergrund)
- Konflikt-Resolution lokal, dann Push

### Commits
- Aussagekräftige Message auf Deutsch/Englisch (technische Konsistenz)
- Kleine, atomare Commits (ein Zweck pro Commit)
- Attribution-Footer gemäß Session-Reminder

## ✅ Code-Review Checkliste

Vor jedem Commit:
- [ ] Keine Platzhalter, keine TODOs
- [ ] Keine dekorativen Emojis
- [ ] Echte, funktionierende Implementierung
- [ ] Bei KI-Buddy: robuste Fehlerbehandlung
- [ ] Performance im Budget (< 3 Sek. App-Start, < 2 Sek. KI-Response)
- [ ] Keine Secrets in Code
- [ ] Linting & Tests grün

---

## 📌 Regel-Priorität

Bei Konflikten gilt diese Hierarchie:

1. **Sicherheit & Datenintegrität** (hart)
2. **CLAUDE.md** (Core Standards)
3. **`.claude/rules/`** (Themenspezifische Konkretisierung)
4. **Aktueller Task** (Kontextuelle Anpassung)

Themenspezifische Rules dürfen CLAUDE.md konkretisieren,
aber keine Kernstandards abschwächen.

---

## 📌 Komplexe Aufgaben

Für große Änderungen (Architektur, Datenschema, Sicherheit, Migrationen):

1. **Modellempfehlung:** Wähle das beste verfügbare Modell (Haiku für Mechanical, Sonnet für Normal-Entwicklung, Opus für Architektur/Security)
2. **Gegenfragen:** Nur wenn Antwort die Impl. ändert — nicht "hast du Fragen?", sondern "blockiert etwas?"
3. **Architektur first:** Code inspizieren, Datenfluss verstehen, Existing Architecture erweitern
4. **Autonom arbeiten:** Prefer Aktion über Klärung, nutze sinnvolle Defaults

Details: `.claude/rules/complex-task-workflow.md`

---

Diese CLAUDE.md ist das **Source of Truth** für Projekt-Standards.
Bei signifikanten Änderungen sofort updaten, damit alle Sessions konsistent arbeiten.
