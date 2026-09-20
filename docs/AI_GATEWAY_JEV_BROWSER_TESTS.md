# BaitBuddy: Jev via Vercel AI Gateway + Browser-Agent-Tests

## Ziel

Jev (`typesafe-ai/jev`) wird als schneller serverseitiger Decision-Layer verwendet.
Er entscheidet im ersten Schritt nur, welche optionalen BaitBuddy-Kontextquellen ein
KI-Buddy-Turn wirklich benötigt (Fangbuch, Regeln, Trip-Planung, Spots, Wetter).

Die nutzersichtbare Antwort bleibt bei der bestehenden Anthropic/Claude-Pipeline.
Dadurch wird die vorhandene Streaming-, Action- und TTS-Architektur nicht ersetzt.

## Sicherheitsgrenzen

- Kein AI-Gateway-, Anthropic-, OpenAI- oder OIDC-Key im Frontend.
- `AI_GATEWAY_API_KEY` und `VERCEL_OIDC_TOKEN` werden ausschließlich serverseitig gelesen.
- Keine `VITE_*`-Variable für AI-Secrets anlegen.
- Jev ist standardmäßig deaktiviert (`JEV_ENABLED` fehlt oder ist `0`).
- Gateway-Fehler sind fail-open: 402, 429, 503 oder andere Fehler fallen auf die bisherige Regex-Logik zurück.
- Nutzerkennung für Gateway-Observability wird SHA-256-gehasht; keine E-Mail wird als Gateway-Tag gesendet.
- Jev-Requests setzen Zero Data Retention und `disallowPromptTraining`.
- Eingaben für Jev sind auf 8.000 serialisierte Zeichen begrenzt.
- Der bestehende generative Claude-Aufruf behält sein Tokenlimit; Jev selbst liefert strukturierte Evaluationswerte statt Freitext.

## Server-Variablen

Optional:

```dotenv
JEV_ENABLED=1
JEV_MODEL=typesafe-ai/jev
AI_GATEWAY_API_KEY=...
```

Alternativ zu `AI_GATEWAY_API_KEY` kann Vercel-OIDC verwendet werden:

```text
VERCEL_OIDC_TOKEN
```

Den OIDC-Token nicht manuell committen. Für lokale Entwicklung die
Projektumgebung mit der Vercel CLI abrufen:

```bash
vercel link
vercel env pull backend/.env.local
```

Danach sicherstellen, dass die lokale Datei ignoriert bleibt. Nie einen dieser
Werte nach `VITE_*` kopieren.

## Vercel Dashboard: Aktivierung ohne Produktions-Risiko

1. Vercel-Projekt **BaitBuddy** öffnen.
2. AI Gateway öffnen und zunächst nur vorhandene Free-Credits/Free-Tier verwenden.
3. Spend-/Budget-Schutz möglichst niedrig setzen; keine automatische teure Modellumschaltung aktivieren.
4. Unter Project Settings -> Environment Variables zunächst **Preview** konfigurieren:
   - `JEV_ENABLED=1`
   - `JEV_MODEL=typesafe-ai/jev`
   - falls OIDC nicht genutzt wird: `AI_GATEWAY_API_KEY=<secret>`
5. Keine Variable mit Prefix `VITE_` anlegen.
6. Preview-Deployment prüfen.
7. Erst nach bestandenen Tests die gleichen Variablen für Production freigeben.

Dieses Repository nimmt keine automatische Produktionsfreigabe vor.

## Automatisierte Browser-Regressionen

Playwright bleibt die deterministische CI-Schicht:

```bash
npm run test:e2e
npm run test:e2e:buddy
```

Der Buddy-E2E-Test prüft unter anderem:

- Dashboard lädt.
- KI-Buddy-Widget lässt sich öffnen.
- Nachricht kann gesendet werden.
- Streaming-Fehler fällt auf den normalen Chat-Endpoint zurück.
- Antwort/Fallback erscheint.
- Eingabe und Button bleiben bedienbar.
- Keine AI-Gateway-/OIDC-/Anthropic-Secrets erscheinen in DOM, Web Storage oder Browser-Request-Headers.

## agent-browser: lokale/Preview-Prüfung

`agent-browser` ist absichtlich **keine Runtime- oder Produktionsabhängigkeit**.
Es dient nur explorativen Prüfungen durch einen Coding-Agenten.

Installation/Skill für den verwendeten Coding-Agenten:

```bash
npx skills add vercel-labs/agent-browser
```

Lokaler Ablauf:

```bash
npm run dev -- --port 5173 --strictPort
agent-browser open http://localhost:5173
agent-browser snapshot -i
```

Danach die aktuellen `@e*`-Refs aus dem Snapshot verwenden:

```bash
agent-browser click @eN
agent-browser snapshot -i
agent-browser fill @eM "Testnachricht an BaitBuddy"
agent-browser click @eK
agent-browser snapshot -i
```

Refs dürfen nicht hart codiert werden, da sie sich nach DOM-Änderungen verschieben.
Nach Navigation oder dynamischen UI-Änderungen immer erneut `snapshot -i` ausführen.

Für eine Preview statt localhost:

```bash
agent-browser open https://<preview-url>
agent-browser snapshot -i
```

Keine Produktionsseite für destruktive oder schreibende Agent-Tests verwenden.

## Verifikationsreihenfolge

```bash
npm ci --legacy-peer-deps --no-audit --no-fund
cd backend && npm ci --legacy-peer-deps --no-audit --no-fund && cd ..
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e:buddy
```

Danach optional der explorative `agent-browser`-Durchlauf auf localhost oder Preview.

## Rollback

Jev kann ohne Code-Rollback abgeschaltet werden:

```dotenv
JEV_ENABLED=0
```

Dann verwendet der KI-Buddy sofort wieder ausschließlich die bisherige
deterministische Regex-Entscheidung für die Kontextquellen.
