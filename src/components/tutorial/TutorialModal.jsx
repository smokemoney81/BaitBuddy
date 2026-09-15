import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Volume2, Loader2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/LanguageContext';
import { speakWithFallback, cancelElevenLabs } from '@/components/utils/elevenLabsTTS';
import { tutorialSteps } from './tutorialSteps';

export default function TutorialModal({ isOpen, onClose }) {
  const { language } = useLanguage();
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingStep, setPlayingStep] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  const steps = tutorialSteps[language] || tutorialSteps.de;

  const handleNext = () => {
    if (isPlaying) {
      cancelElevenLabs();
      setIsPlaying(false);
      setPlayingStep(null);
    }
    if (currentStep < steps.length - 1) {
      setImageFailed(false);
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (isPlaying) {
      cancelElevenLabs();
      setIsPlaying(false);
      setPlayingStep(null);
    }
    if (currentStep > 0) {
      setImageFailed(false);
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePlayAudio = async (stepIndex) => {
    if (isPlaying) {
      cancelElevenLabs();
      setIsPlaying(false);
      setPlayingStep(null);
      return;
    }

    setIsPlaying(true);
    setPlayingStep(stepIndex);

    try {
      const step = steps[stepIndex];
      const text = `${step.title}. ${step.content}`;

      // Natürliche ElevenLabs-Stimme (multilingual, spricht auch Englisch);
      // löst auf, wenn die Wiedergabe endet, bleibt bei Fehlern still.
      await speakWithFallback(text, { voiceEnabled: true, rate: 1.0 });
    } catch (error) {
      console.error('[Tutorial TTS] Error:', error);
    } finally {
      setIsPlaying(false);
      setPlayingStep(null);
    }
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-full max-w-lg bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden"
        >
          <button type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-gray-800/90 hover:bg-gray-700 transition-colors shadow-lg"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-800">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 via-emerald-500 to-cyan-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="p-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {/* Faellt ein Bild aus, blieb vorher ein leerer Rahmen mit
                    kaputtem Icon stehen. Der Schritt traegt auch ohne Bild:
                    Text und Sprachausgabe bleiben vollstaendig. */}
                {!imageFailed && (
                  <div className="mb-3 rounded-xl overflow-hidden shadow-lg bg-gray-950 border border-gray-800">
                    <img
                      src={currentStepData.image}
                      alt={currentStepData.title}
                      className="w-full h-44 object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={() => setImageFailed(true)}
                    />
                  </div>
                )}

                {currentStepData.route && (
                  <Link
                    to={createPageUrl(currentStepData.route)}
                    onClick={() => {
                      cancelElevenLabs();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-4 decoration-cyan-500/40 mb-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {language === 'en' ? 'Open this page' : 'Diese Seite oeffnen'}
                  </Link>
                )}

                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    {currentStepData.title}
                  </h2>
                  <button type="button"
                    onClick={() => handlePlayAudio(currentStep)}
                    disabled={isPlaying}
                    className="ml-3 p-2 rounded-full bg-cyan-600/20 hover:bg-cyan-600/30 transition-all disabled:opacity-50 border border-cyan-500/30 flex-shrink-0"
                    title="Text vorlesen"
                  >
                    {isPlaying && playingStep === currentStep ? (
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </button>
                </div>

                <p className="text-gray-300 text-sm leading-relaxed mb-3 min-h-[72px]">
                  {currentStepData.content}
                </p>

                <div className="flex items-center justify-center gap-1 mb-2">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 rounded-full transition-all ${
                        index === currentStep 
                          ? 'w-5 bg-cyan-500' 
                          : index < currentStep
                          ? 'w-1.5 bg-emerald-500'
                          : 'w-1.5 bg-gray-700'
                      }`}
                    />
                  ))}
                </div>

                <div className="text-center text-xs text-gray-500 mb-2">
                  {currentStep + 1} / {steps.length}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between pt-2 gap-3">
              <Button
                onClick={handlePrev}
                disabled={currentStep === 0}
                variant="outline"
                className="flex-1 h-9 text-sm border-gray-700 hover:bg-gray-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Zurück
              </Button>

              {currentStep === steps.length - 1 ? (
                <Button
                  onClick={onClose}
                  className="flex-1 h-9 text-sm bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 shadow-lg"
                >
                  Tutorial beenden
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="flex-1 h-9 text-sm bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-700 hover:to-emerald-700 shadow-lg"
                >
                  Weiter
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}