import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { integrations } from "@/api/frontendClient";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import PageTitle from "@/components/layout/PageTitle";
import { resolveLocalAnswer, getOfflineFallback } from "@/lib/buddyFaq";
import { SUPPORT_EMAIL } from "@/lib/supportContact";

export default function Help() {
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("frage");
  const [message, setMessage] = useState("");

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSource, setAiSource] = useState(null);
  const [tab, setTab] = useState("ticket");

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user?.email) {
      loadTickets();
    }
  }, [user]);

  const loadUser = async () => {
    try {
      const u = await auth.me();
      setUser(u);
    } catch (e) {
      console.error(e);
    }
  };

  const loadTickets = async () => {
    setLoadingTickets(true);
    try {
      if (user?.email) {
        const data = await entities.SupportTicket.filter({ user_email: user.email });
        setTickets(data?.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)) || []);
      }
    } catch (e) {
      console.error("Fehler beim Laden der Tickets:", e);
      toast.error("Tickets konnten nicht geladen werden");
    }
    setLoadingTickets(false);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Bitte Betreff und Nachricht ausfuellen");
      return;
    }
    setSubmitting(true);
    try {
      await entities.SupportTicket.create({
        subject: subject.trim(),
        category,
        message: message.trim(),
        user_email: user?.email || "",
        user_name: user?.full_name || user?.nickname || "",
        status: "offen"
      });
      toast.success("Ticket erfolgreich erstellt");
      setSubject("");
      setMessage("");
      setCategory("frage");
      await loadTickets();
    } catch (e) {
      console.error(e);
      toast.error("Ticket konnte nicht erstellt werden");
    }
    setSubmitting(false);
  };

  // KI-Hilfe: erst die lokale FAQ (sofort, ohne Tageslimit, auch offline),
  // dann die KI. Jeder Fehlschlag steht sichtbar unter dem Button — vorher gab
  // es nur einen kurzen Toast, und der Button wirkte, als reagiere er nicht
  // (z. B. bei erreichtem Tageslimit im Gratis-Tarif oder ohne Anmeldung).
  const handleAiAsk = async () => {
    const question = aiQuestion.trim();
    if (aiLoading) return;
    setAiAnswer("");
    setAiError("");
    setAiSource(null);
    if (!question) {
      setAiError("Bitte gib zuerst deine Frage ein.");
      return;
    }

    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    const local = resolveLocalAnswer(question, { online });
    if (local) {
      setAiAnswer(local.answer);
      setAiSource(local.mode);
      return;
    }
    if (!online) {
      setAiAnswer(getOfflineFallback());
      setAiSource("offline");
      return;
    }

    setAiLoading(true);
    try {
      const res = await integrations.Core.InvokeLLM({
        prompt: `Du bist der Support-Assistent fuer die Angel-App "BaitBuddy". Beantworte folgende Nutzerfrage hilfsbereit, kurz und auf Deutsch:\n\nFrage: ${question}`
      });
      const text = typeof res === "string" ? res.trim() : "";
      if (!text) throw new Error("Leere Antwort");
      setAiAnswer(text);
      setAiSource("ai");
    } catch (e) {
      console.error(e);
      const status = e?.status;
      setAiError(
        status === 401
          ? "Bitte melde dich an, um die KI-Hilfe zu nutzen."
          : status === 429
            ? (e?.data?.error || "Das Tageslimit für KI-Anfragen ist erreicht.")
            : (e?.data?.reply || e?.data?.error || "Die KI-Hilfe ist gerade nicht erreichbar.")
      );
      // Wenigstens die allgemeine Antwort aus dem eingebauten Wissen zeigen.
      const fallback = resolveLocalAnswer(question, { online: false });
      if (fallback) {
        setAiAnswer(fallback.answer);
        setAiSource("offline");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const askAsTicket = () => {
    setSubject(aiQuestion.trim().slice(0, 120));
    setMessage(aiQuestion.trim());
    setCategory("frage");
    setTab("ticket");
  };

  const statusColor = (s) => {
    switch (s) {
      case "offen": return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "in_bearbeitung": return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
      case "geloest": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
      case "geschlossen": return "bg-gray-500/20 text-gray-300 border-gray-500/40";
      default: return "bg-gray-500/20 text-gray-300 border-gray-500/40";
    }
  };

  return (
    <div className="bb-page pb-safe-fixed">
      <div className="max-w-4xl mx-auto space-y-6 w-full min-w-0">
        <PageTitle title="Hilfe & Support" subtitle="Wir helfen dir gerne weiter." />

        <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
          <TabsList className="flex w-full justify-start overflow-x-auto scrollbar-hide">
            <TabsTrigger value="ticket">Ticket erstellen</TabsTrigger>
            <TabsTrigger value="meine">Meine Tickets</TabsTrigger>
            <TabsTrigger value="ki">KI-Hilfe</TabsTrigger>
            <TabsTrigger value="bewertungen">Bewertungen</TabsTrigger>
          </TabsList>

          <TabsContent value="ticket" className="mt-4">
            <div className="bb-card">
              <div className="bb-form-title mb-4">Neues Support-Ticket</div>
              <div className="grid gap-4">
                <div>
                  <label className="text-sm text-gray-300 mb-1 block">Betreff</label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Kurze Zusammenfassung"
                    className="bg-gray-800/50 border-gray-700 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-300 mb-1 block">Kategorie</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-gray-800/50 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug / Fehler</SelectItem>
                      <SelectItem value="frage">Frage</SelectItem>
                      <SelectItem value="feedback">Feedback</SelectItem>
                      <SelectItem value="abrechnung">Abrechnung</SelectItem>
                      <SelectItem value="sonstiges">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-gray-300 mb-1 block">Nachricht</label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Beschreibe dein Anliegen so genau wie moeglich"
                    className="bg-gray-800/50 border-gray-700 text-white min-h-[140px]"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bb-action w-full"
                  style={{ background: '#059669' }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    "Ticket absenden"
                  )}
                </button>
                <p className="text-xs text-center" style={{ color: 'var(--bb-muted)' }}>
                  Oder direkt per E-Mail: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline" style={{ color: 'var(--bb-cyan)' }}>{SUPPORT_EMAIL}</a>
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="meine" className="mt-4">
            <div className="bb-card">
              <div className="bb-form-title mb-4">Meine Tickets</div>
              <div>
                {loadingTickets ? (
                  <div className="flex items-center justify-center py-8" style={{ color: 'var(--bb-cyan)' }}>
                    <Loader2 size={20} className="animate-spin mr-2" />
                    Lade Tickets...
                  </div>
                ) : tickets.length === 0 ? (
                  <p className="text-center py-8" style={{ color: 'var(--bb-muted)' }}>Noch keine Tickets vorhanden</p>
                ) : (
                  <div className="space-y-3">
                    {tickets.map((t) => (
                      <div key={t.id} className="p-4 rounded-lg" style={{ background: 'rgba(0,0,0,.25)', border: '1px solid var(--bb-border)' }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-white">{t.subject}</h3>
                          <span className={`bb-pill-info ${statusColor(t.status)}`}>{t.status}</span>
                        </div>
                        <p className="text-xs mb-2" style={{ color: 'var(--bb-muted)' }}>
                          {new Date(t.created_date).toLocaleString("de-DE")} - {t.category}
                        </p>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{t.message}</p>
                        {t.admin_response && (
                          <div className="mt-3 p-3 bg-emerald-900/20 border border-emerald-700/40 rounded">
                            <p className="text-xs text-emerald-400 font-semibold mb-1">Antwort vom Support</p>
                            <p className="text-sm text-gray-200 whitespace-pre-wrap">{t.admin_response}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ki" className="mt-4">
            <div className="bb-card">
              <div className="bb-form-title mb-4">KI-Soforthilfe</div>
              <div className="grid gap-4">
                <Textarea
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Stelle deine Frage zur App..."
                  className="bg-gray-800/50 border-gray-700 text-white min-h-[100px]"
                />
                <button
                  type="button"
                  onClick={handleAiAsk}
                  disabled={aiLoading}
                  className="bb-action w-full"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Frage wird beantwortet...
                    </>
                  ) : (
                    "Frage stellen"
                  )}
                </button>

                <div role="status" aria-live="polite" className="grid gap-3">
                  {aiError && (
                    <div className="p-3 rounded-lg border border-amber-600/50 bg-amber-900/20">
                      <p className="text-sm text-amber-200">{aiError}</p>
                    </div>
                  )}
                  {aiAnswer && (
                    <div className="p-4 bg-cyan-900/20 border border-cyan-700/40 rounded-lg">
                      <p className="text-xs text-cyan-400 font-semibold mb-2">
                        {aiSource === "ai" ? "Antwort der KI" : aiSource === "offline" ? "Allgemeine Antwort aus dem Buddy-Wissen" : "Sofort-Antwort aus dem Buddy-Wissen"}
                      </p>
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{aiAnswer}</p>
                    </div>
                  )}
                  {(aiAnswer || aiError) && aiQuestion.trim() && (
                    <button type="button" onClick={askAsTicket} className="bb-secondary w-full justify-center">
                      Hat nicht geholfen? Als Ticket an den Support senden
                    </button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bewertungen" className="mt-4">
            <div className="bb-card">
              <div className="bb-form-title mb-4">Funktionsbewertungen</div>
              <div>
                <p className="text-gray-300 mb-4">
                  Sieh dir an, wie andere Nutzer die Funktionen der App bewerten oder gib selbst eine Bewertung ab.
                </p>
                <button
                  onClick={() => window.location.href = "/FunctionRatings"}
                  className="bb-action w-full"
                  style={{ background: '#d97706' }}
                >
                  Zu den Funktionsbewertungen
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}