# Higgsfield Video-Generierungs-Integration

**Status:** ✅ Backend implementiert | ⏳ Frontend integriert | 🔌 API credentials fehlen

## 🎯 Übersicht

Die BaitBuddy-App kann jetzt **Video-Inhalte via Higgsfield generieren**. Der KI-Buddy kann:
- Tutorial-Videos erstellen (z.B. Knoten binden, Montage-Anleitung)
- Angelpraxis-Videos generieren (Führungsstile, Köder-Einsatz)
- Marketing-Content produzieren

**Beispiel im KI-Buddy:**
```
Nutzer: "Erkläre mir, wie ich einen Palomar-Knoten binde"
Buddy: [Erklärt Schritt für Schritt + generiert Video]
```

---

## 🔧 Setup-Anleitung

### 1. Higgsfield Credentials beschaffen

```bash
# Login
higgsfield auth login
# Browser öffnet sich für OAuth

# Workspace-ID finden
higgsfield workspace list --json

# API-Token kopieren
higgsfield auth token
```

### 2. Environment-Variablen setzen

**Lokal** (`backend/.env`):
```env
HIGGSFIELD_API_KEY=<token aus step 1>
HIGGSFIELD_WORKSPACE_ID=<id aus step 1>
# Optional: Video-Modell überschreiben
# HIGGSFIELD_VIDEO_MODEL=muses-2-v1.0
```

**Production** (Vercel/Cloudflare):
```bash
# Vercel Secrets
vercel env add HIGGSFIELD_API_KEY
vercel env add HIGGSFIELD_WORKSPACE_ID

# Cloudflare (als Container-Secrets)
wrangler secret put HIGGSFIELD_API_KEY
wrangler secret put HIGGSFIELD_WORKSPACE_ID
```

### 3. Testen

```bash
# Backend-Test
curl -X POST http://localhost:3000/api/video/generate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Ein Hecht, der einen Wobbler jagt"}'

# Frontend-Test
import { useVideoGeneration } from '@/hooks/useVideoGeneration';
const { generateVideo } = useVideoGeneration();
const job = await generateVideo('Tutorial-Prompt');
```

---

## 📁 Neue Dateien

### Backend
- **`backend/src/lib/higgsfield.js`** – Higgsfield API Client
  - `generateVideo(prompt, options)` – Video-Job starten
  - `getJobStatus(jobId)` – Status abfragen
  - `listVideoModels()` – verfügbare Modelle auflisten
  - `generateSpeech(text, options)` – TTS (optional)

- **`backend/src/routes/video.js`** – REST-Endpunkte
  - `POST /api/video/generate` – Video starten
  - `GET /api/video/jobs/:jobId` – Status prüfen
  - `GET /api/video/models` – Modelle auflisten
  - `GET /api/video/health` – Health-Check

- **`backend/src/lib/higgsfield.test.js`** – Unit-Tests

### Frontend
- **`src/hooks/useVideoGeneration.js`** – React Hook
  - `generateVideo(prompt, options)` – Video generieren
  - `checkStatus(jobId)` – Job-Status prüfen
  - `listModels()` – verfügbare Modelle

- **`src/components/video/VideoGenerator.jsx`** – Video-Player & Status
  - Automatisches Polling
  - Fehlerbehandlung
  - Fortschrittsanzeige

### Konfiguration
- **`backend/.env.example`** – neue Env-Variablen dokumentiert
- **`backend/src/lib/buddyActionCatalog.js`** – `generate_video` Aktion hinzugefügt
- **`src/utils/buddyActions.js`** – Video-Aktion Handler

---

## 🎬 API-Referenz

### Video-Generierung starten

**Request:**
```bash
POST /api/video/generate
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "prompt": "Ein Angelkenner erklärt, wie man einen Palomar-Knoten bindet",
  "duration": 8,
  "model": "muses-2-v1.0",
  "style": "tutorial",
  "language": "de"
}
```

**Response:**
```json
{
  "job_id": "vid-abc123xyz",
  "status": "pending",
  "prompt": "...",
  "created_at": "2026-09-18T10:30:00Z"
}
```

### Job-Status prüfen

**Request:**
```bash
GET /api/video/jobs/vid-abc123xyz
Authorization: Bearer <user-token>
```

**Response:**
```json
{
  "job_id": "vid-abc123xyz",
  "status": "processing",
  "progress": 45,
  "url": null
}
```

Status-Werte:
- `pending` – Eingereiht
- `processing` – Wird generiert (Progress 0-100%)
- `completed` – Fertig, Video unter `url` abrufbar
- `failed` – Fehler: siehe `error` Feld

---

## 🤖 KI-Buddy Integration

Der Buddy kann Video-Generierung per `<<ACTION>>`-Block auslösen:

```json
{
  "type": "generate_video",
  "params": {
    "prompt": "Kurze Animation: Wie man einen Palomar-Knoten bindet...",
    "duration": 15
  }
}
```

**System-Prompt Regel:**
> Nutze diese Aktion, wenn der Nutzer dich bittet, eine Technik, Montage oder Angelpraxis als Video zu zeigen. Der Prompt muss präzise und auf Deutsch sein.

---

## 🔌 Higgsfield API-Endpunkte (via Client)

| Methode | Endpoint | Zweck |
|---------|----------|-------|
| `POST` | `/v1/video/generate` | Video-Job erstellen |
| `GET` | `/v1/video/jobs/{id}` | Job-Status abrufen |
| `GET` | `/v1/models/video` | Video-Modelle auflisten |
| `POST` | `/v1/audio/tts` | Text-to-Speech (optional) |
| `GET` | `/v1/health` | API-Status |

**Authentication:** Bearer Token in `Authorization` Header

---

## 📊 Performance & Limits

- **Video-Länge:** 1–60 Sekunden (Default 8s)
- **Prompt-Länge:** Max. 5000 Zeichen
- **Generierungszeit:** ~30–120 Sekunden (modellabhängig)
- **Polling:** Alle 3 Sekunden im Frontend (configurable)
- **Job-Retention:** Kurz nach Abschluss (Higgsfield-seitig)

**Rate Limiting:** `/api/ai`-Limitierung gilt auch für Videos (teuer genug).

---

## 🛠️ Troubleshooting

### „Video generation not configured"
→ `HIGGSFIELD_API_KEY` oder `HIGGSFIELD_WORKSPACE_ID` nicht gesetzt.

### Job bleibt in `processing` stecken
→ Polling-Interval überprüfen, Status manuell via `GET /api/video/jobs/…` prüfen.

### Video-URL ist ungültig
→ Kurzzeitlinks von Higgsfield verfallen nach ~24h; erneut generieren.

### CORS-Fehler beim Video-Abspielen
→ S3/CDN-Video-URL muss `Access-Control-Allow-Origin: *` haben (Higgsfield regelt das).

---

## 🚀 Nächste Schritte (Optional)

- [ ] WebRTC Streaming für Live-Generierung
- [ ] Video-Speicherung in Supabase Storage
- [ ] Custom Branding/Watermarks
- [ ] Batch-Video-Generierung
- [ ] Lokales Caching generierter Videos
- [ ] Voice-Sync mit ElevenLabs (Lippe-Bewegung)

---

## 📚 Dokumentation

- [Higgsfield Docs](https://higgsfield.io/docs)
- [Higgsfield CLI](https://github.com/higgsfield/cli)
- [BaitBuddy KI-Buddy](./KI_BUDDY.md)
- [BaitBuddy Backend API](./BACKEND_API.md)
