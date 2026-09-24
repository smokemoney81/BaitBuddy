import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { events } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { notifyAction, actionMessages } from '@/lib/actionNotifications';
import {
  Trophy,
  Users,
  Zap,
  Plus,
  Clock,
  Target,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X
} from 'lucide-react';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import TabBar from '@/components/layout/TabBar';
import PageTitle from "@/components/layout/PageTitle";

const filterTabs = [
  { id: 'all', label: 'Alle' },
  { id: 'ongoing', label: 'Laufend' },
  { id: 'custom', label: 'Eigene' },
];

export default function EventCatalog() {
  useFeatureTracking('events');
  const [templates, setTemplates] = useState([]);
  const [activeEvents, setActiveEvents] = useState([]);
  const [_currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customEventData, setCustomEventData] = useState({
    name: '',
    description: '',
    target_species: '',
    duration_days: 14
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, templates, activeEvents] = await Promise.all([
        auth.me(),
        events.templates(),
        events.list()
      ]);
      setCurrentUser(user);
      setTemplates(templates);
      setActiveEvents(activeEvents);
    } catch (error) {
      console.error('Fehler beim Laden von Events:', error);
      toast.error('Fehler beim Laden der Events');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTemplate = async (templateId) => {
    try {
      await events.startCompetition(templateId);
      toast.success('Wettbewerb erfolgreich gestartet!');
      await loadData();
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (error) {
      console.error('Fehler beim Starten des Wettbewerbs:', error);
      toast.error('Fehler beim Starten des Wettbewerbs');
    }
  };

  const handleCreateCustomEvent = async () => {
    if (!customEventData.name || !customEventData.duration_days) {
      toast.error('Name und Dauer erforderlich');
      return;
    }

    try {
      setCreatingEvent(true);
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + parseInt(customEventData.duration_days));

      await events.create({
        name: customEventData.name,
        description: customEventData.description,
        target_species: customEventData.target_species || null,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        event_type: 'custom',
        scoring_method: 'points'
      });

      toast.success('Event erfolgreich erstellt!');
      const msg = actionMessages.eventCreated(customEventData.name);
      notifyAction(msg.title, msg);
      setShowCreateForm(false);
      setCustomEventData({ name: '', description: '', target_species: '', duration_days: 14 });
      await loadData();
      queryClient.invalidateQueries({ queryKey: ['events'] });
    } catch (error) {
      console.error('Fehler beim Erstellen des Events:', error);
      toast.error('Fehler beim Erstellen des Events');
    } finally {
      setCreatingEvent(false);
    }
  };

  const getEventStatus = (event) => {
    const now = new Date();
    const endDate = new Date(event.end_date);
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    return daysLeft > 0 ? `${daysLeft} Tage verbleibend` : 'Beendet';
  };

  const categoryEvents = {
    all: activeEvents,
    ongoing: activeEvents.filter(e => new Date(e.end_date) > new Date() && e.status === 'active'),
    upcoming: activeEvents.filter(e => new Date(e.start_date) > new Date()),
    custom: activeEvents.filter(e => e.event_type === 'custom')
  };

  const displayedEvents = categoryEvents[filter] || activeEvents;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bb-cyan)' }} />
      </div>
    );
  }

  if (showCreateForm) {
    return (
      <div className="bb-page">
        <div className="flex items-center justify-between">
          <PageTitle className="flex-1 min-w-0" title="Neues Event erstellen" />
          <button
            onClick={() => setShowCreateForm(false)}
            className="p-2 rounded-lg"
            style={{ color: 'var(--bb-muted)' }}
          >
            <X size={22} />
          </button>
        </div>

        <div className="bb-card grid gap-5">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--bb-muted)' }}>
              Event-Name
            </label>
            <Input
              placeholder="z.B. Mein Sommer-Hecht-Turnier"
              value={customEventData.name}
              onChange={(e) => setCustomEventData({ ...customEventData, name: e.target.value })}
              className="bg-gray-900 border-gray-700 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--bb-muted)' }}>
              Beschreibung
            </label>
            <Textarea
              placeholder="Beschreibe dein Event..."
              value={customEventData.description}
              onChange={(e) => setCustomEventData({ ...customEventData, description: e.target.value })}
              className="bg-gray-900 border-gray-700 text-white"
              rows="4"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--bb-muted)' }}>
              Zielfisch (optional)
            </label>
            <Input
              placeholder="z.B. Hecht"
              value={customEventData.target_species}
              onChange={(e) => setCustomEventData({ ...customEventData, target_species: e.target.value })}
              className="bg-gray-900 border-gray-700 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--bb-muted)' }}>
              Dauer (Tage)
            </label>
            <Input
              type="number"
              min="1"
              max="30"
              value={customEventData.duration_days}
              onChange={(e) => setCustomEventData({ ...customEventData, duration_days: e.target.value })}
              className="bg-gray-900 border-gray-700 text-white"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreateCustomEvent}
              disabled={creatingEvent}
              className="bb-action flex-1 flex items-center justify-center gap-2"
            >
              {creatingEvent ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                'Event erstellen'
              )}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="bb-secondary flex-1"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle className="flex-1 min-w-[220px]" title="Events & Wettbewerbe" subtitle="Tritt bestehenden Events bei oder starte deinen eigenen Wettbewerb." />
        <button
          onClick={() => setShowCreateForm(true)}
          className="bb-action flex items-center gap-2"
        >
          <Plus size={16} />
          Neues Event
        </button>
      </div>

      {/* Filter Tabs */}
      <TabBar tabs={filterTabs} activeTab={filter} onChange={setFilter} />

      {/* Events Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {displayedEvents.length > 0 ? (
          displayedEvents.map((event) => (
            <div
              key={event.id}
              className="bb-card cursor-pointer"
              style={{ padding: 0 }}
              onClick={() => window.location.href = `/events/${event.id}`}
            >
              <div className="p-4 flex items-start justify-between" style={{ borderBottom: '1px solid var(--bb-border)' }}>
                <div className="flex-1">
                  <div className="font-bold text-white mb-1">{event.name}</div>
                  <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                    {event.event_type === 'custom' ? 'Benutzerveranstaltet' : 'Template'}
                  </p>
                </div>
                {new Date(event.end_date) > new Date() && event.status === 'active' && (
                  <CheckCircle2 size={18} style={{ color: '#34d399' }} />
                )}
              </div>
              <div className="p-4 grid gap-3">
                {event.description && (
                  <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>{event.description}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {event.target_species && (
                    <span className="bb-pill-info text-xs flex items-center gap-1">
                      <Target size={12} />
                      {event.target_species}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-lg text-xs flex items-center gap-1" style={{ background: 'rgba(255,255,255,.06)', color: 'var(--bb-muted)' }}>
                    <Clock size={12} />
                    {getEventStatus(event)}
                  </span>
                </div>

                <div className="flex items-center gap-4 pt-3 text-sm" style={{ borderTop: '1px solid var(--bb-border)', color: 'var(--bb-muted)' }}>
                  <div className="flex items-center gap-1">
                    <Users size={14} />
                    <span>Teilnehmer</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap size={14} />
                    <span>{event.base_points || 100} Punkte</span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartTemplate(event.template_id || event.id);
                  }}
                  className="bb-action w-full"
                >
                  Beitreten / Starten
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bb-surface)' }}>
              <AlertCircle size={28} style={{ color: 'var(--bb-muted)' }} />
            </div>
            <p className="text-lg" style={{ color: 'var(--bb-muted)' }}>Keine Events gefunden</p>
            <p className="text-sm mt-1" style={{ color: 'var(--bb-muted)', opacity: 0.7 }}>Erstelle ein neues Event oder warte auf neue Templates</p>
          </div>
        )}
      </div>

      {/* Event Templates Section */}
      {templates.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Trophy size={20} style={{ color: '#fbbf24' }} />
            Verfügbare Wettbewerbs-Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {templates.map((template) => (
              <div
                key={template.template_id}
                className="bb-card"
                style={{ borderColor: 'rgba(96,165,250,.2)' }}
              >
                <div className="font-bold mb-2" style={{ color: '#60a5fa' }}>
                  {template.name}
                </div>
                <p className="text-sm mb-3" style={{ color: 'var(--bb-muted)' }}>{template.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,.06)', color: 'var(--bb-muted)' }}>
                    {template.duration_days} Tage
                  </span>
                  <span className="px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,.06)', color: 'var(--bb-muted)' }}>
                    {template.base_points} Basispunkte
                  </span>
                </div>
                <button
                  onClick={() => handleStartTemplate(template.template_id)}
                  className="bb-action w-full flex items-center justify-center gap-2"
                >
                  <Zap size={16} />
                  Starten / Beitreten
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
