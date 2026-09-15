import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Fish, Plus, X, Loader2, Save } from 'lucide-react';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import {
  FISHING_SPECIES_OPTIONS, FISHING_METHOD_OPTIONS, FISHING_WATER_TYPE_OPTIONS, normalizeFishing,
} from '@/lib/buddyPreferences';

// Personalisierung (Spec §20/§36): persönliche Angel-Präferenzen bearbeiten.
// Speichert über useBuddyPreferences().saveFishing in user_metadata.settings.fishing
// (kein neues Datenmodell). Speist Trip-Planer-Defaults und Dashboard-Insights.
export default function FishingPreferencesSettings() {
  const { fishing, saveFishing, saving, canSave } = useBuddyPreferences();
  const [draft, setDraft] = useState(fishing);
  const dirty = useRef(false);

  // Aus dem geladenen Profil übernehmen, solange nicht bearbeitet wird.
  useEffect(() => { if (!dirty.current) setDraft(fishing); }, [fishing]);

  const edit = (patch) => { dirty.current = true; setDraft((d) => ({ ...d, ...patch })); };
  const toggle = (field, value) => {
    const cur = draft[field] || [];
    edit({ [field]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  const save = async () => {
    try {
      await saveFishing(draft);
      dirty.current = false;
      toast.success('Angel-Präferenzen gespeichert');
    } catch (e) {
      toast.error(e?.message || 'Speichern fehlgeschlagen');
    }
  };

  return (
    <div className="glass-morphism border-gray-800 rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-cyan-400 text-lg font-semibold flex items-center gap-2">
          <Fish className="w-5 h-5" /> Deine Angel-Präferenzen
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Diese Angaben verbessern die Vorschläge im Trip-Planer und deine persönlichen Erkenntnisse.
        </p>
      </div>

      <MultiSelect label="Bevorzugte Zielfische" options={FISHING_SPECIES_OPTIONS}
        selected={draft.targetSpecies} onToggle={(v) => toggle('targetSpecies', v)}
        onAdd={(v) => !draft.targetSpecies.includes(v) && edit({ targetSpecies: [...draft.targetSpecies, v] })}
        allowCustom customPlaceholder="Andere Art" />

      <MultiSelect label="Bevorzugte Methoden" options={FISHING_METHOD_OPTIONS}
        selected={draft.methods} onToggle={(v) => toggle('methods', v)} />

      <MultiSelect label="Bevorzugte Gewässertypen" options={FISHING_WATER_TYPE_OPTIONS}
        selected={draft.waterTypes} onToggle={(v) => toggle('waterTypes', v)} />

      <MultiSelect label="Lieblingsköder" options={[]}
        selected={draft.favoriteLures} onToggle={(v) => toggle('favoriteLures', v)}
        onAdd={(v) => !draft.favoriteLures.includes(v) && edit({ favoriteLures: [...draft.favoriteLures, v] })}
        allowCustom customPlaceholder="Köder hinzufügen" />

      <div>
        <span className="text-sm text-gray-300">Bevorzugte Angelzeit</span>
        <div className="mt-2 grid grid-cols-2 gap-3 max-w-xs">
          <label className="bb-settings-field"><span>Von</span>
            <input type="time" value={draft.preferredTime?.start || ''}
              onChange={(e) => edit({ preferredTime: buildTime(e.target.value, draft.preferredTime?.end) })} /></label>
          <label className="bb-settings-field"><span>Bis</span>
            <input type="time" value={draft.preferredTime?.end || ''}
              onChange={(e) => edit({ preferredTime: buildTime(draft.preferredTime?.start, e.target.value) })} /></label>
        </div>
      </div>

      {!canSave && <p className="text-sm text-amber-300">Melde dich an, um deine Präferenzen zu speichern.</p>}

      <button type="button" onClick={save} disabled={!canSave || saving}
        className="bb-action disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Speichern
      </button>
    </div>
  );
}

function buildTime(start, end) {
  const s = (start || '').trim();
  const e = (end || '').trim();
  const out = normalizeFishing({ preferredTime: { start: s, end: e } }).preferredTime;
  // Zwischenzustand (nur ein Feld gesetzt) für die UI erhalten, damit der Nutzer
  // beide Felder nacheinander füllen kann; normalizeFishing beim Speichern räumt auf.
  return out || (s || e ? { start: s, end: e } : null);
}

function MultiSelect({ label, options, selected = [], onToggle, onAdd, allowCustom = false, customPlaceholder = 'Hinzufügen' }) {
  const [custom, setCustom] = useState('');
  const merged = [...new Set([...(options || []), ...selected])];
  const add = () => { const v = custom.trim(); if (v && onAdd) onAdd(v); setCustom(''); };
  return (
    <div>
      <span className="text-sm text-gray-300">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {merged.map((o) => {
          const on = selected.includes(o);
          return (
            <button key={o} type="button" onClick={() => onToggle(o)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                on ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
              }`}>
              {o}{on && <X size={13} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <div className="mt-2 flex gap-2 max-w-xs">
          <input type="text" value={custom} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder={customPlaceholder}
            className="flex-1 min-h-10 rounded-xl bg-[#0b182b] border border-[#8aa4bc30] px-3 text-sm text-slate-100" />
          <button type="button" className="bb-secondary" onClick={add} aria-label="Hinzufügen"><Plus size={16} /></button>
        </div>
      )}
    </div>
  );
}
