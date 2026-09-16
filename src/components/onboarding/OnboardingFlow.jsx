import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, MapPin, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import {
  BUDDIES,
  FISHING_SPECIES_OPTIONS,
  FISHING_METHOD_OPTIONS,
  FISHING_WATER_TYPE_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  NAVIGATION_OPTIONS,
} from '@/lib/buddyPreferences';
import { FEDERAL_STATES } from '@/components/rules/rule-utils';
import { ensurePermission, getPermissionState } from '@/lib/actionNotifications';
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  shouldShowOnboarding,
  advance,
  goBack,
  skipOnboarding,
  progressPercent,
  stepAt,
} from '@/lib/onboarding';

const NAVIGATION_LABELS = {
  Dashboard: 'Übersicht',
  Map: 'Karte & Gewässer',
  KiBuddyBeta: 'KI-Buddy',
  Weather: 'Wetter & Prognosen',
  Logbook: 'Fangbuch',
  TripPlanner: 'Trips & Planung',
  Community: 'Community',
  Gear: 'Ausrüstung',
  Profile: 'Profil',
  PremiumPlans: 'Premium',
};

const TONE_OPTIONS = [
  { id: 'friendly', label: 'Freundlich', description: 'Aufmerksam und verständlich.' },
  { id: 'direct', label: 'Direkt', description: 'Kurz und konkret, ohne Umschweife.' },
  { id: 'casual', label: 'Locker', description: 'Wie ein Angelkollege am Wasser.' },
  { id: 'professional', label: 'Professionell', description: 'Sachlich und klar strukturiert.' },
  { id: 'motivating', label: 'Motivierend', description: 'Ermutigend und praxisnah.' },
];

function toggleInList(list, value, max) {
  if (list.includes(value)) return list.filter((item) => item !== value);
  if (max && list.length >= max) return list;
  return [...list, value];
}

function ChoiceChip({ selected, onClick, children, disabled }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 rounded-2xl text-sm transition-colors duration-200 border ${
        selected
          ? 'bg-cyan-400/15 border-cyan-300 text-cyan-100'
          : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
      } disabled:opacity-40`}
    >
      <span className="flex items-center gap-1.5">
        {selected && <Check size={14} aria-hidden="true" />}
        {children}
      </span>
    </button>
  );
}

function ChipGroup({ label, options, selected, onToggle, max }) {
  return (
    <fieldset className="space-y-3">
      <legend className="bb-muted text-sm">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <ChoiceChip
            key={option}
            selected={selected.includes(option)}
            disabled={!selected.includes(option) && max != null && selected.length >= max}
            onClick={() => onToggle(option)}
          >
            {option}
          </ChoiceChip>
        ))}
      </div>
    </fieldset>
  );
}

function OptionCards({ options, value, onSelect }) {
  return (
    <div className="grid gap-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onSelect(option.id)}
          className={`text-left p-3 rounded-2xl border transition-colors duration-200 ${
            value === option.id
              ? 'bg-cyan-400/15 border-cyan-300'
              : 'bg-white/5 border-white/10 hover:bg-white/10'
          }`}
        >
          <span className="font-semibold flex items-center gap-2">
            {option.label}
            {value === option.id && <Check size={16} className="text-cyan-300" aria-hidden="true" />}
          </span>
          <span className="text-xs text-slate-300 block mt-1">{option.description}</span>
        </button>
      ))}
    </div>
  );
}

export default function OnboardingFlow() {
  const {
    buddy, fishing, angler, navigation, onboarding, canSave, saving,
    saveBuddy, saveFishing, saveAngler, saveNavigation, saveOnboarding,
  } = useBuddyPreferences();

  // Der Entwurf sammelt die Eingaben im Lauf. Gespeichert wird beim Weitergehen
  // pro Bereich — bricht der Nutzer ab, ist alles bis dahin Erfasste bereits im
  // Konto und beim Fortsetzen wieder da.
  const [draft, setDraft] = useState(null);
  const [permissions, setPermissions] = useState({ notifications: null, location: null });
  const [busy, setBusy] = useState(false);

  const open = shouldShowOnboarding(onboarding, { canSave });

  useEffect(() => {
    if (!open || draft) return;
    setDraft({ buddy, fishing, angler, navigation });
  }, [open, draft, buddy, fishing, angler, navigation]);

  const stepIndex = onboarding.stepIndex;
  const step = stepAt(stepIndex);
  const percent = progressPercent(onboarding);

  const setDraftSection = useCallback((section, value) => {
    setDraft((previous) => ({ ...previous, [section]: value }));
  }, []);

  // Beim Weitergehen wird nur der Bereich des aktuellen Schritts geschrieben —
  // ein Schritt kann damit nie die Eingabe eines anderen überschreiben.
  const persistStep = useCallback(async (current) => {
    if (!draft) return;
    switch (current.section) {
      case 'buddy': return saveBuddy(draft.buddy);
      case 'fishing': return saveFishing(draft.fishing);
      case 'angler': return saveAngler(draft.angler);
      case 'navigation': return saveNavigation(draft.navigation);
      default: return undefined;
    }
  }, [draft, saveBuddy, saveFishing, saveAngler, saveNavigation]);

  const handleNext = useCallback(async () => {
    setBusy(true);
    try {
      await persistStep(step);
      await saveOnboarding(advance(onboarding));
    } catch (error) {
      toast.error(error.message || 'Der Schritt konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  }, [persistStep, step, saveOnboarding, onboarding]);

  const handleBack = useCallback(async () => {
    setBusy(true);
    try {
      await saveOnboarding(goBack(onboarding));
    } catch (error) {
      toast.error(error.message || 'Zurück war nicht möglich.');
    } finally {
      setBusy(false);
    }
  }, [saveOnboarding, onboarding]);

  const handleSkip = useCallback(async () => {
    setBusy(true);
    try {
      await saveOnboarding(skipOnboarding(onboarding));
      toast.success('Du kannst das Onboarding in den Einstellungen jederzeit fortsetzen.');
    } catch (error) {
      toast.error(error.message || 'Das Onboarding konnte nicht beendet werden.');
    } finally {
      setBusy(false);
    }
  }, [saveOnboarding, onboarding]);

  const requestNotifications = useCallback(async () => {
    const result = await ensurePermission({ force: true });
    setPermissions((p) => ({ ...p, notifications: result }));
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissions((p) => ({ ...p, location: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setPermissions((p) => ({ ...p, location: 'granted' })),
      () => setPermissions((p) => ({ ...p, location: 'denied' })),
      { timeout: 15000 }
    );
  }, []);

  const summary = useMemo(() => {
    if (!draft) return [];
    const regionName = FEDERAL_STATES.find((s) => s.id === draft.angler.region)?.name;
    const experienceLabel = EXPERIENCE_OPTIONS.find((o) => o.id === draft.angler.experience)?.label;
    return [
      ['Buddy', BUDDIES[draft.buddy.avatarId]?.name],
      ['Erfahrung', experienceLabel],
      ['Methoden', draft.fishing.methods.join(', ')],
      ['Zielfische', draft.fishing.targetSpecies.join(', ')],
      ['Gewässer', draft.fishing.waterTypes.join(', ')],
      ['Region', regionName],
      ['Ziele', draft.angler.goals.join(', ')],
    ].filter(([, value]) => value);
  }, [draft]);

  if (!open || !draft) return null;

  const isLast = stepIndex === ONBOARDING_STEP_COUNT - 1;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) handleSkip(); }}>
      <DialogContent className="bb-app max-h-[85vh] overflow-y-auto max-w-xl border-slate-700">
        <DialogTitle>{step.title}</DialogTitle>
        <DialogDescription>
          Schritt {stepIndex + 1} von {ONBOARDING_STEP_COUNT} — du kannst jederzeit abbrechen und später fortsetzen.
        </DialogDescription>

        <div
          className="h-1.5 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Onboarding-Fortschritt"
        >
          <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>

        <div className="py-2 space-y-4">
          {step.id === 'welcome' && (
            <div className="space-y-3">
              <p>
                In den nächsten Minuten lernt dich dein Buddy kennen: Zielfische, Methoden,
                Gewässer und deine Region. Danach sind Empfehlungen, Trip-Planung und Packlisten
                auf dich zugeschnitten.
              </p>
              <p className="bb-muted text-sm">
                Jede Angabe lässt sich später in den Einstellungen ändern oder löschen.
              </p>
            </div>
          )}

          {step.id === 'buddy' && (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(BUDDIES).map(([id, option]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={draft.buddy.avatarId === id}
                  onClick={() => setDraftSection('buddy', { ...draft.buddy, gender: option.gender, avatarId: id })}
                  className={`text-left rounded-2xl overflow-hidden ${
                    draft.buddy.avatarId === id ? 'ring-2 ring-cyan-300 bg-cyan-400/10' : 'bg-white/5'
                  }`}
                >
                  <img
                    src={option.portrait}
                    alt={`${option.name}, ${option.gender === 'female' ? 'weiblicher' : 'männlicher'} KI-Buddy`}
                    className="w-full aspect-[4/3] object-cover object-top"
                  />
                  <div className="p-3">
                    <span className="font-semibold">{option.name}</span>
                    <span className="text-xs text-slate-300 block mt-1">{option.description}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step.id === 'voice' && (
            <div className="space-y-3">
              <OptionCards
                options={[
                  { id: 'male', label: 'Daniel', description: 'Männliche Stimme, in allen Tarifen verfügbar.' },
                  { id: 'female', label: 'Matilda', description: 'Weibliche Stimme, nur mit Ultimate.' },
                ]}
                value={draft.buddy.voiceId}
                onSelect={(voiceId) => setDraftSection('buddy', { ...draft.buddy, voiceId })}
              />
              <p className="bb-muted text-sm">
                Ohne Ultimate wird automatisch Daniel verwendet.
              </p>
            </div>
          )}

          {step.id === 'tone' && (
            <OptionCards
              options={TONE_OPTIONS}
              value={draft.buddy.tone}
              onSelect={(tone) => setDraftSection('buddy', { ...draft.buddy, tone })}
            />
          )}

          {step.id === 'experience' && (
            <OptionCards
              options={EXPERIENCE_OPTIONS}
              value={draft.angler.experience}
              onSelect={(experience) => setDraftSection('angler', { ...draft.angler, experience })}
            />
          )}

          {step.id === 'methods' && (
            <ChipGroup
              label="Womit angelst du am liebsten? Mehrfachauswahl möglich."
              options={FISHING_METHOD_OPTIONS}
              selected={draft.fishing.methods}
              onToggle={(value) => setDraftSection('fishing', {
                ...draft.fishing, methods: toggleInList(draft.fishing.methods, value),
              })}
            />
          )}

          {step.id === 'species' && (
            <ChipGroup
              label="Auf welche Fische hast du es abgesehen?"
              options={FISHING_SPECIES_OPTIONS}
              selected={draft.fishing.targetSpecies}
              onToggle={(value) => setDraftSection('fishing', {
                ...draft.fishing, targetSpecies: toggleInList(draft.fishing.targetSpecies, value),
              })}
            />
          )}

          {step.id === 'waters' && (
            <ChipGroup
              label="An welchen Gewässern bist du unterwegs?"
              options={FISHING_WATER_TYPE_OPTIONS}
              selected={draft.fishing.waterTypes}
              onToggle={(value) => setDraftSection('fishing', {
                ...draft.fishing, waterTypes: toggleInList(draft.fishing.waterTypes, value),
              })}
            />
          )}

          {step.id === 'region' && (
            <label className="bb-settings-field">
              Bundesland
              <select
                value={draft.angler.region || ''}
                onChange={(e) => setDraftSection('angler', { ...draft.angler, region: e.target.value || null })}
              >
                <option value="">Bitte wählen</option>
                {FEDERAL_STATES.map((state) => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
              <span className="text-xs text-slate-400">
                Steuert Schonzeiten, Mindestmaße und regionale Regeln.
              </span>
            </label>
          )}

          {step.id === 'times' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="bb-settings-field">
                Von
                <input
                  type="time"
                  value={draft.fishing.preferredTime?.start || ''}
                  onChange={(e) => setDraftSection('fishing', {
                    ...draft.fishing,
                    preferredTime: { start: e.target.value, end: draft.fishing.preferredTime?.end || '' },
                  })}
                />
              </label>
              <label className="bb-settings-field">
                Bis
                <input
                  type="time"
                  value={draft.fishing.preferredTime?.end || ''}
                  onChange={(e) => setDraftSection('fishing', {
                    ...draft.fishing,
                    preferredTime: { start: draft.fishing.preferredTime?.start || '', end: e.target.value },
                  })}
                />
              </label>
              <p className="bb-muted text-sm sm:col-span-2">
                Wann bist du typischerweise am Wasser? Der Trip-Planer schlägt passende Zeitfenster vor.
              </p>
            </div>
          )}

          {step.id === 'gear' && (
            <div className="space-y-3">
              <p>
                Deine Ruten, Rollen und Köder kannst du in der Ausrüstung erfassen. Der Buddy
                empfiehlt dann nur, was du tatsächlich dabei hast.
              </p>
              <p className="bb-muted text-sm">
                Das lässt sich jederzeit nachholen — überspringe diesen Schritt ruhig.
              </p>
            </div>
          )}

          {step.id === 'goals' && (
            <ChipGroup
              label="Was möchtest du mit BaitBuddy erreichen?"
              options={GOAL_OPTIONS}
              selected={draft.angler.goals}
              onToggle={(value) => setDraftSection('angler', {
                ...draft.angler, goals: toggleInList(draft.angler.goals, value, 6),
              })}
            />
          )}

          {step.id === 'focus' && (
            <ChipGroup
              label="Welche vier Bereiche sollen unten in der Navigation liegen?"
              options={NAVIGATION_OPTIONS.map((key) => NAVIGATION_LABELS[key] || key)}
              selected={draft.navigation.map((key) => NAVIGATION_LABELS[key] || key)}
              max={4}
              onToggle={(label) => {
                const key = NAVIGATION_OPTIONS.find((k) => (NAVIGATION_LABELS[k] || k) === label);
                if (key) setDraftSection('navigation', toggleInList(draft.navigation, key, 4));
              }}
            />
          )}

          {step.id === 'notifications' && (
            <div className="space-y-3">
              <p>
                BaitBuddy meldet sich bei Wetterwarnungen, Bissfenstern und Ereignissen aus
                deinen Trips — nur, wenn du es erlaubst.
              </p>
              <button type="button" className="bb-action" onClick={requestNotifications}>
                <Bell size={18} aria-hidden="true" /> Benachrichtigungen erlauben
              </button>
              {(permissions.notifications || getPermissionState()) === 'granted' && (
                <p className="text-sm text-cyan-200">Benachrichtigungen sind aktiv.</p>
              )}
              {permissions.notifications === 'denied' && (
                <p className="bb-muted text-sm">
                  Abgelehnt. Du kannst das in den Systemeinstellungen deines Geräts ändern.
                </p>
              )}
              {permissions.notifications === 'unsupported' && (
                <p className="bb-muted text-sm">
                  Dieses Gerät unterstützt keine Web-Benachrichtigungen.
                </p>
              )}
            </div>
          )}

          {step.id === 'location' && (
            <div className="space-y-3">
              <p>
                Mit deinem Standort findet BaitBuddy Gewässer in der Nähe, rechnet Anfahrtszeiten
                und liefert das Wetter für den richtigen Ort.
              </p>
              <button type="button" className="bb-action" onClick={requestLocation}>
                <MapPin size={18} aria-hidden="true" /> Standort freigeben
              </button>
              {permissions.location === 'granted' && (
                <p className="text-sm text-cyan-200">Standort ist freigegeben.</p>
              )}
              {permissions.location === 'denied' && (
                <p className="bb-muted text-sm">
                  Abgelehnt. Gewässer in der Nähe kannst du weiterhin über die Karte suchen.
                </p>
              )}
              {permissions.location === 'unsupported' && (
                <p className="bb-muted text-sm">Dieses Gerät liefert keinen Standort.</p>
              )}
            </div>
          )}

          {step.id === 'summary' && (
            <div className="space-y-3">
              <p>Das hat dein Buddy sich gemerkt:</p>
              <dl className="space-y-2">
                {summary.map(([label, value]) => (
                  <div key={label} className="flex gap-3 text-sm">
                    <dt className="bb-muted w-28 shrink-0">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {summary.length === 0 && (
                <p className="bb-muted text-sm">
                  Du hast nichts angegeben — das lässt sich in den Einstellungen nachholen.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            className="bb-secondary"
            onClick={handleBack}
            disabled={stepIndex === 0 || busy || saving}
          >
            <ChevronLeft size={18} aria-hidden="true" /> Zurück
          </button>
          <button type="button" className="bb-secondary" onClick={handleSkip} disabled={busy || saving}>
            Später
          </button>
          <button type="button" className="bb-action ml-auto" onClick={handleNext} disabled={busy || saving}>
            {busy || saving ? 'Wird gespeichert …' : isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ONBOARDING_STEPS };
