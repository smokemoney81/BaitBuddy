import React, { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChefHat, Clock, Users, ArrowLeft, Leaf, AlertCircle, UtensilsCrossed, Star } from "lucide-react";
import { ai } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

const DIFFICULTY_COLOR = {
  Einfach:        "bg-green-900/40 text-green-300 border-green-700",
  Mittel:         "bg-amber-900/40 text-amber-300 border-amber-700",
  Anspruchsvoll:  "bg-red-900/40 text-red-300 border-red-700",
};

const METHOD_ICONS = {
  Braten:   "🍳",
  Grillen:  "🔥",
  Räuchern: "💨",
  Dünsten:  "♨️",
  Beizen:   "🧂",
  Sashimi:  "🍣",
};

function RecipeCard({ recipe, index }) {
  const [open, setOpen] = useState(index === 0);
  const icon = METHOD_ICONS[recipe.method] || "🍽️";
  const diffCls = DIFFICULTY_COLOR[recipe.difficulty] || DIFFICULTY_COLOR.Mittel;

  return (
    <Card className="bg-gray-800/60 border-gray-700/60 hover:border-gray-600 transition-colors">
      <CardHeader
        className="pb-2 cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <div>
              <CardTitle className="text-sm font-semibold text-white">{recipe.name}</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">{recipe.method}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${diffCls}`}>{recipe.difficulty}</Badge>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{recipe.prepTimeMin} Min</span>
            </div>
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-gray-300">{recipe.description}</p>

          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Zutaten</p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.ingredients.map((ing, i) => (
                  <Badge key={i} variant="secondary" className="text-xs bg-gray-700/60 text-gray-300">
                    {ing}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {recipe.tip && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-cyan-900/20 border border-cyan-800/30">
              <Star className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-cyan-300">{recipe.tip}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function FishRecipes() {
  useFeatureTracking("fish_recipes");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL-Parameter von der Logbook-Seite
  const speciesParam  = searchParams.get("species") || "";
  const weightParam   = searchParams.get("weight_g") ? Number(searchParams.get("weight_g")) : null;
  const lengthParam   = searchParams.get("length_cm") ? Number(searchParams.get("length_cm")) : null;
  const dateParam     = searchParams.get("catch_date") || null;
  const keepParam     = searchParams.get("keep");

  const [species, setSpecies]   = useState(speciesParam);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

  const loadRecipes = useCallback(async (sp = species) => {
    if (!sp?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await ai.fishRecipes(
        sp.trim(),
        weightParam,
        lengthParam,
        dateParam,
        keepParam === "false" ? false : keepParam === "true" ? true : undefined
      );
      setResult(res);
    } catch (e) {
      setError(e?.message || "Rezepte konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [species, weightParam, lengthParam, dateParam, keepParam]);

  // Beim ersten Aufruf mit vorausgefüllter Fischart direkt laden
  React.useEffect(() => {
    if (speciesParam) loadRecipes(speciesParam);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-bold text-white">Rezeptvorschläge</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Fischart-Eingabe */}
        <Card className="bg-gray-800/60 border-gray-700/60">
          <CardContent className="pt-4 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-400 mb-1 block">Fischart</label>
                <input
                  type="text"
                  value={species}
                  onChange={e => setSpecies(e.target.value)}
                  placeholder="z.B. Hecht, Zander, Karpfen …"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                  onKeyDown={e => e.key === "Enter" && loadRecipes()}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => loadRecipes()}
                  disabled={!species.trim() || loading}
                  className="bg-amber-600 hover:bg-amber-500 text-white h-9"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
                  <span className="ml-2 text-sm">Rezepte</span>
                </Button>
              </div>
            </div>

            {/* Fang-Info aus URL */}
            {(weightParam || lengthParam) && (
              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                {weightParam && <span>Gewicht: {(weightParam / 1000).toFixed(2)} kg</span>}
                {lengthParam && <span>Länge: {lengthParam} cm</span>}
                {dateParam && <span>Datum: {new Date(dateParam).toLocaleDateString("de-DE")}</span>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Laden */}
        {loading && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-sm text-gray-400">KI erstellt Rezeptvorschläge …</p>
          </div>
        )}

        {/* Fehler */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-900/20 border border-red-800/40">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Catch & Release Info */}
        {result?.catchAndRelease && (
          <Card className="bg-green-900/20 border-green-700/40">
            <CardContent className="pt-4 flex items-start gap-3">
              <Leaf className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-300">Catch & Release</p>
                <p className="text-sm text-green-400/80 mt-1">{result.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ergebnisse */}
        {result && !result.catchAndRelease && (
          <>
            {/* Vorverarbeitung */}
            {result.prepNotes && (
              <Card className="bg-blue-900/20 border-blue-800/40">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">Vorverarbeitung</p>
                      <p className="text-sm text-blue-200/80">{result.prepNotes}</p>
                    </div>
                  </div>
                  {result.portionCount && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                      <Users className="w-3.5 h-3.5" />
                      <span>Reicht für ca. {result.portionCount} Portionen</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Rezepte */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                {result.recipes?.length || 0} Rezeptvorschläge für {result.species}
              </p>
              {(result.recipes || []).map((recipe, i) => (
                <RecipeCard key={i} recipe={recipe} index={i} />
              ))}
            </div>

            {/* Nachhaltigkeit */}
            {result.sustainabilityNote && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-green-900/10 border border-green-800/30">
                <Leaf className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-green-400/80">{result.sustainabilityNote}</p>
              </div>
            )}

            {/* Erneut laden */}
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white text-xs"
                onClick={() => loadRecipes()}
              >
                Andere Rezepte vorschlagen
              </Button>
            </div>
          </>
        )}

        {/* Leer-Zustand */}
        {!loading && !result && !error && (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <ChefHat className="w-12 h-12 text-gray-600" />
            <p className="text-gray-500 text-sm">
              Fischart eingeben und Rezeptvorschläge direkt vom KI-Buddy erhalten.
            </p>
            <p className="text-gray-600 text-xs">
              Berücksichtigt Fischgröße, Gewicht und Schonzeiten.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
