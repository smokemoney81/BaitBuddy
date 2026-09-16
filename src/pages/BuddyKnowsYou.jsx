import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, Plus, RefreshCw, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { personalization } from '@/api/frontendClient';
import { useAuth } from '@/lib/AuthContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import {
  FISHING_SPECIES_OPTIONS,
  FISHING_METHOD_OPTIONS,
  FISHING_WATER_TYPE_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
} from '@/lib/buddyPreferences';
import { FEDERAL_STATES } from '@/components/rules/rule-utils';

// Transparenzbereich (§6): zeigt, was der Buddy über dieses Konto weiß, und
// lässt jede Angabe korrigieren oder löschen. Die abgeleiteten Muster tragen
// ihre Stichprobe mit — der Nutzer soll sehen, worauf eine Annahme beruht.

function Section({ title, description, children }) {
  return (
    <section className="bb-card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="bb-muted text-sm mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function RemovableChips({ values, onRemove, emptyText }) {
  if (values.length === 0) return <p className="bb-muted text-sm">{emptyText}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10 text-sm">
          {value}
          <button
            type="button"
            aria-label={`${value} entfernen`}
            onClick={() => onRemove(value)}
            className="text-slate-400 hover:text-red-300 transition-colors duration-200"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

function AddFromList({ label, options, selected, onAdd }) {
  const available = options.filter((option) => !selected.includes(option));
  const [value, setValue] = useState('');
  if (available.length === 0) return null;
  return (
    <div className="flex gap-2 items-end flex-wrap">
      <label className="bb-settings-field flex-1 min-w-[12rem]">
        {label}
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Bitte wählen</option>
          {available.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="bb-secondary"
        disabled={!value}
        onClick={() => { onAdd(value); setValue(''); }}
      >
        <Plus size={16} aria-hidden="true" /> Hinzufügen
      </button>
    </div>
  );
}

function FreeTextAdd({ label, placeholder, onAdd, disabled }) {
  const [value, setValue] = useState('');
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
  };
  return (
    <div className="flex gap-2 items-end flex-wrap">
      <label className="bb-settings-field flex-1 min-w-[12rem]">
        {label}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
      </label>
      <button type="button" className="bb-secondary" disabled={disabled || !value.trim()} onClick={submit}>
        <Plus size={16} aria-hidden="true" /> Hinzufügen
      </button>
    </div>
  );
}

export default function BuddyKnowsYou() {
  const { user } = useAuth();
  const { fishing, angler, saveFishing, saveAngler, canSave, saving } = useBuddyPreferences();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['personalization-profile', user?.id],
    queryFn: () => personalization.getProfile(),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const persist = useCallback(async (saver, value, message) => {
    try {
      await saver(value);
      toast.success(message);
    } catch (err) {
      toast.error(err.message || 'Die Änderung konnte nicht gespeichert werden.');
    }
  }, []);

  const updateFishing = useCallback((patch, message) => {
    persist(saveFishing, { ...fishing, ...patch }, message);
  }, [persist, saveFishing, fishing]);

  const updateAngler = useCallback((patch, message) => {
    persist(saveAngler, { ...angler, ...patch }, message);
  }, [persist, saveAngler, angler]);

  const regionName = useMemo(
    () => FEDERAL_STATES.find((state) => state.id === angler.region)?.name || null,
    [angler.region]
  );

  const patterns = data?.patterns;
  const incomplete = data?.incompleteSources || [];

  return (
    <div className="bb-app max-w-3xl mx-auto px-4 py-6 space-y-5">
      <header>
        <p className="bb-eyebrow mb-2">Transparenz</p>
        <h1 className="text-2xl font-semibold tracking-tight">Das weiß BaitBuddy über dich</h1>
        <p className="bb-muted mt-2">
          Alles hier fließt in die Antworten deines Buddys ein. Jede Angabe kannst du
          korrigieren oder löschen — er übernimmt die Änderung sofort.
        </p>
      </header>

      {!canSave && (
        <p className="bb-card bb-muted">Melde dich an, um dein Profil zu sehen und zu ändern.</p>
      )}

      {error && (
        <div className="bb-card" role="alert">
          <p>Dein Profil konnte nicht geladen werden.</p>
          <button type="button" className="bb-secondary mt-3" onClick={() => refetch()}>
            <RefreshCw size={16} aria-hidden="true" /> Erneut versuchen
          </button>
        </div>
      )}

      {incomplete.length > 0 && (
        <p className="bb-card bb-muted" role="status">
          Diese Quellen ließen sich gerade nicht lesen: {incomplete.join(', ')}. Die Übersicht
          ist deshalb unvollständig.
        </p>
      )}

      {data && !data.personalized && (
        <div className="bb-card space-y-2">
          <p className="flex items-center gap-2 font-semibold">
            <Lock size={18} aria-hidden="true" /> Noch keine dauerhafte Personalisierung
          </p>
          <p className="bb-muted text-sm">
            Ohne bezahlten Plan antwortet der Buddy allgemeingültig und merkt sich deine
            Historie nicht. Deine Angaben unten werden trotzdem gespeichert und greifen,
            sobald du einen Plan hast.
          </p>
          <Link className="bb-action self-start" to="/PremiumPlans">Pläne ansehen</Link>
        </div>
      )}

      <Section
        title="Deine Zielfische"
        description="Danach richtet der Buddy Köder- und Spot-Empfehlungen aus."
      >
        <RemovableChips
          values={fishing.targetSpecies}
          emptyText="Noch keine Zielfische hinterlegt."
          onRemove={(value) => updateFishing(
            { targetSpecies: fishing.targetSpecies.filter((s) => s !== value) },
            `${value} entfernt`
          )}
        />
        <AddFromList
          label="Zielfisch ergänzen"
          options={FISHING_SPECIES_OPTIONS}
          selected={fishing.targetSpecies}
          onAdd={(value) => updateFishing(
            { targetSpecies: [...fishing.targetSpecies, value] },
            `${value} ergänzt`
          )}
        />
      </Section>

      <Section title="Deine Methoden" description="Womit du bevorzugt angelst.">
        <RemovableChips
          values={fishing.methods}
          emptyText="Noch keine Methoden hinterlegt."
          onRemove={(value) => updateFishing(
            { methods: fishing.methods.filter((m) => m !== value) },
            `${value} entfernt`
          )}
        />
        <AddFromList
          label="Methode ergänzen"
          options={FISHING_METHOD_OPTIONS}
          selected={fishing.methods}
          onAdd={(value) => updateFishing({ methods: [...fishing.methods, value] }, `${value} ergänzt`)}
        />
      </Section>

      <Section title="Deine Gewässertypen">
        <RemovableChips
          values={fishing.waterTypes}
          emptyText="Noch keine Gewässertypen hinterlegt."
          onRemove={(value) => updateFishing(
            { waterTypes: fishing.waterTypes.filter((w) => w !== value) },
            `${value} entfernt`
          )}
        />
        <AddFromList
          label="Gewässertyp ergänzen"
          options={FISHING_WATER_TYPE_OPTIONS}
          selected={fishing.waterTypes}
          onAdd={(value) => updateFishing({ waterTypes: [...fishing.waterTypes, value] }, `${value} ergänzt`)}
        />
      </Section>

      <Section
        title="No-Gos"
        description="Was der Buddy dir nie vorschlagen soll. Er hält sich daran."
      >
        <RemovableChips
          values={angler.noGos}
          emptyText="Keine No-Gos hinterlegt."
          onRemove={(value) => updateAngler(
            { noGos: angler.noGos.filter((n) => n !== value) },
            `${value} entfernt`
          )}
        />
        <FreeTextAdd
          label="No-Go ergänzen"
          placeholder="z. B. kein Nachtangeln"
          disabled={angler.noGos.length >= 10}
          onAdd={(value) => updateAngler({ noGos: [...angler.noGos, value] }, 'No-Go ergänzt')}
        />
      </Section>

      <Section title="Erfahrung, Region und Ziele">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="bb-settings-field">
            Erfahrung
            <select
              value={angler.experience || ''}
              onChange={(e) => updateAngler({ experience: e.target.value || null }, 'Erfahrung aktualisiert')}
            >
              <option value="">Keine Angabe</option>
              {EXPERIENCE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="bb-settings-field">
            Region
            <select
              value={angler.region || ''}
              onChange={(e) => updateAngler({ region: e.target.value || null }, 'Region aktualisiert')}
            >
              <option value="">Keine Angabe</option>
              {FEDERAL_STATES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="text-xs text-slate-400">
              {regionName ? `Steuert Schonzeiten und Mindestmaße für ${regionName}.` : 'Ohne Region keine regionalen Regeln.'}
            </span>
          </label>
        </div>
        <RemovableChips
          values={angler.goals}
          emptyText="Noch keine Ziele hinterlegt."
          onRemove={(value) => updateAngler({ goals: angler.goals.filter((g) => g !== value) }, `${value} entfernt`)}
        />
        <AddFromList
          label="Ziel ergänzen"
          options={GOAL_OPTIONS}
          selected={angler.goals}
          onAdd={(value) => updateAngler({ goals: [...angler.goals, value] }, `${value} ergänzt`)}
        />
      </Section>

      <Section
        title="Erkannte Muster"
        description="Aus deinen tatsächlichen Fängen abgeleitet — mit der Stichprobe, auf der sie beruhen."
      >
        {isLoading && <p className="bb-muted text-sm" role="status">Wird geladen …</p>}
        {patterns && !patterns.enoughData && (
          <p className="bb-muted text-sm">
            {patterns.total === 0
              ? 'Noch keine Fänge erfasst — der Buddy leitet deshalb nichts ab.'
              : `Erst ${patterns.total} Fänge erfasst. Für belastbare Muster sind es zu wenige.`}
          </p>
        )}
        {patterns?.enoughData && (
          <dl className="space-y-3">
            {patterns.patterns.map((pattern) => (
              <div key={pattern.id}>
                <dt className="text-sm bb-muted">{pattern.label}</dt>
                <dd className="font-semibold">{pattern.value}</dd>
                <dd className="text-xs text-slate-400">{pattern.detail}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="bb-muted text-xs">
          Diese Muster werden nicht gespeichert, sondern bei jedem Aufruf neu aus deinem
          Fangbuch berechnet. Lösche einen Fang, und das Muster ändert sich mit.
        </p>
      </Section>

      <Section title="Bekannte Ausrüstung und Touren">
        <div>
          <p className="text-sm bb-muted mb-2">Ausrüstung ({data?.gear?.total ?? 0})</p>
          {data?.gear?.known?.length
            ? <div className="flex flex-wrap gap-2">
              {data.gear.known.map((item) => (
                <span key={item} className="px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10 text-sm">{item}</span>
              ))}
            </div>
            : <p className="bb-muted text-sm">Der Buddy kennt noch keine Ausrüstung von dir.</p>}
          <Link className="bb-secondary mt-3 inline-flex" to="/Gear">Ausrüstung verwalten</Link>
        </div>
        <div>
          <p className="text-sm bb-muted mb-2">Touren</p>
          {data?.trips?.length
            ? <ul className="space-y-1 text-sm">
              {data.trips.map((trip) => (
                <li key={`${trip.title}-${trip.plannedDate}`}>
                  {trip.title}
                  {trip.targetFish ? ` — ${trip.targetFish}` : ''}
                  {trip.plannedDate ? ` (${new Date(trip.plannedDate).toLocaleDateString('de-DE')})` : ''}
                </li>
              ))}
            </ul>
            : <p className="bb-muted text-sm">Noch keine Touren bekannt.</p>}
          <Link className="bb-secondary mt-3 inline-flex" to="/TripPlanner">Tour planen</Link>
        </div>
      </Section>

      <div className="flex items-center gap-2">
        <button type="button" className="bb-secondary" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={16} aria-hidden="true" /> {isFetching ? 'Wird aktualisiert …' : 'Neu berechnen'}
        </button>
        {saving && <span className="bb-muted text-sm" role="status">Wird gespeichert …</span>}
      </div>
    </div>
  );
}
