import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { integrations, events } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { useEventActivityTracking } from "@/hooks/useEventActivityTracking";
import PremiumGuard from "@/components/premium/PremiumGuard";
import { Input } from "@/components/ui/input";
import { MobileSelect } from "@/components/ui/mobile-select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOptimisticMutation } from "@/lib/useOptimisticMutation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  Loader2,
  Sparkles,
  Save,
  Trash2,
  Heart,
  BookOpen,
  Download,
  Rotate3d,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useHaptic } from "@/components/utils/HapticFeedback";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PrognosePanel from "@/components/baitmixer/PrognosePanel";
import RecipeBuilder from "@/components/baitmixer/RecipeBuilder";
import QuickStartGrid from "@/components/baitmixer/QuickStartGrid";
import { calculateSuccessRate } from "@/utils/baitPrognosis.utils";
import TabBar from "@/components/layout/TabBar";

const baitTabs = [
  { id: "quickstart", label: "Schnellstart" },
  { id: "builder", label: "Rezept-Editor" },
  { id: "saved", label: "Meine Rezepte" }
];

export default function BaitMixerPro() {
  useFeatureTracking("bait_recipe");
  const { trackBaitMixer } = useEventActivityTracking();
  const queryClient = useQueryClient();
  const { triggerHaptic } = useHaptic();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("quickstart");
  const [ingredients, setIngredients] = useState([]);
  const [mode, setMode] = useState("boilies");
  const [mix, setMix] = useState({});
  const [targetFish, setTargetFish] = useState("Karpfen");
  const [recipeName, setRecipeName] = useState("");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [activeEventId, setActiveEventId] = useState(null);

  const [waterTemp, setWaterTemp] = useState(15);
  const [season, setSeason] = useState("allround");
  const [waterType, setWaterType] = useState("lake");
  const [prognosis, setPrognosis] = useState(null);

  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem("baitMixerFavorites");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const loadActiveEvent = async () => {
      try {
        const event = await events.getActiveEvent();
        if (event?.active_event?.id) {
          setActiveEventId(event.active_event.id);
        }
      } catch {
        // Event loading non-critical
      }
    };
    loadActiveEvent();
  }, []);

  useEffect(() => {
    loadIngredients();
  }, [mode]);

  useEffect(() => {
    if (ingredients.length > 0) {
      const prog = calculateSuccessRate(
        mix,
        ingredients,
        targetFish,
        waterTemp,
        season,
        waterType
      );
      setPrognosis(prog);
    }
  }, [mix, ingredients, targetFish, waterTemp, season, waterType]);

  const loadData = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
      await loadRecipes();
    } catch (error) {
      console.error("Failed to load user:", error);
    }
    setLoading(false);
  };

  const loadIngredients = async () => {
    try {
      const allIngredients = await entities.BaitIngredient.list();
      const filtered = allIngredients.filter(
        ing => ing.category === mode || ing.category === "both"
      );
      setIngredients(filtered);

      const initialMix = {};
      filtered.forEach(ing => {
        initialMix[ing.name] = 0;
      });
      setMix(initialMix);
      setAiAnalysis("");
      setRecipeName("");
    } catch (error) {
      console.error("Failed to load ingredients:", error);
      toast.error("Fehler beim Laden der Zutaten");
    }
  };

  const loadRecipes = () =>
    queryClient.invalidateQueries({ queryKey: ["baitRecipes"] });

  const handleAddIngredient = (ingredient, amount = 5) => {
    triggerHaptic("selection");
    setMix(prev => {
      const currentVal = prev[ingredient.name] || 0;
      const newVal = Math.min(
        Math.max(0, currentVal + amount),
        ingredient.max_percentage
      );
      return { ...prev, [ingredient.name]: newVal };
    });
  };

  const handleRemoveIngredient = ingredientName => {
    triggerHaptic("light");
    setMix(prev => ({ ...prev, [ingredientName]: 0 }));
  };

  const handleUpdatePercentage = (ingredientName, value) => {
    setMix(prev => ({ ...prev, [ingredientName]: value }));
  };

  const handleLoadRecipe = recipe => {
    setMode(recipe.category);
    setTargetFish(recipe.fish);
    setMix(recipe.ingredients || {});
    setRecipeName(recipe.name);
    setAiAnalysis(recipe.ai_analysis || "");
    setActiveTab("builder");
    triggerHaptic("selection");
    toast.success(`Rezept "${recipe.name}" geladen`);
  };

  const generateAIRecipe = async () => {
    try {
      setAiAnalyzing(true);
      triggerHaptic("medium");
      toast.info("KI-Buddy analysiert...");

      const totalPercentage = Object.values(mix).reduce((sum, val) => sum + val, 0);
      const currentMixForPrompt = Object.entries(mix)
        .filter(([_, val]) => val > 0)
        .map(([name, val]) => `- ${name}: ${val}%`)
        .join("\n");

      const prompt = `Du bist ein erfahrener Angel-Experte mit Spezialwissen über Köder-Herstellung.

**Auftrag:** Optimiere dieses ${mode === "boilies" ? "Boilie" : "Anfütterungs"}-Rezept für ${targetFish} bei ${waterTemp}°C und ${season} Bedingungen.

**Aktuelle Mischung:**
${currentMixForPrompt.length > 0 ? currentMixForPrompt : "Keine Zutaten hinzugefügt."}
**Gesamt:** ${totalPercentage}%

**Verfügbare Zutaten:**
${ingredients.map(ing => `- ${ing.name} (Max: ${ing.max_percentage}%, ${targetFish}-Attraktion: ${ing.fish_attractiveness?.[targetFish] || 0}/10)`).join("\n")}

**Aktuelle KI-Prognose:** Success-Rate ${prognosis?.successRate || 0}%

**Bitte optimiere:**
1. **Was ist gut?** Stärken des aktuellen Rezepts
2. **Was optimieren?** Schwächen und Verbesserungen
3. **Neues Rezept:** Konkrete neue Mischung (muss 100% ergeben!)
4. **Tipps:** Einsatz und Lagern

Sei konkret und praktisch!`;

      const response = await integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      const analysis = response || "Keine Analyse verfügbar";
      setAiAnalysis(analysis);
      toast.success("KI-Analyse abgeschlossen!");
    } catch (error) {
      console.error("AI analysis failed:", error);
      toast.error("KI-Analyse fehlgeschlagen");
    } finally {
      setAiAnalyzing(false);
    }
  };

  const { data: recipes = [] } = useQuery({
    queryKey: ["baitRecipes"],
    queryFn: () => entities.BaitRecipe.list("-created_date")
  });

  const saveRecipeMutation = useOptimisticMutation({
    queryKey: "baitRecipes",
    mutationFn: data => entities.BaitRecipe.create(data),
    optimisticUpdate: (old = [], data) => [
      { id: `tmp-${Date.now()}`, ...data, isFavorite: false },
      ...old
    ],
    onSuccess: (_, _data) => {
      triggerHaptic("success");
      toast.success("Rezept gespeichert!");
      setRecipeName("");
      setAiAnalysis("");
    },
    onError: () => toast.error("Fehler beim Speichern des Rezepts")
  });

  const deleteRecipeMutation = useOptimisticMutation({
    queryKey: "baitRecipes",
    mutationFn: id => entities.BaitRecipe.delete(id),
    optimisticUpdate: (old = [], id) => old.filter(r => r.id !== id),
    onSuccess: () => {
      triggerHaptic("warning");
      toast.success("Rezept gelöscht!");
    },
    onError: () => toast.error("Fehler beim Löschen des Rezepts")
  });

  const resetMix = () => {
    setMix(Object.keys(mix).reduce((acc, key) => ({ ...acc, [key]: 0 }), {}));
    setRecipeName("");
    setAiAnalysis("");
    triggerHaptic("light");
  };

  const toggleFavorite = (recipeId) => {
    const updated = favorites.includes(recipeId)
      ? favorites.filter(id => id !== recipeId)
      : [...favorites, recipeId];
    setFavorites(updated);
    localStorage.setItem("baitMixerFavorites", JSON.stringify(updated));
    triggerHaptic("light");
  };

  const exportRecipe = () => {
    const totalPercentage = Object.values(mix).reduce((sum, val) => sum + val, 0);
    const exportData = {
      name: recipeName || "Rezept",
      fish: targetFish,
      category: mode,
      season,
      waterTemp,
      ingredients: Object.entries(mix)
        .filter(([_, val]) => val > 0)
        .map(([name, val]) => `${name}: ${val}%`)
        .join("\n"),
      totalPercentage,
      successRate: prognosis?.successRate || 0,
      exportDate: new Date().toLocaleString("de-DE")
    };

    const text = `
KI-Köder-Mischer Pro Rezept-Export

Rezept: ${exportData.name}
Zielfisch: ${exportData.fish} | Typ: ${exportData.category}
Jahreszeit: ${exportData.season}
Wassertemperatur: ${exportData.waterTemp}°C
Success-Rate Prognose: ${exportData.successRate}%

ZUTATEN (Gesamtmix: ${exportData.totalPercentage}%)
${exportData.ingredients}

TIPPS ZUM AUSMISCHEN:
1. Wiege alle Zutaten sorgfältig ab
2. Mische Trockenzutaten zuerst
3. Füge Öle langsam hinzu
4. Knete die Masse gründlich durch
5. Lagere kühl und trocken

Exportiert: ${exportData.exportDate}
    `;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rezept-${recipeName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rezept exportiert!");
    triggerHaptic("success");
  };

  const saveRecipe = () => {
    if (!recipeName.trim()) {
      toast.error("Bitte gib einen Namen für das Rezept ein");
      return;
    }
    const totalPercentage = Object.values(mix).reduce((sum, val) => sum + val, 0);
    if (totalPercentage === 0) {
      toast.error("Füge mindestens eine Zutat hinzu");
      return;
    }
    const attractivenessScore = Math.round(prognosis?.successRate || 0);
    const estimatedCost = Object.entries(mix).reduce((sum, [ingName, percentage]) => {
      const ingredient = ingredients.find(i => i.name === ingName);
      return sum + ((ingredient?.cost_per_kg || 0) * percentage / 100);
    }, 0);
    if (activeEventId) {
      trackBaitMixer(activeEventId);
    }
    saveRecipeMutation.mutate({
      name: recipeName.trim(),
      category: mode,
      target_fish: targetFish,
      ingredients: mix,
      total_percentage: totalPercentage,
      attractiveness_score: attractivenessScore,
      estimated_cost: Math.round(estimatedCost * 100) / 100,
      ai_generated: !!aiAnalysis,
      ai_analysis: aiAnalysis || ""
    });
  };

  const totalPercentage = Object.values(mix).reduce((sum, val) => sum + val, 0);
  const _isValid = totalPercentage === 100;
  const activeIngredients = Object.entries(mix).filter(([_, val]) => val > 0);

  const pieData = activeIngredients.map(([name, value]) => ({
    name,
    value,
    percentage: value
  }));

  const COLORS = [
    "#0088FE", "#00C49F", "#FFBB28", "#FF8042",
    "#8884D8", "#82CA9D", "#FFC658", "#FF6B9D"
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bb-cyan)' }} />
      </div>
    );
  }

  return (
    <PremiumGuard user={user} requiredPlan="basic" feature="KI-Köder-Mischer">
      <div className="bb-page">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles size={28} style={{ color: 'var(--bb-cyan)' }} />
            <h1 className="text-2xl font-bold text-white">
              KI-Köder-Mischer Pro
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
            Erstelle optimierte Boilies & Anfütterung mit KI-Prognose
          </p>
          <p className="text-xs mt-1" style={{ color: '#34d399' }}>
            48 vordefinierte Premium-Rezepte
          </p>
        </div>

        {/* 3D-Köderanimation Link */}
        <Link
          to={createPageUrl("Koeder3D")}
          className="bb-card flex items-center gap-3"
          style={{ textDecoration: 'none', borderColor: 'rgba(0,229,255,.2)' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,229,255,.1)' }}>
            <Rotate3d size={20} style={{ color: 'var(--bb-cyan)' }} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white text-sm">Köderführung in 3D ansehen</div>
            <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>
              Wobbler, Gummifisch, Spinner, Blinker und Oberflächenköder
            </div>
          </div>
          <ChevronRight size={18} style={{ color: 'var(--bb-muted)' }} />
        </Link>

        {/* Tabs */}
        <TabBar tabs={baitTabs} activeTab={activeTab} onChange={(id) => { setActiveTab(id); triggerHaptic("light"); }} />

        {/* QUICKSTART TAB */}
        {activeTab === "quickstart" && (
          <QuickStartGrid
            ingredients={ingredients}
            onLoadRecipe={handleLoadRecipe}
            waterTemp={waterTemp}
            season={season}
            waterType={waterType}
          />
        )}

        {/* BUILDER TAB */}
        {activeTab === "builder" && (
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 grid gap-5">
              {/* Modus & Zielfisch */}
              <div className="bb-card grid gap-4">
                <div className="bb-form-title">Modus & Zielfisch</div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--bb-muted)' }}>
                    Köder-Typ
                  </label>
                  <MobileSelect
                    value={mode}
                    onValueChange={setMode}
                    options={[
                      { value: "boilies", label: "Boilies" },
                      { value: "bait", label: "Anfütterung" }
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--bb-muted)' }}>
                    Zielfisch
                  </label>
                  <MobileSelect
                    value={targetFish}
                    onValueChange={setTargetFish}
                    options={[
                      "Karpfen", "Brassen", "Rotauge", "Hecht",
                      "Zander", "Barsch", "Forelle", "Aal"
                    ].map(fish => ({ value: fish, label: fish }))}
                  />
                </div>
              </div>

              {/* Rezept-Editor */}
              <RecipeBuilder
                ingredients={ingredients}
                mix={mix}
                onAddIngredient={handleAddIngredient}
                onRemoveIngredient={handleRemoveIngredient}
                onUpdatePercentage={handleUpdatePercentage}
                totalPercentage={totalPercentage}
                targetFish={targetFish}
              />

              {/* KI-Optimierung */}
              {activeIngredients.length > 0 && (
                <div className="bb-card grid gap-4">
                  <div className="bb-form-title flex items-center gap-2">
                    <Sparkles size={18} />
                    KI-Optimierung
                  </div>
                  <button
                    onClick={generateAIRecipe}
                    disabled={aiAnalyzing}
                    className="bb-action w-full flex items-center justify-center gap-2"
                  >
                    {aiAnalyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        KI analysiert...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Rezept optimieren
                      </>
                    )}
                  </button>

                  {aiAnalysis && (
                    <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(0,229,255,.06), rgba(139,92,246,.06))', border: '1px solid rgba(0,229,255,.2)' }}>
                      <div className="flex items-start gap-2">
                        <Sparkles size={18} style={{ color: 'var(--bb-cyan)', flexShrink: 0, marginTop: 2 }} />
                        <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--bb-text-secondary)' }}>
                          {aiAnalysis}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Rezept speichern */}
              {activeIngredients.length > 0 && (
                <div className="bb-card grid gap-4">
                  <div className="bb-form-title">Rezept speichern</div>
                  <Input
                    placeholder="Rezeptname (z.B. Karpfen-Mix Sommer)"
                    value={recipeName}
                    onChange={e => setRecipeName(e.target.value)}
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={saveRecipe}
                      disabled={!recipeName.trim()}
                      className="bb-action flex-1 flex items-center justify-center gap-2"
                    >
                      <Save size={16} />
                      Speichern
                    </button>
                    <button
                      onClick={exportRecipe}
                      disabled={!recipeName.trim() || totalPercentage === 0}
                      className="bb-secondary flex items-center justify-center gap-2"
                    >
                      <Download size={16} />
                      Export
                    </button>
                    <button
                      onClick={resetMix}
                      className="bb-secondary flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rechte Seite: Prognose + Visualisierungen */}
            <div className="grid gap-5">
              {activeIngredients.length > 0 && (
                <div className="bb-card">
                  <div className="text-sm font-semibold mb-3" style={{ color: 'var(--bb-cyan)' }}>
                    Mischungsverhältnis
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={entry => `${entry.name}: ${entry.value}%`}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Prognose-Panel */}
              <PrognosePanel
                prognosis={prognosis}
                waterTemp={waterTemp}
                onWaterTempChange={setWaterTemp}
                season={season}
                onSeasonChange={setSeason}
                waterType={waterType}
                onWaterTypeChange={setWaterType}
              />
            </div>
          </div>
        )}

        {/* SAVED RECIPES TAB */}
        {activeTab === "saved" && (
          <div className="bb-card">
            <div className="bb-form-title flex items-center gap-2 mb-4">
              <BookOpen size={18} />
              Meine Rezepte
            </div>
            {recipes.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--bb-surface)' }}>
                  <Heart size={24} style={{ color: 'var(--bb-muted)' }} />
                </div>
                <div style={{ color: 'var(--bb-muted)' }}>Noch keine Rezepte gespeichert</div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map(recipe => {
                  const isFav = favorites.includes(recipe.id);
                  return (
                    <div
                      key={recipe.id}
                      className="bb-card cursor-pointer group"
                      onClick={() => handleLoadRecipe(recipe)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1">
                          <h3 className="text-white font-semibold text-sm group-hover:text-cyan-400 transition-colors">
                            {recipe.name}
                          </h3>
                          <p className="text-xs mt-1" style={{ color: 'var(--bb-muted)' }}>
                            {recipe.target_fish} / {recipe.category}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-1.5 rounded-lg"
                            style={{ color: isFav ? '#f87171' : 'var(--bb-muted)' }}
                            onClick={e => {
                              e.stopPropagation();
                              toggleFavorite(recipe.id);
                            }}
                          >
                            <Heart size={14} className={isFav ? "fill-current" : ""} />
                          </button>
                          <button
                            className="p-1.5 rounded-lg"
                            style={{ color: 'var(--bb-muted)' }}
                            onClick={e => {
                              e.stopPropagation();
                              setMix(recipe.ingredients);
                              setRecipeName(recipe.name);
                              exportRecipe();
                            }}
                          >
                            <Download size={14} />
                          </button>
                          <button
                            className="p-1.5 rounded-lg"
                            style={{ color: '#f87171' }}
                            onClick={e => {
                              e.stopPropagation();
                              deleteRecipeMutation.mutate(recipe.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--bb-muted)' }}>
                        <span>Score: {recipe.attractiveness_score}</span>
                        {recipe.ai_generated && (
                          <Sparkles size={12} style={{ color: '#a78bfa' }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </PremiumGuard>
  );
}
