import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Scale, Fish, Calendar, AlertTriangle, CheckCircle,
  Search, MapPin, Info, Loader2, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { isInClosedSeason, nextClosedSeasonStart } from "@/lib/closedSeason";
import { ai } from "@/api/frontendClient";
import SubPageHeader from "@/components/layout/SubPageHeader";

const BUNDESLAENDER = [
  "Bayern", "Baden-Württemberg", "Berlin", "Brandenburg", "Bremen",
  "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
  "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
  "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
];

const BASE_RULES = [
  { species: "Hecht",        closed_from: "02-01", closed_to: "04-30", mindestmass: 50, unit: "cm", notes: "Bayern: 01.02.–30.04." },
  { species: "Zander",       closed_from: "03-01", closed_to: "05-31", mindestmass: 40, unit: "cm", notes: "Regional 40–45 cm" },
  { species: "Karpfen",      closed_from: null,     closed_to: null,    mindestmass: 35, unit: "cm", notes: "Keine bundesweite Schonzeit" },
  { species: "Bachforelle",  closed_from: "10-01", closed_to: "03-14", mindestmass: 25, unit: "cm", notes: "Kreis-/Landesrecht prüfen" },
  { species: "Regenbogenforelle", closed_from: null, closed_to: null,  mindestmass: 25, unit: "cm", notes: "Teichwirtschaft, keine Schonzeit" },
  { species: "Barsch",       closed_from: "03-01", closed_to: "05-31", mindestmass: 15, unit: "cm", notes: "Regional variiert" },
  { species: "Rotauge",      closed_from: "03-15", closed_to: "05-15", mindestmass: 15, unit: "cm", notes: "Regional" },
  { species: "Aal",          closed_from: null,     closed_to: null,   mindestmass: 45, unit: "cm", notes: "EU-Aalverordnung — regional ganzjährig gesperrt" },
  { species: "Wels",         closed_from: "04-15", closed_to: "06-15", mindestmass: 60, unit: "cm", notes: "Regional 50–70 cm" },
  { species: "Schleie",      closed_from: "04-01", closed_to: "05-31", mindestmass: 25, unit: "cm", notes: "Regional" },
  { species: "Brachse",      closed_from: "04-01", closed_to: "05-31", mindestmass: 25, unit: "cm", notes: "Regional" },
  { species: "Döbel",        closed_from: null,     closed_to: null,   mindestmass: 20, unit: "cm", notes: "Selten geregelt" },
  { species: "Lachs",        closed_from: "08-15", closed_to: "12-31", mindestmass: 60, unit: "cm", notes: "Bundeslandabhängig" },
  { species: "Äsche",        closed_from: "03-01", closed_to: "05-31", mindestmass: 30, unit: "cm", notes: "Regional unterschiedlich" },
  { species: "Huchen",       closed_from: "02-01", closed_to: "05-31", mindestmass: 60, unit: "cm", notes: "Donau-Einzugsgebiet" },
  { species: "Rapfen",       closed_from: "04-01", closed_to: "06-30", mindestmass: 35, unit: "cm", notes: "Regional" },
  { species: "Maräne",       closed_from: "09-15", closed_to: "01-31", mindestmass: 35, unit: "cm", notes: "Norddeutschland" },
  { species: "Quappe",       closed_from: null,     closed_to: null,   mindestmass: 25, unit: "cm", notes: "Keine bundesweite Regelung" },
  { species: "Karausche",    closed_from: null,     closed_to: null,   mindestmass: 20, unit: "cm", notes: "Regional" },
  { species: "Güster",       closed_from: "04-01", closed_to: "05-31", mindestmass: 15, unit: "cm", notes: "Regional" },
];

function formatDMY(mmdd) {
  if (!mmdd) return null;
  const [m, d] = mmdd.split("-").map(Number);
  return `${String(d).padStart(2,"0")}.${String(m).padStart(2,"0")}.`;
}

function daysUntil(date) {
  const diff = date - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function RuleCard({ rule, searchLength }) {
  const inSeason = isInClosedSeason(rule.closed_from, rule.closed_to);
  const nextStart = rule.closed_from ? nextClosedSeasonStart(rule.closed_from) : null;
  const daysLeft = nextStart ? daysUntil(nextStart) : null;

  const lengthOk = searchLength
    ? Number(searchLength) >= rule.mindestmass
    : null;

  return (
    <div
      className="bb-card"
      style={inSeason ? { borderColor: 'rgba(239,68,68,.4)', background: 'rgba(239,68,68,.06)' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Fish size={16} style={{ color: 'var(--bb-cyan)' }} />
            <span className="text-sm font-semibold text-white">{rule.species}</span>
            {inSeason ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ background: 'rgba(239,68,68,.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.3)' }}>
                <AlertTriangle size={10} />Schonzeit
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ background: 'rgba(34,197,94,.15)', color: '#86efac', border: '1px solid rgba(34,197,94,.3)' }}>
                <CheckCircle size={10} />Angelbar
              </span>
            )}
            {lengthOk !== null && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={lengthOk
                  ? { color: '#4ade80', border: '1px solid rgba(34,197,94,.4)' }
                  : { color: '#f87171', border: '1px solid rgba(239,68,68,.4)' }
                }>
                {lengthOk ? "Mass OK" : "Untermass!"}
              </span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 pl-6 text-xs">
            <div>
              <span style={{ color: 'rgba(255,255,255,.35)' }}>Mindestmass:</span>
              <span className="text-white ml-1.5">{rule.mindestmass} {rule.unit}</span>
            </div>
            {rule.closed_from ? (
              <div>
                <span style={{ color: 'rgba(255,255,255,.35)' }}>Schonzeit:</span>
                <span className="ml-1.5" style={{ color: '#fcd34d' }}>
                  {formatDMY(rule.closed_from)} – {formatDMY(rule.closed_to)}
                </span>
              </div>
            ) : (
              <div>
                <span style={{ color: 'rgba(255,255,255,.35)' }}>Schonzeit:</span>
                <span className="ml-1.5" style={{ color: '#4ade80' }}>Keine</span>
              </div>
            )}
          </div>

          {!inSeason && daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
            <p className="text-xs pl-6 mt-1" style={{ color: '#fbbf24' }}>
              Schonzeit beginnt in {daysLeft} Tag{daysLeft !== 1 ? "en" : ""}
            </p>
          )}

          {rule.notes && (
            <p className="text-xs pl-6 mt-1 flex items-start gap-1" style={{ color: 'rgba(255,255,255,.35)' }}>
              <Info size={12} className="flex-shrink-0 mt-0.5" />
              {rule.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RuleAssistant() {
  useFeatureTracking("rule_assistant");
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm]     = useState("");
  const [bundesland, setBundesland]     = useState("");
  const [searchLength, setSearchLength] = useState("");
  const [aiQuestion, setAiQuestion]     = useState("");
  const [aiAnswer, setAiAnswer]         = useState(null);
  const [aiLoading, setAiLoading]       = useState(false);

  const filtered = BASE_RULES.filter(r =>
    !searchTerm || r.species.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inSeasonNow = filtered.filter(r => isInClosedSeason(r.closed_from, r.closed_to));
  const freeNow     = filtered.filter(r => !isInClosedSeason(r.closed_from, r.closed_to));

  const askBuddy = useCallback(async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const question = bundesland
        ? `${aiQuestion} (Bundesland: ${bundesland})`
        : aiQuestion;
      const res = await ai.chat([{ role: "user", content: question }]);
      setAiAnswer(res?.content || res?.reply || "Keine Antwort erhalten.");
    } catch (e) {
      toast.error("KI-Abfrage fehlgeschlagen");
    } finally {
      setAiLoading(false);
    }
  }, [aiQuestion, bundesland]);

  return (
    <div className="bb-page">
      <SubPageHeader title="Schonzeiten-Assistent" icon={Scale} iconColor="#fbbf24" />

      {/* Haftungshinweis */}
      <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)' }}>
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
        <p className="text-xs" style={{ color: '#fcd34d' }}>
          Alle Angaben sind Richtwerte. Lokale Regelungen des Angelverbands und Landesgesetze haben Vorrang.
          Vor dem Angeln immer die gueltige Gewaesserordnung pruefen.
        </p>
      </div>

      {/* Filter */}
      <div className="bb-card grid gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'rgba(255,255,255,.3)' }} />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Fischart suchen ..."
            className="bg-gray-900 border-gray-700 text-white text-sm pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block flex items-center gap-1" style={{ color: 'var(--bb-muted)' }}>
              <MapPin size={12} /> Bundesland
            </label>
            <Select value={bundesland} onValueChange={setBundesland}>
              <SelectTrigger className="bg-gray-900 border-gray-700 text-white text-sm h-9">
                <SelectValue placeholder="Alle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Alle Bundeslaender</SelectItem>
                {BUNDESLAENDER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs mb-1 block flex items-center gap-1" style={{ color: 'var(--bb-muted)' }}>
              <Scale size={12} /> Fischlaenge (cm)
            </label>
            <Input
              type="number"
              value={searchLength}
              onChange={e => setSearchLength(e.target.value)}
              placeholder="z.B. 48"
              className="bg-gray-900 border-gray-700 text-white text-sm h-9"
              min={0}
              max={300}
            />
          </div>
        </div>
      </div>

      {inSeasonNow.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide px-1 mb-2 flex items-center gap-1" style={{ color: '#f87171' }}>
            <AlertTriangle size={14} /> Aktuell in Schonzeit ({inSeasonNow.length})
          </p>
          <div className="space-y-2">
            {inSeasonNow.map(r => <RuleCard key={r.species} rule={r} searchLength={searchLength} />)}
          </div>
        </div>
      )}

      {freeNow.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide px-1 mb-2 flex items-center gap-1" style={{ color: '#4ade80' }}>
            <CheckCircle size={14} /> Jetzt angelbar ({freeNow.length})
          </p>
          <div className="space-y-2">
            {freeNow.map(r => <RuleCard key={r.species} rule={r} searchLength={searchLength} />)}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-10 gap-2">
          <Fish size={40} style={{ color: 'rgba(255,255,255,.15)' }} />
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Keine Fischart gefunden.</p>
        </div>
      )}

      {/* KI-Frage */}
      <div className="bb-card grid gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--bb-muted)' }}>KI-Regelauskunft</p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>
          Stelle eine spezifische Frage zu Schonzeiten, Mindestmassen oder lokalen Sonderregeln.
          {bundesland && <span style={{ color: 'var(--bb-cyan)' }}> Bundesland: {bundesland}</span>}
        </p>
        <div className="flex gap-2">
          <Input
            value={aiQuestion}
            onChange={e => setAiQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && askBuddy()}
            placeholder={`z.B. "Darf ich in ${bundesland || "Bayern"} Hecht im Maerz angeln?"`}
            className="bg-gray-900 border-gray-700 text-white text-sm flex-1"
          />
          <button
            onClick={askBuddy}
            disabled={aiLoading || !aiQuestion.trim()}
            className="bb-action flex-shrink-0 px-3"
          >
            {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
          </button>
        </div>

        {aiAnswer && (
          <div className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,.25)', border: '1px solid var(--bb-border)' }}>
            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#d1d5db' }}>{aiAnswer}</p>
          </div>
        )}
      </div>

      {/* Link zur Pruefungsvorbereitung */}
      <button
        onClick={() => navigate("/AngelscheinPruefungSchonzeiten")}
        className="w-full flex items-center justify-between p-3 rounded-xl transition"
        style={{ background: 'var(--bb-surface)', border: '1px solid var(--bb-border)' }}
      >
        <div className="flex items-center gap-2">
          <Calendar size={16} style={{ color: '#60a5fa' }} />
          <span className="text-sm text-white">Angelschein-Pruefungsvorbereitung</span>
        </div>
        <ChevronRight size={16} style={{ color: 'var(--bb-muted)' }} />
      </button>
    </div>
  );
}
