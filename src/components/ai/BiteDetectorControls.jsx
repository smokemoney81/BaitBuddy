import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BiteDetectorControls({
  running,
  kLine,
  kTip,
  lockTime,
  onStartStop,
  onRoiDraw,
  onLineChange,
  onTipChange,
  onLockTimeChange
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Camera & ROI Controls */}
      <div className="space-y-4">
        <Button
          onClick={onStartStop}
          className={running ? 'bb-sos-btn w-full min-h-[52px] text-base' : 'bb-action bb-action-block'}
          aria-label={running ? 'Bissanzeiger stoppen und Kamera-Stream beenden' : 'Kamera starten und Bissanzeiger aktivieren'}
          aria-pressed={running}
        >
          {running ? 'Bissanzeiger stoppen' : 'Bissanzeiger starten'}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => onRoiDraw('line')}
            disabled={!running}
            className="text-cyan-400 border-cyan-400/50 active:scale-95 active:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50 min-h-[44px]"
            aria-label="Klicken und ziehen zum Markieren der Angelschnur-Region fuer Bissanzeige"
            aria-pressed={false}
          >
            ROI Schnur
          </Button>
          <Button
            variant="outline"
            onClick={() => onRoiDraw('tip')}
            disabled={!running}
            className="text-yellow-400 border-yellow-400/50 active:scale-95 active:bg-yellow-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 disabled:opacity-50 min-h-[44px]"
            aria-label="Klicken und ziehen zum Markieren der Rutenspitze-Region fuer Bissanzeige"
            aria-pressed={false}
          >
            ROI Spitze
          </Button>
        </div>
      </div>

      {/* Sensitivity Settings */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-2" htmlFor="line-sensitivity">
            Schnur-Empfindlichkeit: {kLine.toFixed(1)}
          </label>
          <Input
            id="line-sensitivity"
            type="range"
            min="1.5"
            max="5"
            step="0.1"
            value={kLine}
            onChange={(e) => onLineChange(parseFloat(e.target.value))}
            className="bg-gray-800/50 border-gray-700 min-h-[44px]"
            aria-valuemin={1.5}
            aria-valuemax={5}
            aria-valuenow={kLine}
            aria-label="Schnur-Empfindlichkeit anpassen (1.5 bis 5)"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2" htmlFor="tip-sensitivity">
            Spitzen-Empfindlichkeit: {kTip.toFixed(1)}
          </label>
          <Input
            id="tip-sensitivity"
            type="range"
            min="1.5"
            max="5"
            step="0.1"
            value={kTip}
            onChange={(e) => onTipChange(parseFloat(e.target.value))}
            className="bg-gray-800/50 border-gray-700 min-h-[44px]"
            aria-valuemin={1.5}
            aria-valuemax={5}
            aria-valuenow={kTip}
            aria-label="Rutenspitze-Empfindlichkeit anpassen (1.5 bis 5)"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-2" htmlFor="alarm-locktime">
            Alarm-Sperrzeit: {lockTime.toFixed(1)}s
          </label>
          <Input
            id="alarm-locktime"
            type="range"
            min="1"
            max="8"
            step="0.5"
            value={lockTime}
            onChange={(e) => onLockTimeChange(parseFloat(e.target.value))}
            className="bg-gray-800/50 border-gray-700 min-h-[44px]"
            aria-valuemin={1}
            aria-valuemax={8}
            aria-valuenow={lockTime}
            aria-label="Alarm-Sperrzeit in Sekunden anpassen (1 bis 8 Sekunden)"
          />
        </div>
      </div>
    </div>
  );
}