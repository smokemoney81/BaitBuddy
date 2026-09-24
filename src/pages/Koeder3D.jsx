import React, { useCallback, useMemo, useState } from 'react';
import { LURES, getLureById, getStyleById } from '@/data/lureGuide.data';
import LureScene from '@/components/lures3d/LureScene';
import LureControls from '@/components/lures3d/LureControls';
import LureInfoPanel from '@/components/lures3d/LureInfoPanel';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import { PHASE } from '@/components/lures3d/lureAnimator';
import PageTitle from "@/components/layout/PageTitle";

// Status-Text zur aktuellen Animationsphase — erklärt beim Zuschauen,
// was der Köder gerade macht und wann der Biss zu erwarten ist.
function phaseLabel(phaseInfo, styleParams) {
  if (!phaseInfo) return null;
  const { phase, behavior } = phaseInfo;
  if (behavior === 'jig') {
    return phase === PHASE.PULL
      ? 'Rutenschlag: Der Köder springt vom Grund auf'
      : 'Absinkphase an gespannter Schnur: Jetzt kommt der Biss';
  }
  if (behavior === 'surface') {
    return phase === PHASE.PULL
      ? 'Schlag mit der Rutenspitze'
      : 'Gleitphase: Schnur locker lassen';
  }
  if (!styleParams?.pullDuration) {
    return 'Gleichmäßiges Einholen';
  }
  if (phase === PHASE.PULL) return 'Zugphase: Der Köder arbeitet';
  if (styleParams.riseRate) return 'Stopp: Der Köder steigt langsam auf';
  if (styleParams.sinkRate) return 'Kurbelstopp: Der Köder flattert ab';
  return 'Pause';
}

export default function Koeder3D() {
  useFeatureTracking('lure_3d');

  const [lureId, setLureId] = useState(LURES[0].id);
  const [styleId, setStyleId] = useState(LURES[0].styles[0].id);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [resetCameraSignal, setResetCameraSignal] = useState(0);
  const [phaseInfo, setPhaseInfo] = useState(null);

  const lure = useMemo(() => getLureById(lureId), [lureId]);
  const style = useMemo(() => getStyleById(lure, styleId), [lure, styleId]);

  const handleSelectLure = useCallback((id) => {
    const next = getLureById(id);
    if (!next) return;
    setLureId(id);
    setStyleId(next.styles[0].id);
    setPhaseInfo(null);
  }, []);

  const handleSelectStyle = useCallback((id) => {
    setStyleId(id);
    setPhaseInfo(null);
  }, []);

  const statusText = phaseLabel(phaseInfo, style?.params);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-32">
      <header>
        <PageTitle title="3D-Köder Führung" subtitle="Laufverhalten live erleben: Köder wählen, Führungsstil starten und die Bewegung unter Wasser aus jedem Winkel ansehen." />
      </header>

      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-950 md:aspect-auto md:h-[60vh]">
        <LureScene
          modelKey={lure?.model}
          styleParams={style?.params}
          speed={speed}
          paused={paused}
          resetCameraSignal={resetCameraSignal}
          onPhaseChange={setPhaseInfo}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          {statusText && (
            <span
              className="w-fit rounded-full bg-gray-900/85 px-3 py-1 text-xs font-medium text-cyan-200"
              aria-live="polite"
            >
              {statusText}
            </span>
          )}
          <span className="w-fit rounded-full bg-gray-900/70 px-3 py-1 text-xs text-gray-400">
            Ziehen zum Drehen, Pinch oder Scrollen zum Zoomen
          </span>
        </div>
      </div>

      <LureControls
        lures={LURES}
        selectedLureId={lureId}
        onSelectLure={handleSelectLure}
        selectedStyleId={styleId}
        onSelectStyle={handleSelectStyle}
        speed={speed}
        onSpeedChange={setSpeed}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        onResetCamera={() => setResetCameraSignal((n) => n + 1)}
      />

      <LureInfoPanel lure={lure} style={style} />
    </div>
  );
}
