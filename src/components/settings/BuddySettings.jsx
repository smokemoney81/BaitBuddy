import React, { useEffect, useState } from 'react';
import { Check, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { BUDDIES, DETAIL_OPTIONS } from '@/lib/buddyPreferences';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';

export default function BuddySettings({ onSaved }) {
  const { buddy, saveBuddy, saving, canSave } = useBuddyPreferences();
  const [draft, setDraft] = useState(buddy);
  useEffect(() => setDraft(buddy), [buddy]);
  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const submit = async () => {
    try { await saveBuddy(draft); toast.success('Dein KI-Buddy wurde gespeichert'); onSaved?.(); }
    catch (error) { toast.error(error.message || 'Einstellungen konnten nicht gespeichert werden.'); }
  };
  return <section className="bb-app bb-card space-y-6" aria-labelledby="buddy-settings-title">
    <div><p className="bb-eyebrow mb-2">Persönlich für dich</p><h2 id="buddy-settings-title" className="text-xl font-semibold">Wähle deinen KI-Buddy</h2><p className="bb-muted mt-2">Du kannst jederzeit wechseln. Wissen und Funktionen sind bei beiden gleich.</p></div>
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(BUDDIES).map(([id, option]) => <button key={id} type="button" aria-pressed={draft.avatarId === id} onClick={() => setDraft(previous => ({ ...previous, gender: option.gender, avatarId: id }))} className={`text-left rounded-2xl overflow-hidden relative ${draft.avatarId === id ? 'ring-2 ring-cyan-300 bg-cyan-400/10' : 'bg-white/5'}`}>
        <img src={option.portrait} alt={`${option.name}, ${option.gender === 'female' ? 'weiblicher' : 'männlicher'} KI-Buddy`} className="w-full aspect-[4/3] object-cover object-top"/>
        <div className="p-3"><span className="font-semibold flex items-center gap-2">{option.name}{draft.avatarId === id && <Check size={16} className="text-cyan-300"/>}</span><span className="text-xs text-slate-300 block mt-1">{option.description}</span></div>
      </button>)}
    </div>
    <div className="grid sm:grid-cols-2 gap-5">
      <label className="bb-settings-field">Stimme<select value={draft.voiceId} onChange={e => set('voiceId', e.target.value)}><option value="male">Daniel</option><option value="female">Matilda (Ultimate)</option></select><span className="text-xs text-slate-400">Die bestehende Audio-Freigabe deines Tarifs gilt weiterhin. Ohne Ultimate wird Daniel verwendet.</span></label>
      <label className="bb-settings-field">Tonalität<select value={draft.tone} onChange={e => set('tone', e.target.value)}><option value="friendly">Freundlich</option><option value="direct">Direkt</option><option value="casual">Locker</option><option value="professional">Professionell</option><option value="motivating">Motivierend</option></select></label>
      <label className="bb-settings-field">Antwortlänge<select value={draft.detail} onChange={e => set('detail', e.target.value)}>{DETAIL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><span className="text-xs text-slate-400">Dein Tarif bestimmt die Obergrenze; diese Einstellung verschiebt die Länge innerhalb davon.</span></label>
      <label className="bb-settings-field">Sprachgeschwindigkeit: {draft.speed.toFixed(1)}×<input type="range" min="0.8" max="1.2" step="0.1" value={draft.speed} onChange={e => set('speed', Number(e.target.value))}/></label>
      <label className="bb-secondary cursor-pointer"><Volume2 size={20}/><span className="flex-1">Voice-Buddy aktivieren</span><input type="checkbox" className="w-5 h-5 accent-cyan-400" checked={draft.voiceEnabled} onChange={e => set('voiceEnabled', e.target.checked)}/></label>
    </div>
    {!canSave && <p className="bb-muted">Melde dich an, um deinen Buddy auf allen Geräten zu verwenden.</p>}
    <button type="button" className="bb-action" disabled={!canSave || saving} onClick={submit}>{saving ? 'Wird gespeichert …' : 'Buddy speichern'}</button>
  </section>;
}
