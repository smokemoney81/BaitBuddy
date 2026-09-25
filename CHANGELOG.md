# Changelog

## KI-Buddy: lokale FAQ-Datenbank (September 2026)

### Neu
- **Lokale FAQ-Datenbank** (`backend/src/lib/buddyFaq.data.js`, 101 Einträge): Häufige Fragen zu Fischarten, Ködern, Montagen, Knoten, Ausrüstung, Wetter, Jahreszeiten, Regeln, Fischbehandlung, Sicherheit und App-Funktionen beantwortet der KI-Buddy jetzt sofort ohne API-Aufruf — auch ohne Internet. Antworten mit passender App-Seite zeigen einen „… öffnen"-Link.
- Persönliche, orts- oder zeitbezogene Fragen, App-Aktionen und Rückfragen im Gespräch gehen weiterhin an die KI.

### Geändert
- Offline-Antworten überarbeitet: Du-Form statt Sie, fachliche Fehler korrigiert, treffsichere Suche (vorher lieferte „Köder für Hecht" die allgemeine Köder-Antwort), ehrlicher Hinweis bei nur allgemeinen Antworten. Ohne Netz antwortet der Buddy sofort statt erst nach Timeouts und Retries.
- Der LLM-Prompt enthält statt der kompletten FAQ-Liste (~30 000 Zeichen, viele Ein-Wort-Antworten) nur noch die bis zu drei zur Frage passenden, geprüften Einträge; die Realtime-Voice-Session kommt ohne die Liste aus.

### Entfernt
- `src/lib/offlineBuddyQuestions.js` (ersetzt durch die FAQ-Datenbank) und die 199 Kurz-Einträge `FISHING_FAQ` in `buddyKnowledge.js`.

## Bug-Fix-Sprint (Juli 2026)

### Entfernt
- SOS-Funktion vollständig entfernt: SOS-Tab in der mobilen Navigation, Notruf-Button auf der Startseite, Voice-Alias `sos` (PR #296)
- 23 ungenutzte Komponenten-Dateien gelöscht (nie importiert), u. a. `ProtectedRoute.jsx`, `CommunitySection.jsx`, `KiBuddyBar.jsx`, `RightSidebar.jsx`, `PageTransition.jsx`, `swRegister.jsx`

### Behoben
- **Logout**: Persistierte Browser-Supabase-Session (OAuth) wird beim Logout zuverlässig entfernt; `signOut()` wird vor dem Redirect abgewartet (max. 2 s). Vorher konnte die Session beim nächsten Laden wiederhergestellt werden und der Logout wirkte nicht. (PR #296)
- **Registrierung**: Der „Registrieren"-Button konnte bis zu 30 s auf „Bitte warten…" hängen, weil ein kosmetischer Event-Popup-Fetch den Abschluss blockierte — jetzt auf 3 s gedeckelt. (PR #296)
- **Konto löschen**: Nach erfolgreicher Löschung wird die lokale Session (Tokens, Profil-Cache, Supabase-Session) geräumt und zur Login-Seite weitergeleitet. (PR #296)
- **Wetter**: 15-s-Timeout beim Wetter-Fetch mit Fehlerkarte und „Erneut versuchen"-Button statt endlosem Spinner; harter 15-s-Fallback-Timeout bei der GPS-Standortermittlung (der native Timeout greift in manchen WebViews während des Berechtigungsdialogs nicht). (PR #296)

### Geprüft (kein Fix nötig)
- **KI-Buddy**: Timeout, Retry mit Backoff, 401-Token-Refresh, Offline-Fallback und Loading-Handling waren bereits vorhanden und robust.
