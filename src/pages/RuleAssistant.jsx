import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Scale, Fish, Calendar, AlertTriangle, CheckCircle,
  Search, MapPin, Info, Loader2, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { isInClosedSeason, nextClosedSeasonStart } from "@/lib/closedSeason";
import { ai } from "@/api/frontendClient";

// Bundeslander
const BUNDESLAENDER = [
  "Bayern", "Baden-Württemberg", "Berlin", "Brandenburg", "Bremen",
  "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
  "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
  "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
];

// Basisregeln (regionale Abweichungen über KI-Buddy)
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
    <Card className={`border transition-all ${inSeason ? "border-red-700/50 bg-red-950/20" : "border-gray-700/50 bg-gray-800/40"}`}>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Fish className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">{rule.species}</span>
              {inSeason ? (
                <Badge className="bg-red-800/60 text-red-300 border border-red-700 text-xs">
                  <AlertTriangle className="w-2.5 h-2.5 mr-1" />Schonzeit
                </Badge>
              ) : (
                <Badge className="bg-green-900/40 text-green-300 border border-green-700 text-xs">
                  <CheckCircle className="w-2.5 h-2.5 mr-1" />Angelbar
                </Badge>
              )}
              {lengthOk !== null && (
                <Badge variant="outline" className={`text-xs ${lengthOk ? "text-green-400 border-green-700" : "text-red-400 border-red-700"}`}>
                  {lengthOk ? "Maß OK" : "Untermaß!"}
                </Badge>
              )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 pl-6 text-xs">
              <div>
                <span className="text-gray-500">Mindestmaß:</span>
                <span className="text-white ml-1.5">{rule.mindestmass} {rule.unit}</span>
              </div>
              {rule.closed_from ? (
                <div>
                  <span className="text-gray-500">Schonzeit:</span>
                  <span className="text-amber-300 ml-1.5">
                    {formatDMY(rule.closed_from)} – {formatDMY(rule.closed_to)}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-gray-500">Schonzeit:</span>
                  <span className="text-green-400 ml-1.5">Keine</span>
                </div>
              )}
            </div>

            {!inSeason && daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && (
              <p className="text-xs text-amber-400 pl-6 mt-1">
                Schonzeit beginnt in {daysLeft} Tag{daysLeft !== 1 ? "en" : ""}
              </p>
            )}

            {rule.notes && (
              <p className="text-xs text-gray-500 pl-6 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                {rule.notes}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <Scale className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-bold text-white">Schonzeiten-Assistent</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Haftungshinweis */}
        <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-700/40 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            Alle Angaben sind Richtwerte. Lokale Regelungen des Angelverbands und Landesgesetze haben Vorrang.
            Vor dem Angeln immer die gültige Gewässerordnung prüfen.
          </p>
        </div>

        {/* Filter */}
        <Card className="bg-gray-800/40 border-gray-700/40">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Fischart suchen …"
                className="bg-gray-700 border-gray-600 text-white text-sm pl-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Bundesland
                </label>
                <Select value={bundesland} onValueChange={setBundesland}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 text-white text-sm h-9">
                    <SelectValue placeholder="Alle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Alle Bundesländer</SelectItem>
                    {BUNDESLAENDER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block flex items-center gap-1">
                  <Scale className="w-3 h-3" /> Fischlänge (cm)
                </label>
                <Input
                  type="number"
                  value={searchLength}
                  onChange={e => setSearchLength(e.target.value)}
                  placeholder="z.B. 48"
                  className="bg-gray-700 border-gray-600 text-white text-sm h-9"
                  min={0}
                  max={300}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Aktuell in Schonzeit */}
        {inSeasonNow.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide px-1 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Aktuell in Schonzeit ({inSeasonNow.length})
            </p>
            <div className="space-y-2">
              {inSeasonNow.map(r => <RuleCard key={r.species} rule={r} searchLength={searchLength} />)}
            </div>
          </div>
        )}

        {/* Angelbar */}
        {freeNow.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wide px-1 mb-2 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Jetzt angelbar ({freeNow.length})
            </p>
            <div className="space-y-2">
              {freeNow.map(r => <RuleCard key={r.species} rule={r} searchLength={searchLength} />)}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-10 gap-2">
            <Fish className="w-10 h-10 text-gray-700" />
            <p className="text-sm text-gray-500">Keine Fischart gefunden.</p>
          </div>
        )}

        {/* KI-Frage */}
        <Card className="bg-gray-800/40 border-gray-700/40">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">KI-Regelauskunft</p>
            <p className="text-xs text-gray-500">
              Stelle eine spezifische Frage zu Schonzeiten, Mindestmaßen oder lokalen Sonderregeln.
              {bundesland && <span className="text-cyan-400"> Bundesland: {bundesland}</span>}
            </p>
            <div className="flex gap-2">
              <Input
                value={aiQuestion}
                onChange={e => setAiQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && askBuddy()}
                placeholder={`z.B. "Darf ich in ${bundesland || "Bayern"} Hecht im März angeln?"`}
                className="bg-gray-700 border-gray-600 text-white text-sm flex-1"
              />
              <Button
                onClick={askBuddy}
                disabled={aiLoading || !aiQuestion.trim()}
                className="bg-amber-700 hover:bg-amber-600 text-white flex-shrink-0"
                size="sm"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>

            {aiAnswer && (
              <div className="p-3 rounded-xl bg-gray-700/40 border border-gray-600/40">
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Link zur Prüfungsvorbereitung */}
        <button
          onClick={() => navigate("/AngelscheinPruefungSchonzeiten")}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-800/40 border border-gray-700/40 hover:bg-gray-800/60 transition"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-white">Angelschein-Prüfungsvorbereitung</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}
