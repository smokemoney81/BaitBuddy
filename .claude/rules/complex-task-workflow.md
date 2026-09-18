# Komplexe Aufgaben — Workflow für große Änderungen

Für Aufgaben, die Architektur, Datenschema, Sicherheit, Migrationen oder große Refactors betreffen.

## 1. Modellempfehlung

Vor Start ein verfügbares Modell empfehlen:

**FORMAT:**
```
MODEL: <model> — <reason>
```

**Logik:**
- Haiku → triviale/mechanische Änderungen
- Sonnet → normale Entwicklung, Debugging, Multi-File-Coding
- Opus → Architektur, schwierige Bugs, Sicherheit, Migrationen

Recommendation ist advisory — nicht blockierend. Nutze das beste verfügbare Modell.

---

## 2. Gegenfragen-Gate

**Prüfe:** Könnte eine unklare Entscheidung die Architektur/Datenschema/Sicherheit/Verhalten ändern?

**Wenn ja:**
- Stelle 2–3 Fragen, die tatsächlich blockieren
- Nicht: "hast du allgemeine Fragen?"
- Sondern: "Betroffen die Änderung die RLS-Policy? Müssen alte Daten migriert werden?"
- Warte auf Antworten, DANN implementiere

**Wenn nein:**
```
QUESTIONS: None required.
```
Implementiere sofort mit sinnvollen Annahmen. Dokumentiere die Annahmen kurz.

---

## 3. Architektur First

Bevor du Code änderst:

1. **Code inspizieren** — Affected Modules, Existing Patterns, Dependencies
2. **Datenfluss verstehen** — Frontend → Backend → DB, Persistence, Auth, Subscriptions
3. **Existing erweitern** — Nicht: separate Demo-App, doppelte Services, neue State-Systeme
4. **Kein Mock-Code** — Productionlogik mit echten Daten/APIs

Für BaitBuddy bedeutet das:
- Neue Features nutzen bestehende User-Context, Data Flows
- Nicht: lokale Testdaten, getrennte Modules ohne Integration

---

## 4. Implementierung

Nach Klarheit:

1. **Smallest complete solution** — nicht: perfekt designed
2. **Directly affected behavior validieren** — nicht: alles prüfen
3. **Regressions fixieren** — wenn die Änderung etwas bricht
4. **No unrelated refactors** — Bug-Fix ≠ Cleanup-Zeit

---

## 5. Response-Stil

Gründlich denken. Prägnant antworten.

**Nicht:**
- Prompt wiederholen
- Routine-Tool-Usage narriieren
- Lange Intros
- Offensichtliche Steps erklären
- Große Summaries (außer gewünscht)

**Statt dessen:**
```
DONE:
- <was sich änderte>
- <validierung durchgeführt>
- <ungelöstes issue, if any>
```

Zusätz-Erklärung nur wenn: entscheidungs-relevant, risiko-exponierend, oder user-requested.

---

## 6. Autonomie

Prefer Aktion über Klärung.

- **Gegenfragen nur bei echtem Blocker** — nicht wegen Unsicherheit
- **Defaults verwenden** — Sinnvolle Annahmen > umfassen Planung
- **Arbeite autonom** — Nicht "Soll ich …?", sondern "Hier ist mein Ansatz"

---

Diese Regeln gelten für alle signifikanten Aufgaben an BaitBuddy.
Bei Fragen zu großen Vorhaben: siehe hier.
