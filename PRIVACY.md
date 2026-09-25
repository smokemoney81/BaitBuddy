# Datenschutzrichtlinie — BaitBuddy

**Gültig ab:** 1. Dezember 2024  
**Kontakt:** kaisaschnitt99@gmail.com

---

## 1. Datenschutz im Überblick

BaitBuddy ist eine Angeln-App für iOS und Android, die Benutzern hilft, ihre Angeltouren zu planen, zu dokumentieren und mit der KI-gestützten Community zu teilen. Diese Datenschutzrichtlinie erläutert, welche Daten wir erfassen, wie wir sie verwenden und welche Rechte Sie haben.

---

## 2. Datenverantwortlicher

**BaitBuddy** (Entwickler)  
E-Mail: kaisaschnitt99@gmail.com

---

## 3. Daten, die wir erfassen

### 3.1 Kontoregistrierung
- **E-Mail-Adresse** – für Login und Kommunikation
- **Passwort** (gehashed) – für Authentifizierung
- **Benutzername/Profil** – zur Identifikation in der Community

### 3.2 Standortdaten
- **GPS/Präzise Standorte** – optional, für:
  - Spot-Tracking (Angelplätze speichern)
  - Wetter-Integration (lokale Vorhersagen)
  - Karten-Funktionen
  - KI-Buddy-Kontext (regionale Schonzeiten, Events)
- **Speicherung:** Nur mit expliziter Benutzer-Erlaubnis
- **Zugriff:** Nutzer können Standorte löschen oder Tracking deaktivieren

### 3.3 Foto- und Mediensammlungen
- **Fangfotos** – Bilder von Fischen und Fangausrüstung
- **Speicherung:** In Supabase Storage (verschlüsselt)
- **Nutzung:** KI-Analyse (Fischart-Erkennung, Gewichtsschätzung)
- **Sichtbarkeit:** Privat pro default; Nutzer steuert Sichtbarkeit für Community

### 3.4 Fangbuch-Einträge
- **Art, Länge, Gewicht, Köder, Uhrzeit, Ort**
- **Speicherung:** Supabase Datenbank
- **Nutzung:** Persönliche Statistiken, KI-Buddy-Kontext, Community-Events

### 3.5 Mikrofon & Spracherkennung
- **Sprachaufnahmen** – nur während aktiver Spracherkennung (Mic-Button gedrückt)
- **Speicherung:** Nicht persistent; nur für Transkription verarbeitet
- **Provider:** Browser Web Speech API oder OpenAI Whisper (lokal verarbeitet)

### 3.6 KI-Buddy Gespräche
- **Chat-Verlauf** – zwischen Benutzer und KI-Buddy
- **Speicherung:** In Supabase für Kontext über Sessions
- **Nutzung:** Kontextuelle Antworten, personalisierte Empfehlungen
- **Datenschutz:** Nur der Benutzers eigene Chats sind für ihn sichtbar

### 3.7 Geräte- und Nutzungsdaten
- **Geräte-ID, OS, App-Version** – für Fehlerbehandlung
- **Anonyme Nutzungsstatistiken** – Fehler-Logs, Feature-Aufrufhäufigkeit
- **Cookie/LocalStorage** – für UI-State (Präferenzen, Chat-Position)

---

## 4. Datenverarbeitung & Sicherheit

### 4.1 Verschlüsselung
- **In Transit:** TLS 1.2+ für alle API-Verbindungen
- **At Rest:** Supabase-Verschlüsselung für Datenbankenspeicher
- **Fotos:** Verschlüsselt im Supabase Storage

### 4.2 Zugriffskontrolle
- **Authentifizierung:** Email + Passwort via Supabase Auth
- **Session-Management:** OAuth 2.0 für Social Login
- **API-Keys:** Serverseitig gespeichert, nicht im Frontend

### 4.3 Drittanbieter-Integrati­onen
- **Supabase (Datenbank & Auth)** – [supabase.io/privacy](https://supabase.io/privacy)
- **OpenAI Realtime API** (optional, Sprachgespräche) – [openai.com/privacy](https://openai.com/privacy)
- **Anthropic API (Claude)** (KI-Buddy, Textgenerierung & Bildanalyse) – [anthropic.com/legal/privacy](https://www.anthropic.com/legal/privacy)
- **ElevenLabs TTS** (optional, Sprachausgabe) – [elevenlabs.io/privacy](https://elevenlabs.io/privacy)
- **Open-Meteo Weather API** (Wetterdaten) – kostenlos, keine Authentifizierung
- **Hugging Face** (nur Android-App, nur nach Zustimmung) – Download des Sprachmodells Qwen3.5 4B (~2,6 GB, Apache-2.0) für den KI-Buddy auf dem Gerät. Übertragen wird nur die Download-Anfrage (IP-Adresse), keine Nutzerdaten – [huggingface.co/privacy](https://huggingface.co/privacy)

### 4.4 KI-Buddy auf dem Gerät (Android)
- **Aktivierung:** freiwillig unter Einstellungen → KI-Buddy → KI-Modus; der Download startet erst nach ausdrücklicher Bestätigung
- **Verarbeitung:** Im Modus „Nur auf dem Gerät“ (und im Automatik-Modus ohne Netz) werden Fragen und Antworten ausschließlich auf dem Gerät berechnet und nicht an Anthropic oder eine andere Cloud-KI gesendet
- **Weiterhin online:** Werkzeuge des Buddys (Wetter über Open-Meteo, Fangbuch/Spots/Regeln über das BaitBuddy-Backend), Vorlesen (Sprachausgabe-Dienst) und Spracherkennung (Android/Google)
- **Speicherort:** Modelldatei im privaten App-Speicher (nicht von anderen Apps lesbar, nicht im Backup); ein Rechenzwischenstand (~100 MB) im App-Cache
- **Löschung:** jederzeit über „Entfernen“ in den Einstellungen oder durch Deinstallation der App

---

## 5. Datenfreigabe & Community

### 5.1 Community-Features
- **Öffentliche Profile:** Benutzername ist standardmäßig sichtbar
- **Trips teilen:** Benutzer kann Angeltouren optional mit der Community teilen
- **Fangbuch (privat):** Standardmäßig nur für den Benutzer sichtbar
- **Spots (privat):** Nur der ersteller kann sie sehen, es sei denn, er teilt sie explizit

### 5.2 Keine Datenweitergabe an Marketing/Werbetreibende
- BaitBuddy verkauft oder teilt personenbezogene Daten nicht an Drittanbieter für Marketingzwecke
- Standorte und Fangdaten werden nicht an Fischereibehörden oder Werbetreibende weitergegeben

---

## 6. Datenaufbewahrung

| Datentyp | Aufbewahrungsfrist | Grund |
|---|---|---|
| Konto-Daten | Solange aktiv | Kontofunktionen |
| Fangbuch | Auf User-Anfrage löschbar | Persönliches Archiv |
| Fotos | Auf User-Anfrage löschbar | Dokumentation |
| Chat-Verlauf | 90 Tage automatisch | Kontexterhaltung KI-Buddy |
| API-Logs | 30 Tage | Fehlerbehandlung |
| Standort-Daten | Auf User-Anfrage löschbar | Spot-Tracking |

---

## 7. Benutzerrechte (DSGVO/lokale Datenschutzgesetze)

### 7.1 Recht auf Auskunft
- Anfordere eine Kopie aller Daten, die wir über dich speichern
- **Anfrage:** E-Mail an kaisaschnitt99@gmail.com mit Betreff "Dateneinsicht"

### 7.2 Recht auf Berichtigung
- Korrigiere falsche oder unvollständige Daten in deinem Profil
- **In-App:** Einstellungen → Profil bearbeiten

### 7.3 Recht auf Löschung ("Recht auf Vergessenwerden")
- Lösche dein Konto und alle damit verbundenen Daten
- **In-App:** Einstellungen → Konto → Konto löschen
- **Nach Bestätigung:** Alle Daten (Fangbuch, Fotos, Chats) innerhalb von 30 Tagen gelöscht

### 7.4 Recht auf Datenportabilität
- Erhalten Sie Ihre Daten in strukturiertem, maschinenlesbarem Format (JSON/CSV)
- **Anfrage:** E-Mail an kaisaschnitt99@gmail.com

### 7.5 Recht auf Widerspruch
- Widerspreche der Verarbeitung deiner Daten für Marketing/Profiling
- **In-App:** Einstellungen → Datenschutz → Tracking deaktivieren

---

## 8. Cookies & Tracking

### 8.1 Cookies, die wir verwenden
- **Session-Cookies:** `bb_token`, `bb_refresh` – für Authentifizierung (notwendig)
- **Präferenz-Cookies:** UI-State (Chat-Position, dunkler Modus) – lokal gespeichert
- **Keine Tracking-Cookies:** Wir verfolgen keine Nutzer über Websites hinweg

### 8.2 Cookie-Verweigerung
- In den Einstellungen kannst du nicht-essenzielle Cookies ablehnen
- Essenzielle Authentifizierungs-Cookies sind erforderlich für die Funktion

---

## 9. Kinder und Minderjährige

BaitBuddy ist nicht für Kinder unter 13 Jahren konzipiert. Eltern/Erziehungsberechtigte:
- Verhindern Sie Kontoregistrierung durch Kinder ohne Zustimmung
- Kontrollieren Sie Standort- und Kamera-Berechtigungen auf dem Gerät
- Bei Bedenken kontaktieren Sie: kaisaschnitt99@gmail.com

---

## 10. Datenschutzverletzungen & Sicherheitsvorfälle

Falls wir einen Verdacht auf einen Datenschutzverstoß oder Sicherheitvorfall haben:
1. **Wir benachrichtigen betroffene Nutzer innerhalb von 72 Stunden**
2. Wir melden den Vorfall den zuständigen Behörden (DSGVO Anforderung)
3. Wir implementieren Abhilfemaßnahmen

**Verdacht auf Sicherheitsproblem melden:** kaisaschnitt99@gmail.com

---

## 11. Änderungen dieser Datenschutzrichtlinie

Wir können diese Richtlinie aktualisieren. Wichtige Änderungen werden:
- In der App angezeigt
- Per E-Mail benachrichtigt
- Mit mindestens 30 Tagen Vorankündigung durchgeführt

Weiternutzung der App bedeutet Zustimmung zur aktualisierten Richtlinie.

---

## 12. Kontakt & Datenschutzbeauftragter

**Datenschutz-Anfragen:**
- E-Mail: kaisaschnitt99@gmail.com
- Betreff-Zeile verwenden: "[DATENSCHUTZ]"
- Antwortzeit: Innerhalb von 7 Werktagen

---

**Dokumentversion:** 1.0  
**Letzte Aktualisierung:** Dezember 2024
