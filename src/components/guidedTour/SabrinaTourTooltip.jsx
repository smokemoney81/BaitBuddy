import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/LanguageContext';
import { speakWithFallback, cancelElevenLabs } from '@/components/utils/elevenLabsTTS';

/**
 * SabrinaTourTooltip: Interaktive Tour-Schritt-Anzeige mit Avatar
 * - Sabrinas realistischer Avatar (Foto)
 * - Erklärtext für aktuellen Schritt
 * - Navigation (Prev/Next/Skip/Complete)
 * - TTS-Unterstützung via ElevenLabs
 * - Smart Positioning: versucht unter dem Element zu sitzen, weicht aus
 */
export default function SabrinaTourTooltip({
  step: _step,
  title,
  content,
  currentIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onComplete,
  targetRef,
  isVisible,
}) {
  const { language } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = React.useRef(null);

  // Berechne Tooltip-Position basierend auf Target-Element
  const calculatePosition = () => {
    if (!targetRef?.current) return { top: 0, left: 0 };

    const rect = targetRef.current.getBoundingClientRect();
    const tooltipWidth = 360; // maxw-sm
    const tooltipHeight = 280; // ungefähre Höhe

    let top = rect.bottom + 20; // unter dem Element
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Prüfe ob außerhalb des Viewports
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }

    // Wenn zu weit unten, position oben
    if (top + tooltipHeight > window.innerHeight - 20) {
      top = rect.top - tooltipHeight - 20;
    }

    return { top, left };
  };

  // Aktualisiere Position bei Fenster-Resize oder Target-Änderung
  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      setPosition(calculatePosition());
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, targetRef]);

  // TTS-Abspielen
  const handlePlayAudio = async () => {
    if (isPlaying) {
      cancelElevenLabs();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    try {
      const text = `${title}. ${content}`;
      await speakWithFallback(text, { voiceEnabled: true, rate: 1.0 });
    } catch (error) {
      console.error('[SabrinaTourTooltip] TTS Error:', error);
    } finally {
      setIsPlaying(false);
    }
  };

  const progress = ((currentIndex + 1) / totalSteps) * 100;
  const isLastStep = currentIndex === totalSteps - 1;
  const isFirstStep = currentIndex === 0;

  const labels = {
    de: { next: 'Weiter', prev: 'Zurück', skip: 'Überspringen', done: 'Fertig' },
    en: { next: 'Next', prev: 'Previous', skip: 'Skip', done: 'Done' },
  };
  const label = labels[language] || labels.de;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 50,
          }}
          className="w-96 max-w-sm"
        >
          {/* Glas-Morphismus Container */}
          <div className="relative bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden">
            {/* Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="p-5 pt-6">
              {/* Close Button */}
              <button
                type="button"
                onClick={onSkip}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-700/50 transition-colors z-10"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>

              <div className="flex gap-4">
                {/* Sabrinas Avatar */}
                <div className="flex-shrink-0">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring', damping: 20 }}
                    className="w-16 h-16 rounded-full overflow-hidden border-2 border-cyan-500/50 shadow-lg bg-slate-800"
                  >
                    <img
                      src="/assets/sabrina-realistic-avatar.jpg"
                      alt="Sabrina Tour Guide"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback auf Platzhalter-Gradient wenn Bild fehlt
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement.style.background = 'linear-gradient(135deg, rgb(6, 182, 212), rgb(13, 110, 253))';
                      }}
                    />
                  </motion.div>
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white mb-1 line-clamp-2">
                    {title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                    {content}
                  </p>

                  {/* Audio Button */}
                  <button
                    type="button"
                    onClick={handlePlayAudio}
                    disabled={isPlaying}
                    className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 transition-all disabled:opacity-50"
                  >
                    {isPlaying ? (
                      <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-cyan-400" />
                    )}
                    <span className="text-cyan-400">
                      {isPlaying ? 'Spricht...' : 'Anhören'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Progress Dots */}
              <div className="flex justify-center gap-1 mt-4 mb-4">
                {Array.from({ length: totalSteps }).map((_, idx) => (
                  <motion.div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === currentIndex
                        ? 'w-6 bg-cyan-500'
                        : idx < currentIndex
                          ? 'w-1.5 bg-emerald-500'
                          : 'w-1.5 bg-slate-700'
                    }`}
                    layoutId={`dot-${idx}`}
                  />
                ))}
              </div>

              {/* Step Counter */}
              <div className="text-center text-xs text-slate-500 mb-4">
                {currentIndex + 1} / {totalSteps}
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={onPrev}
                  disabled={isFirstStep}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs border-slate-700 hover:bg-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft className="w-3 h-3 mr-1" />
                  {label.prev}
                </Button>

                <Button
                  onClick={onSkip}
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-8 text-xs text-slate-400 hover:text-slate-300"
                >
                  {label.skip}
                </Button>

                <Button
                  onClick={isLastStep ? onComplete : onNext}
                  className="flex-1 h-8 text-xs bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-700 hover:to-emerald-700 shadow-lg"
                >
                  {isLastStep ? label.done : label.next}
                  {!isLastStep && <ChevronRight className="w-3 h-3 ml-1" />}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
