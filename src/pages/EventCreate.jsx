import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "@/api/auth";
import { api } from "@/api/frontendClient";
import { toast } from "sonner";
import PageTitle from "@/components/layout/PageTitle";

export default function EventCreate() {
  const navigate = useNavigate();
  // ?club=<id>: Veranstaltung für einen Verein (nur Vereinsverwalter, prüft der Server).
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get("club");
  const [currentUser, setCurrentUser] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    template_id: "",
    duration_days: 14,
    target_species: "",
    prize_description: "",
    requires_approval: false,
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await auth.me().catch(() => null);
        if (!user) {
          navigate("/");
          return;
        }
        setCurrentUser(user);

        const tpl = await api.get("/api/events/templates");
        setTemplates(Array.isArray(tpl) ? tpl : []);
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      template_id: template.template_id,
      duration_days: template.duration_days || 14,
      target_species: template.target_species || "",
      prize_description: "",
      requires_approval: false,
    });
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Bitte Event-Namen eingeben");
      return;
    }

    setCreating(true);
    try {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + formData.duration_days);

      const response = await api.post("/api/events", {
        name: formData.name,
        description: formData.description,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        template_id: formData.template_id || null,
        target_species: formData.target_species.trim() || null,
        prize_description: formData.prize_description.trim() || null,
        requires_approval: formData.requires_approval,
        ...(clubId ? { club_id: clubId } : {}),
      });

      if (response && response.id) {
        navigate(`/events/${response.id}`);
      } else {
        toast.success("Event erfolgreich erstellt!");
        navigate("/events");
      }
    } catch (err) {
      console.error("Error creating event:", err);
      toast.error(`Fehler beim Erstellen: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 text-sm">Daten werden geladen...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen px-4 py-4 max-w-3xl mx-auto pb-32">
      <div className="space-y-8">
        {/* Header */}
        <PageTitle title="Neues Event erstellen" subtitle={clubId ? "Vereinsveranstaltung – erscheint im Vereinsprofil." : "Starte einen Wettbewerb und lade andere Angler ein."} />

        {/* Template Selection */}
        {!selectedTemplate && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Vorlagen auswählen</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {templates.map((template) => (
                <button type="button"
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className="p-4 bg-gray-900/50 border border-cyan-500/20 rounded-lg hover:border-cyan-500/40 transition text-left"
                >
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-2">
                    <span className="text-xs font-bold text-cyan-400">V</span>
                  </div>
                  <h3 className="font-semibold text-white">{template.name}</h3>
                  <p className="text-xs text-gray-400 mt-1">{template.description}</p>
                  <div className="text-xs text-cyan-400 mt-2">
                    {template.duration_days} Tage
                  </div>
                </button>
              ))}

              {/* Custom Option */}
              <button type="button"
                onClick={() => setSelectedTemplate({ id: "custom" })}
                className="p-4 bg-gray-900/50 border border-cyan-500/20 rounded-lg hover:border-cyan-500/40 transition text-left"
              >
                <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center mb-2">
                  <span className="text-xs font-bold text-blue-400">+</span>
                </div>
                <h3 className="font-semibold text-white">Benutzerdefiniert</h3>
                <p className="text-xs text-gray-400 mt-1">Ganz individuell konfigurieren</p>
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {selectedTemplate && (
          <form onSubmit={handleCreateEvent} className="space-y-6">
            {/* Back Button */}
            <button
              type="button"
              onClick={() => {
                setSelectedTemplate(null);
                setFormData({ name: "", description: "", template_id: "", duration_days: 14, target_species: "", prize_description: "", requires_approval: false });
              }}
              className="text-cyan-400 hover:text-cyan-300 text-sm font-semibold"
            >
              Zurück zu Vorlagen
            </button>

            {/* Template Info */}
            {selectedTemplate.id !== "custom" && (
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <p className="text-sm text-gray-300">
                  <span className="font-semibold">Gewählte Vorlage:</span> {selectedTemplate.name}
                </p>
              </div>
            )}

            {/* Event Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Veranstaltungsname
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Hecht-Meisterschaft 2026"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Beschreibung (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Erzählen Sie mehr über die Veranstaltung..."
                rows="4"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Dauer (Tage)
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={formData.duration_days}
                onChange={(e) => setFormData({ ...formData, duration_days: parseInt(e.target.value) })}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none transition"
              />
              <p className="text-xs text-gray-500 mt-1">Endet am: {new Date(Date.now() + formData.duration_days * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE')}</p>
            </div>

            {/* Wettbewerbsregeln */}
            <div>
              <label htmlFor="event-target-species" className="block text-sm font-semibold text-gray-300 mb-2">
                Zielarten (optional)
              </label>
              <input
                id="event-target-species"
                type="text"
                value={formData.target_species}
                onChange={(e) => setFormData({ ...formData, target_species: e.target.value })}
                placeholder="z.B. Zander, Hecht, Barsch"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
              />
              <p className="text-xs text-gray-500 mt-1">Leer lassen, um jede Fischart zu werten.</p>
            </div>

            <div>
              <label htmlFor="event-prize" className="block text-sm font-semibold text-gray-300 mb-2">
                Preise (optional)
              </label>
              <input
                id="event-prize"
                type="text"
                value={formData.prize_description}
                onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                placeholder="z.B. 1. Platz: Rute"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:border-cyan-500 focus:outline-none transition"
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={formData.requires_approval}
                onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                className="mt-1 h-5 w-5 accent-cyan-400"
              />
              <span>
                <span className="font-semibold">Jeden Fang vor der Wertung prüfen</span>
                <span className="block text-xs text-gray-500">Eingereichte Fänge zählen erst, wenn du sie freigibst. Ab dem Start sind die Regeln fixiert.</span>
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={creating}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg transition"
            >
              {creating ? "Wird erstellt..." : "Veranstaltung erstellen"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
