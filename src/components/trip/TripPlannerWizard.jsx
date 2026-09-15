import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, X, Fish, MapPin, CalendarClock, CloudSun,
  Backpack, Anchor, ScrollText, ListChecks, Loader2, Crosshair, Plus, Trash2, Play,
} from 'lucide-react';
import { Spot } from '@/entities/Spot';
import { GearItem } from '@/entities/GearItem';
import { RuleEntry } from '@/entities/RuleEntry';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import {
  WIZARD_STEPS, createInitialWizardState, buildPlanPayload, stepComplete,
  resolveQuickDate, defaultChecklist,
} from '@/lib/tripWizard';
import { FISHING_SPECIES_OPTIONS, FISHING_METHOD_OPTIONS } from '@/lib/buddyPreferences';

const STEP_ICON = { target: Fish, spot: MapPin, time: CalendarClock, conditions: CloudSun, gear: Backpack, bait: Anchor, rules: ScrollText, checklist: ListChecks, summary: Check };

// Reale, kuratierte Köder-Vorschläge pro Zielfisch (fachlich, kein Mock).
const BAIT_SUGGESTIONS = {
  Hecht: ['Gummifisch 12–15 cm', 'Wobbler (flachlaufend)', 'Spinnerbait', 'Köderfisch am System'],
  Zander: ['Gummifisch 10–12 cm', 'Dropshot-Köder', 'Jig langsam über Grund', 'Köderfisch'],
  Barsch: ['Gummifisch 5–7 cm', 'Dropshot', 'Spinner Gr. 1–2', 'Mini-Wobbler'],
  Forelle: ['Spinner', 'Kleiner Wobbler', 'Sbirolino + Teig', 'Tauwurm'],
  Karpfen: ['Boilies', 'Mais', 'Pellets', 'Tigernüsse'],
  Aal: ['Tauwurm', 'Köderfischfetzen', 'Maden-Bündel'],
  Wels: ['Großer Köderfisch', 'Tauwurm-Bündel', 'Boilie (groß)', 'Calamari'],
};
const DEFAULT_BAITS = ['Gummifisch', 'Wobbler', 'Naturköder', 'Spinner'];

function haversineKm(a, b) {
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const WEATHER_TEXT = (code) => {
  if ([0, 1].includes(code)) return 'Klar';
  if ([2, 3].includes(code)) return 'Bewölkt';
  if ([45, 48].includes(code)) return 'Nebel';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'Regen';
  if ([71, 73, 75].includes(code)) return 'Schnee';
  return 'Wechselhaft';
};

export default function TripPlannerWizard({ onClose, onSave, plan, currentLocation }) {
  const { fishing } = useBuddyPreferences();
  const [state, setState] = useState(() => createInitialWizardState(plan));
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const step = WIZARD_STEPS[stepIndex];
  const update = (patch) => setState((s) => ({ ...s, ...patch }));

  const goNext = () => setStepIndex((i) => Math.min(WIZARD_STEPS.length - 1, i + 1));
  const goBack = () => (stepIndex === 0 ? onClose() : setStepIndex((i) => Math.max(0, i - 1)));

  const doSave = async (activate) => {
    setSaving(true);
    setError('');
    try {
      const payload = buildPlanPayload(state);
      if (activate) payload.is_active = true;
      await onSave(payload, plan?.id);
      onClose();
    } catch (e) {
      setError('Trip konnte nicht gespeichert werden. Bitte erneut versuchen.');
      setSaving(false);
    }
  };

  return (
    <section className="bb-card" aria-label={plan ? 'Ausflug bearbeiten' : 'Ausflug planen'}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="bb-eyebrow mb-1">Angelausflug planen</p>
          <h2 className="text-xl font-semibold text-slate-100">{step.label}</h2>
        </div>
        <button type="button" onClick={onClose} className="bb-secondary" aria-label="Planung schließen"><X size={18} /></button>
      </header>

      <StepRail stepIndex={stepIndex} state={state} onJump={setStepIndex} />

      <div className="mt-5 min-h-[220px]">
        {step.id === 'target' && <TargetStep state={state} update={update} favorites={fishing?.targetSpecies || []} />}
        {step.id === 'spot' && <SpotStep state={state} update={update} currentLocation={currentLocation} />}
        {step.id === 'time' && <TimeStep state={state} update={update} />}
        {step.id === 'conditions' && <ConditionsStep state={state} update={update} />}
        {step.id === 'gear' && <GearStep state={state} update={update} />}
        {step.id === 'bait' && <BaitStep state={state} update={update} favorites={fishing?.favoriteLures || []} />}
        {step.id === 'rules' && <RulesStep state={state} update={update} />}
        {step.id === 'checklist' && <ChecklistStep state={state} update={update} />}
        {step.id === 'summary' && <SummaryStep state={state} />}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}

      <footer className="mt-5 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
        <button type="button" className="bb-secondary" onClick={goBack} disabled={saving}>
          <ArrowLeft size={17} /> {stepIndex === 0 ? 'Abbrechen' : 'Zurück'}
        </button>
        {step.id !== 'summary' ? (
          <button type="button" className="bb-action" onClick={goNext}>
            Weiter <ArrowRight size={17} />
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" className="bb-secondary" onClick={() => doSave(false)} disabled={saving}>
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Speichern
            </button>
            <button type="button" className="bb-action" onClick={() => doSave(true)} disabled={saving}>
              <Play size={17} /> Angeln starten
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

function StepRail({ stepIndex, state, onJump }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Planungsschritte">
      {WIZARD_STEPS.map((s, i) => {
        const Icon = STEP_ICON[s.id] || Check;
        const done = i < stepIndex && (s.id === 'summary' || stepComplete(state, s.id));
        const current = i === stepIndex;
        return (
          <button key={s.id} type="button" role="tab" aria-selected={current} title={s.label}
            onClick={() => onJump(i)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              current ? 'bg-cyan-500 text-slate-950' : done ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-slate-400'
            }`}>
            <Icon size={16} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ChipRow({ options, selected, onSelect, multi = false }) {
  const isSel = (o) => (multi ? (selected || []).includes(o) : selected === o);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onSelect(o)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            isSel(o) ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
          }`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function TargetStep({ state, update, favorites }) {
  const favs = favorites.filter((f) => FISHING_SPECIES_OPTIONS.includes(f) || true);
  const ordered = [...new Set([...favs, ...FISHING_SPECIES_OPTIONS])];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Was möchtest du fangen?</p>
      {favs.length > 0 && <p className="text-xs text-cyan-300/80">Deine Favoriten zuerst</p>}
      <ChipRow options={ordered} selected={state.target_fish} onSelect={(o) => update({ target_fish: o })} />
      <label className="bb-settings-field">
        <span>Andere Art</span>
        <input type="text" value={FISHING_SPECIES_OPTIONS.includes(state.target_fish) ? '' : state.target_fish}
          onChange={(e) => update({ target_fish: e.target.value })} placeholder="z. B. Rapfen" />
      </label>
    </div>
  );
}

function SpotStep({ state, update, currentLocation }) {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await Spot.list('', 100);
        if (alive) setSpots(Array.isArray(list) ? list : []);
      } catch { if (alive) setSpots([]); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const withDist = useMemo(() => spots
    .map((sp) => ({ sp, dist: haversineKm(currentLocation, { lat: sp.latitude, lon: sp.longitude }) }))
    .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity)), [spots, currentLocation]);

  const pick = (sp) => update({ spot: { name: sp.name || sp.title || 'Spot', water_type: sp.water_type || sp.type || '', lat: sp.latitude ?? null, lon: sp.longitude ?? null, spot_id: sp.id || null } });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Wo möchtest du angeln?</p>
      <label className="bb-settings-field">
        <span>Gewässer / Spot</span>
        <input type="text" value={state.spot.name} onChange={(e) => update({ spot: { ...state.spot, name: e.target.value } })} placeholder="Name des Gewässers" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="bb-secondary" disabled={currentLocation?.lat == null}
          onClick={() => update({ spot: { ...state.spot, lat: currentLocation.lat, lon: currentLocation.lon } })}>
          <Crosshair size={16} /> Aktuellen Standort
        </button>
        <Link className="bb-secondary" to="/Map" target="_blank" rel="noopener noreferrer"><MapPin size={16} /> Karte öffnen</Link>
      </div>
      <div>
        <p className="text-xs text-slate-400 mb-2">Gespeicherte Spots</p>
        {loading ? (
          <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Wird geladen …</p>
        ) : withDist.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Spots gespeichert.</p>
        ) : (
          <div className="grid gap-2 max-h-56 overflow-y-auto">
            {withDist.slice(0, 20).map(({ sp, dist }) => (
              <button key={sp.id} type="button" onClick={() => pick(sp)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                  state.spot.spot_id === sp.id ? 'border-cyan-400 bg-cyan-500/15' : 'border-white/10 bg-white/5'
                }`}>
                <span className="min-w-0 truncate text-slate-200">{sp.name || sp.title || 'Spot'}</span>
                {dist != null && <span className="ml-2 shrink-0 text-xs text-slate-400">{dist.toFixed(1)} km</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimeStep({ state, update }) {
  const quick = [['today', 'Heute'], ['tomorrow', 'Morgen'], ['weekend', 'Wochenende']];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Wann geht es los?</p>
      <div className="flex flex-wrap gap-2">
        {quick.map(([k, label]) => (
          <button key={k} type="button" onClick={() => update({ date: resolveQuickDate(k) })}
            className={`rounded-full border px-3 py-1.5 text-sm ${state.date === resolveQuickDate(k) ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>
      <label className="bb-settings-field"><span>Datum</span>
        <input type="date" value={state.date} onChange={(e) => update({ date: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="bb-settings-field"><span>Start</span>
          <input type="time" value={state.start_time} onChange={(e) => update({ start_time: e.target.value })} /></label>
        <label className="bb-settings-field"><span>Ende</span>
          <input type="time" value={state.end_time} onChange={(e) => update({ end_time: e.target.value })} /></label>
      </div>
    </div>
  );
}

function ConditionsStep({ state, update }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const spot = state.spot || {};
  const snap = state.weather_snapshot;

  const load = async () => {
    if (spot.lat == null || spot.lon == null) { setErr('Für Bedingungen bitte zuerst einen Ort mit Koordinaten wählen.'); return; }
    setLoading(true); setErr('');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,weather_code&daily=sunrise,sunset&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('weather');
      const data = await res.json();
      const c = data.current || {};
      update({ weather_snapshot: {
        temperature: c.temperature_2m ?? null,
        wind_speed: c.wind_speed_10m ?? null,
        wind_direction: c.wind_direction_10m ?? null,
        pressure: c.surface_pressure ?? null,
        cloud_cover: c.cloud_cover ?? null,
        weather_code: c.weather_code ?? null,
        sunrise: data.daily?.sunrise?.[0] ?? null,
        sunset: data.daily?.sunset?.[0] ?? null,
        fetched_at: new Date().toISOString(),
      } });
    } catch { setErr('Wetter konnte nicht geladen werden. Später erneut versuchen.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Aktuelle Bedingungen für deinen Spot.</p>
      <button type="button" className="bb-secondary" onClick={load} disabled={loading}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <CloudSun size={16} />} Bedingungen laden
      </button>
      {err && <p className="text-sm text-amber-300">{err}</p>}
      {snap && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Metric label="Temperatur" value={snap.temperature != null ? `${Math.round(snap.temperature)} °C` : '—'} />
            <Metric label="Wetter" value={WEATHER_TEXT(snap.weather_code)} />
            <Metric label="Wind" value={snap.wind_speed != null ? `${Math.round(snap.wind_speed)} km/h` : '—'} />
            <Metric label="Luftdruck" value={snap.pressure != null ? `${Math.round(snap.pressure)} hPa` : '—'} />
            <Metric label="Bewölkung" value={snap.cloud_cover != null ? `${snap.cloud_cover} %` : '—'} />
            <Metric label="Sonnenauf/-untergang" value={snap.sunrise && snap.sunset ? `${snap.sunrise.slice(11, 16)} / ${snap.sunset.slice(11, 16)}` : '—'} />
          </div>
          <p className="text-xs text-slate-400">{conditionHint(snap)}</p>
        </div>
      )}
    </div>
  );
}

function conditionHint(snap) {
  const parts = [];
  if (snap.pressure != null) {
    parts.push(snap.pressure >= 1015 ? 'Hoher, stabiler Luftdruck — oft ruhige, aber planbare Bissphasen.' : snap.pressure <= 1005 ? 'Niedriger Luftdruck — Raubfische sind bei fallendem Druck häufig aktiver.' : 'Mittlerer Luftdruck — solide Bedingungen.');
  }
  if (snap.cloud_cover != null && snap.cloud_cover >= 70) parts.push('Bedeckt: gutes Licht für Raubfisch über den ganzen Tag.');
  return parts.join(' ') || 'Nutze die Werte als Anhaltspunkt für Köderwahl und Uhrzeit.';
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-slate-100">{value}</div>
    </div>
  );
}

function GearStep({ state, update }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await GearItem.list('', 200);
        const items = (Array.isArray(list) ? list : []).map((g) => ({ id: g.id, name: g.name || g.title || g.type || 'Ausrüstung' }));
        if (alive && (!state.gear_items || state.gear_items.length === 0) && items.length) {
          update({ gear_items: items.map((it) => ({ ...it, packed: false })) });
        }
      } catch { /* Gear optional */ } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id) => update({ gear_items: state.gear_items.map((g) => (g.id === id ? { ...g, packed: !g.packed } : g)) });
  const packedCount = state.gear_items.filter((g) => g.packed).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Was nimmst du mit? {state.gear_items.length > 0 && `(${packedCount}/${state.gear_items.length} eingepackt)`}</p>
      {loading ? (
        <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Ausrüstung wird geladen …</p>
      ) : state.gear_items.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Ausrüstung gespeichert. Trage unten frei ein, was du mitnimmst.</p>
      ) : (
        <div className="grid gap-2 max-h-52 overflow-y-auto">
          {state.gear_items.map((g) => (
            <label key={g.id || g.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <input type="checkbox" checked={!!g.packed} onChange={() => toggle(g.id)} className="h-4 w-4 accent-cyan-500" />
              <span className={g.packed ? 'text-slate-100' : 'text-slate-300'}>{g.name}</span>
            </label>
          ))}
        </div>
      )}
      <label className="bb-settings-field"><span>Zusätzliche Ausrüstung / Notiz</span>
        <textarea value={state.gear_note} onChange={(e) => update({ gear_note: e.target.value })} rows={2} placeholder="z. B. Wathose, zweite Rute" /></label>
    </div>
  );
}

function BaitStep({ state, update, favorites }) {
  const suggestions = [...new Set([...(favorites || []), ...(BAIT_SUGGESTIONS[state.target_fish] || DEFAULT_BAITS)])];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        {state.target_fish ? `Passende Köder für ${state.target_fish}:` : 'Köder-Empfehlungen:'}
      </p>
      <ChipRow options={suggestions} selected={state.bait} onSelect={(o) => update({ bait: o })} />
      <label className="bb-settings-field"><span>Eigener Köder</span>
        <input type="text" value={suggestions.includes(state.bait) ? '' : state.bait}
          onChange={(e) => update({ bait: e.target.value })} placeholder="z. B. 14-cm-Gummifisch, schwarz" /></label>
      <label className="bb-settings-field"><span>Methode</span>
        <select value={state.method} onChange={(e) => update({ method: e.target.value })}>
          <option value="">— wählen —</option>
          {FISHING_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
    </div>
  );
}

function RulesStep({ state, update }) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await RuleEntry.list('', 200);
        const fish = (state.target_fish || '').toLowerCase();
        const rel = (Array.isArray(list) ? list : []).filter((r) => fish && String(r.fish || '').toLowerCase().includes(fish));
        if (alive) {
          setMatches(rel);
          update({ rules: rel.map((r) => ({ fish: r.fish, region: r.region || r.bundesland || '', min_size_cm: r.min_size_cm ?? null, closed_from: r.closed_from || null, closed_to: r.closed_to || null, notes: r.notes || '' })) });
        }
      } catch { if (alive) setMatches([]); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.target_fish]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Relevante Vorschriften{state.target_fish ? ` für ${state.target_fish}` : ''}.</p>
      {loading ? (
        <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Regeln werden geprüft …</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-amber-300/90">Keine hinterlegten Regeln gefunden. Prüfe die lokalen Bestimmungen deines Gewässers selbst — Angaben ohne Datenbasis werden hier nicht erfunden.</p>
      ) : (
        <div className="grid gap-2 max-h-52 overflow-y-auto">
          {matches.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
              <div className="font-medium text-slate-100">{r.fish}{r.region || r.bundesland ? ` · ${r.region || r.bundesland}` : ''}</div>
              <div className="text-slate-300 text-xs mt-0.5">
                {r.min_size_cm != null && <span>Mindestmaß {r.min_size_cm} cm. </span>}
                {r.closed_from && r.closed_to && <span>Schonzeit {String(r.closed_from).slice(5)}–{String(r.closed_to).slice(5)}. </span>}
                {r.notes && <span>{r.notes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={state.rules_ack} onChange={(e) => update({ rules_ack: e.target.checked })} className="h-4 w-4 accent-cyan-500" />
        Ich habe die geltenden Vorschriften zur Kenntnis genommen.
      </label>
    </div>
  );
}

function ChecklistStep({ state, update }) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (!state.checklist || state.checklist.length === 0) update({ checklist: defaultChecklist(state) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const add = () => {
    const v = draft.trim();
    if (v && !state.checklist.includes(v)) update({ checklist: [...state.checklist, v] });
    setDraft('');
  };
  const remove = (item) => update({ checklist: state.checklist.filter((c) => c !== item) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Deine Checkliste — vorausgefüllt, frei anpassbar.</p>
      <div className="grid gap-1.5 max-h-52 overflow-y-auto">
        {state.checklist.map((item) => (
          <div key={item} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm text-slate-200">
            <span className="min-w-0 truncate">{item}</span>
            <button type="button" aria-label={`${item} entfernen`} onClick={() => remove(item)} className="text-slate-500 hover:text-red-300"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Punkt hinzufügen" className="flex-1 min-h-11 rounded-xl bg-[#0b182b] border border-[#8aa4bc30] px-3 text-slate-100" />
        <button type="button" className="bb-secondary" onClick={add}><Plus size={16} /></button>
      </div>
    </div>
  );
}

function SummaryStep({ state }) {
  const spot = state.spot || {};
  const rows = [
    ['Zielfisch', state.target_fish],
    ['Ort', spot.name],
    ['Zeitpunkt', state.date ? `${state.date}${state.start_time ? ` · ${state.start_time}` : ''}${state.end_time ? `–${state.end_time}` : ''}` : null],
    ['Köder', state.bait],
    ['Methode', state.method],
    ['Ausrüstung', [state.gear_note, state.gear_items.filter((g) => g.packed).map((g) => g.name).join(', ')].filter(Boolean).join(' — ')],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Prüfe deinen Angelausflug und starte.</p>
      <div className="grid gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-sm">
            <span className="w-28 shrink-0 text-slate-400">{k}</span>
            <span className="text-slate-100">{v}</span>
          </div>
        ))}
      </div>
      {state.checklist.length > 0 && (
        <div className="text-sm">
          <span className="text-slate-400">Checkliste:</span>{' '}
          <span className="text-slate-200">{state.checklist.length} Punkte</span>
        </div>
      )}
    </div>
  );
}
