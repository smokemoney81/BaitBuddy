import React from 'react';
const Section = ({ number, title, children }) => (
  <section className="mb-6">
    <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--bb-cyan)' }}>
      {number}. {title}
    </h2>
    <div className="text-gray-300 text-sm leading-relaxed space-y-2">
      {children}
    </div>
  </section>
);

export default function Datenschutz() {
  return (
    <div className="bb-page max-w-4xl mx-auto">
      <div className="bb-card">
        <div className="text-xl sm:text-2xl font-bold mb-6" style={{ color: 'var(--bb-cyan)' }}>
          Datenschutzerklärung - BaitBuddy
        </div>
        <div>
          <div className="mb-6 text-sm" style={{ color: 'var(--bb-muted)' }}>
            <p><strong>Stand:</strong> 25.02.2026</p>
          </div>

          <Section number="1" title="Verantwortlicher">
            <p>
              Sebastian Schorn<br />
              Deutschland<br />
              E-Mail: s.s.bedburg@gmail.com
            </p>
          </Section>

          <Section number="2" title="Allgemeine Hinweise">
            <p>
              Der Schutz personenbezogener Daten hat höchste Priorität. Die Verarbeitung erfolgt gemäß der Datenschutz-Grundverordnung (DSGVO) sowie dem Bundesdatenschutzgesetz (BDSG).
            </p>
          </Section>

          <Section number="3" title="Verarbeitete Daten">
            <p>Die App „BaitBuddy" verarbeitet - abhängig von der Nutzung - folgende Daten:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Geräte- und Nutzungsdaten (z. B. Betriebssystem, App-Version, technische Logdaten)</li>
              <li>Standortdaten (GPS) nur nach aktiver Einwilligung des Nutzers</li>
              <li>Inhaltsdaten aus dem Fangbuch (z. B. Fischart, Ort, Datum/Uhrzeit, Notizen, Fotos)</li>
              <li>Texteingaben im KI-Chat</li>
              <li>Sprachdaten ausschließlich zur unmittelbaren Verarbeitung; keine dauerhafte Speicherung</li>
            </ul>
          </Section>

          <Section number="4" title="Zweck der Datenverarbeitung">
            <ul className="list-disc pl-6 space-y-1">
              <li>Bereitstellung der App-Funktionen</li>
              <li>KI-gestützte Fang- und Ausrüstungsempfehlungen</li>
              <li>Speicherung und Anzeige persönlicher Fangdaten</li>
              <li>Sicherheit und Stabilität der App</li>
            </ul>
          </Section>

          <Section number="5" title="KI- und API-Nutzung">
            <p>
              Für KI-Funktionen werden Nutzereingaben an externe KI-APIs übermittelt. Die Verarbeitung erfolgt ausschließlich zur Beantwortung der Anfrage. Eine Nutzung zu Trainingszwecken findet nicht statt.
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Texteingaben im KI-Chat: OpenAI (ChatGPT API), ersatzweise Anthropic (Claude API)</li>
              <li>Fotos zur Bildanalyse (Fang-, Köder- und Ausrüstungserkennung): Google (Gemini API), ersatzweise OpenAI bzw. Anthropic</li>
            </ul>
          </Section>

          <Section number="6" title="Speicherung und Löschung">
            <ul className="list-disc pl-6 space-y-1">
              <li>Speicherung lokal auf dem Endgerät oder in der vom Nutzer genutzten Datenbank</li>
              <li>Daten können jederzeit gelöscht werden</li>
              <li>Bei Deinstallation werden lokale Daten entfernt</li>
            </ul>
          </Section>

          <Section number="7" title="Weitergabe von Daten">
            <p>
              Eine Weitergabe personenbezogener Daten an Dritte erfolgt nicht, außer bei gesetzlicher Verpflichtung oder technisch notwendigen Diensten (z. B. Karten, Wetter).
            </p>
          </Section>

          <Section number="8" title="Rechte der Nutzer">
            <p>
              Nutzer haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerruf erteilter Einwilligungen gemäß DSGVO.
            </p>
          </Section>

          <Section number="9" title="Datensicherheit">
            <p>
              Es werden technische und organisatorische Maßnahmen zum Schutz der Daten eingesetzt.
            </p>
          </Section>

          <Section number="10" title="Änderungen">
            <p>
              Diese Datenschutzerklärung kann angepasst werden.
            </p>
          </Section>

          <Section number="11" title="Kontakt">
            <p>E-Mail: s.s.bedburg@gmail.com</p>
          </Section>
        </div>
      </div>
    </div>
  );
}