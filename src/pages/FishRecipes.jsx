import React, { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ChefHat, Clock, Users, Leaf, AlertCircle, UtensilsCrossed, Star } from "lucide-react";
import { ai } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import SubPageHeader from "@/components/layout/SubPageHeader";

const DIFFICULTY_COLOR = {
  Einfach:        { background: 'rgba(34,197,94,.15)', color: '#86efac', border: '1px solid rgba(34,197,94,.3)' },
  Mittel:         { background: 'rgba(245,158,11,.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,.3)' },
  Anspruchsvoll:  { background: 'rgba(239,68,68,.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.3)' },
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
  const diffStyle = DIFFICULTY_COLOR[recipe.difficulty] || DIFFICULTY_COLOR.Mittel;

  return (
    <div className="bb-card">
      <div
        className="flex items-center justify-between gap-2 cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-white">{recipe.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--bb-muted)' }}>{recipe.method}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={diffStyle}>
            {recipe.difficulty}
          </span>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--bb-muted)' }}>
            <Clock size={14} />
            <span>{recipe.prepTimeMin} Min</span>
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm" style={{ color: '#d1d5db' }}>{recipe.description}</p>

          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--bb-muted)' }}>Zutaten</p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.ingredients.map((ing, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs"
                    style={{ background: 'rgba(255,255,255,.08)', color: '#d1d5db' }}
                  >
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {recipe.tip && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(0,229,255,.08)', border: '1px solid rgba(0,229,255,.2)' }}>
              <Star size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--bb-cyan)' }} />
              <p className="text-xs" style={{ color: 'rgba(0,229,255,.8)' }}>{recipe.tip}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FishRecipes() {
  useFeatureTracking("fish_recipes");
  const [searchParams] = useSearchParams();
  const _navigate = useNavigate();

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

  React.useEffect(() => {
    if (speciesParam) loadRecipes(speciesParam);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bb-page">
      <SubPageHeader title="Rezeptvorschlaege" icon={ChefHat} iconColor="#fbbf24" />

      {/* Fischart-Eingabe */}
      <div className="bb-card grid gap-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--bb-muted)' }}>Fischart</label>
            <input
              type="text"
              value={species}
              onChange={e => setSpecies(e.target.value)}
              placeholder="z.B. Hecht, Zander, Karpfen ..."
              className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none"
              style={{ background: 'rgba(0,0,0,.3)', border: '1px solid var(--bb-border)' }}
              onKeyDown={e => e.key === "Enter" && loadRecipes()}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => loadRecipes()}
              disabled={!species.trim() || loading}
              className="bb-action flex items-center gap-2 h-9"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ChefHat size={16} />}
              <span className="text-sm">Rezepte</span>
            </button>
          </div>
        </div>

        {(weightParam || lengthParam) && (
          <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--bb-muted)' }}>
            {weightParam && <span>Gewicht: {(weightParam / 1000).toFixed(2)} kg</span>}
            {lengthParam && <span>Laenge: {lengthParam} cm</span>}
            {dateParam && <span>Datum: {new Date(dateParam).toLocaleDateString("de-DE")}</span>}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: '#fbbf24' }} />
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>KI erstellt Rezeptvorschlaege ...</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)' }}>
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
        </div>
      )}

      {result?.catchAndRelease && (
        <div className="bb-card" style={{ borderColor: 'rgba(34,197,94,.3)', background: 'rgba(34,197,94,.08)' }}>
          <div className="flex items-start gap-3">
            <Leaf size={20} className="flex-shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#86efac' }}>Catch & Release</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(74,222,128,.7)' }}>{result.message}</p>
            </div>
          </div>
        </div>
      )}

      {result && !result.catchAndRelease && (
        <>
          {result.prepNotes && (
            <div className="bb-card" style={{ borderColor: 'rgba(59,130,246,.3)', background: 'rgba(59,130,246,.08)' }}>
              <div className="flex items-start gap-2">
                <UtensilsCrossed size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#93c5fd' }}>Vorverarbeitung</p>
                  <p className="text-sm" style={{ color: 'rgba(147,197,253,.7)' }}>{result.prepNotes}</p>
                </div>
              </div>
              {result.portionCount && (
                <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--bb-muted)' }}>
                  <Users size={14} />
                  <span>Reicht fuer ca. {result.portionCount} Portionen</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide px-1" style={{ color: 'var(--bb-muted)' }}>
              {result.recipes?.length || 0} Rezeptvorschlaege fuer {result.species}
            </p>
            {(result.recipes || []).map((recipe, i) => (
              <RecipeCard key={i} recipe={recipe} index={i} />
            ))}
          </div>

          {result.sustainabilityNote && (
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)' }}>
              <Leaf size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#22c55e' }} />
              <p className="text-xs" style={{ color: 'rgba(74,222,128,.7)' }}>{result.sustainabilityNote}</p>
            </div>
          )}

          <div className="flex justify-center pt-2">
            <button
              className="text-xs px-3 py-2 rounded-lg transition"
              style={{ color: 'var(--bb-muted)' }}
              onClick={() => loadRecipes()}
            >
              Andere Rezepte vorschlagen
            </button>
          </div>
        </>
      )}

      {!loading && !result && !error && (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <ChefHat size={48} style={{ color: 'rgba(255,255,255,.15)' }} />
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
            Fischart eingeben und Rezeptvorschlaege direkt vom KI-Buddy erhalten.
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.25)' }}>
            Beruecksichtigt Fischgroesse, Gewicht und Schonzeiten.
          </p>
        </div>
      )}
    </div>
  );
}
