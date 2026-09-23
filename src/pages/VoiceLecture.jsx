import { useState, useRef } from 'react';
import { useElevenLabsVoice } from '@/hooks/useElevenLabsVoice';
import { functions } from '@/api/frontendClient';
import PremiumGuard from '@/components/premium/PremiumGuard';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

const LECTURE_TOPICS = [
  {
    id: 'grundlagen',
    title: 'Angelgrundlagen',
    description: 'Lerne die Grundlagen des Angelns - Ruten, Rollen und Techniken',
    prompt: 'Erkläre die Grundlagen des Angelns für Anfänger. Behandle: 1) Arten von Angelruten und Rollen, 2) Verschiedene Angeltechniken (Spinnfischen, Fliegenfischen, Grundangeln), 3) Wichtige Ausrüstung und deren Verwendung. Antworte auf Deutsch in 3-5 Minuten Redetext.',
  },
  {
    id: 'fischarten',
    title: 'Europäische Fischarten',
    description: 'Erfahre mehr über die wichtigsten Fischarten in Europa',
    prompt: 'Stelle die wichtigsten Süßwasserfischarten in Europa vor: Hecht, Barsch, Forelle, Karpfen, Zander. Für jede Art: Lebensraum, beste Angelzeit, passende Köder, Größe/Gewicht. Antworte auf Deutsch in 3-5 Minuten Redetext.',
  },
  {
    id: 'schonzeiten',
    title: 'Schonzeiten & Mindestmaße',
    description: 'Schütze den Fischbestand und beachte die Regelungen',
    prompt: 'Erkläre Schonzeiten und Mindestmaße für Fische. Behandle: 1) Warum es Schonzeiten gibt, 2) Unterschiede in verschiedenen Bundesländern, 3) Wichtige Arten und ihre Regeln, 4) Strafen bei Verstößen. Antworte auf Deutsch in 3-5 Minuten Redetext.',
  },
  {
    id: 'koeder',
    title: 'Köder & Köderführung',
    description: 'Wähle die richtige Köderführung für verschiedene Fische',
    prompt: 'Detaillierter Guide zu Ködern und Köderführung: 1) Lebendköder vs. Kunstköder, 2) Beste Köder für verschiedene Arten, 3) Köderführung-Techniken (Spinnmethoden, Tauchen, Zupfen), 4) Saisonale Unterschiede. Antworte auf Deutsch in 3-5 Minuten Redetext.',
  },
  {
    id: 'wetter',
    title: 'Wetter & Jahreszeiten',
    description: 'Nutze Wetterbedingungen zu deinem Vorteil',
    prompt: 'Wie beeinflussen Wetter und Jahreszeiten das Angeln? Behandle: 1) Temperatureinfluss auf Fischaktivität, 2) Wind und Luftdruck, 3) Tageszeit und Saisonalität, 4) Tipps für schwierige Bedingungen. Antworte auf Deutsch in 3-5 Minuten Redetext.',
  },
  {
    id: 'spots',
    title: 'Angelplätze finden',
    description: 'Entdecke Tipps zum Finden guter Angelplätze',
    prompt: 'Wie man gute Angelplätze findet und bewertet: 1) Gewässertypen erkennen (See, Fluss, Bach), 2) Strukturmerkmale (Kraut, Steine, Tiefe), 3) Legale Zugangsregelungen, 4) Scouting-Tipps. Antworte auf Deutsch in 3-5 Minuten Redetext.',
  },
];

export default function VoiceLecture() {
  return (
    <PremiumGuard requiredPlan="basic" feature="Voice Lecture">
      <VoiceLectureInner />
    </PremiumGuard>
  );
}

function VoiceLectureInner() {
  useFeatureTracking('voice_lecture');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [lectureContent, setLectureContent] = useState('');
  const [_isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const { speak, stop, isSpeaking } = useElevenLabsVoice();
  const waveBarsRef = useRef([4, 4, 4, 4, 4]);
  const waveIntervalRef = useRef(null);

  const startWave = () => {
    waveIntervalRef.current = setInterval(() => {
      waveBarsRef.current = [...Array(5)].map(() => Math.random() * 18 + 4);
    }, 120);
  };

  const stopWave = () => {
    clearInterval(waveIntervalRef.current);
    waveBarsRef.current = [4, 4, 4, 4, 4];
  };

  async function generateLecture(topic) {
    setIsGenerating(true);
    setError('');
    setLectureContent('');

    try {
      const res = await functions.invoke('catchgbtChat', {
        messages: [
          { role: 'user', content: topic.prompt }
        ],
        context: 'voice_lecture'
      });

      const content = res?.reply || res?.message || '';
      if (!content) {
        throw new Error('Keine Vorlesungsinhalte erhalten');
      }

      setLectureContent(content);
      setIsGenerating(false);

      // Automatisch vorlesen
      startWave();
      await speak(content, {
        onEnd: () => {
          stopWave();
          setIsLoading(false);
        },
        onError: (err) => {
          stopWave();
          setError('Fehler beim Vorlesen: ' + err.message);
          setIsLoading(false);
        }
      });
      setIsLoading(true);
    } catch (err) {
      setIsGenerating(false);
      setError(err.message || 'Fehler beim Generieren der Vorlesung');
    }
  }

  const currentTopic = LECTURE_TOPICS.find(t => t.id === selectedTopic);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060d1a',
      padding: '24px',
      color: '#e0f0ff',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#22d3c8', marginBottom: 8 }}>
            Voice Lectures
          </h1>
          <p style={{ fontSize: 14, color: '#8899aa', lineHeight: 1.6 }}>
            Lerne von erfahrenen Angelexperten. Wähle ein Thema und höre eine detaillierte Vorlesung.
          </p>
        </div>

        {!selectedTopic ? (
          // Topic Selection Grid
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            marginBottom: 32
          }}>
            {LECTURE_TOPICS.map(topic => (
              <div
                key={topic.id}
                onClick={() => {
                  setSelectedTopic(topic.id);
                  setLectureContent('');
                  setError('');
                }}
                style={{
                  background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(99, 102, 241, 0.1))',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  borderRadius: 12,
                  padding: 20,
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  hover: { background: 'rgba(124, 58, 237, 0.2)' }
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(99, 102, 241, 0.1))'}
              >
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#22d3c8', marginBottom: 8 }}>
                  {topic.title}
                </h3>
                <p style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.5 }}>
                  {topic.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          // Lecture Player
          <div style={{
            background: 'rgba(13, 26, 42, 0.6)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            borderRadius: 12,
            padding: 24,
            marginBottom: 32
          }}>
            <button type="button"
              onClick={() => {
                setSelectedTopic(null);
                stop();
                stopWave();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#22d3c8',
                cursor: 'pointer',
                fontSize: 14,
                marginBottom: 16,
                padding: '4px 0'
              }}
            >
              Zurück zu Themen
            </button>

            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#22d3c8', marginBottom: 16 }}>
              {currentTopic?.title}
            </h2>

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                color: '#fca5a5'
              }}>
                {error}
              </div>
            )}

            {!lectureContent && !isGenerating ? (
              <button type="button"
                onClick={() => generateLecture(currentTopic)}
                disabled={isGenerating}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 24px',
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.6 : 1
                }}
              >
                {isGenerating ? 'Generiere Vorlesung...' : 'Vorlesung starten'}
              </button>
            ) : (
              <div>
                {isGenerating && (
                  <div style={{
                    textAlign: 'center',
                    padding: '24px',
                    color: '#7adba0'
                  }}>
                    <div style={{ fontSize: 14, marginBottom: 12 }}>
                      Erstelle Vorlesungsinhalte...
                    </div>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {[0, 0.2, 0.4].map((delay, i) => (
                        <div
                          key={i}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#7adba0',
                            animation: `pulse 1s infinite`,
                            animationDelay: `${delay}s`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {lectureContent && (
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 12,
                      padding: '24px',
                      background: 'rgba(34, 211, 200, 0.05)',
                      borderRadius: 8,
                      marginBottom: 16
                    }}>
                      <button type="button"
                        onClick={() => isSpeaking ? stop() : speak(lectureContent)}
                        style={{
                          background: isSpeaking ? '#22d3c8' : '#0d1a2a',
                          border: '1px solid #22d3c8',
                          borderRadius: 8,
                          padding: '10px 20px',
                          color: isSpeaking ? '#060d1a' : '#22d3c8',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isSpeaking ? 'Pausieren' : 'Vorlesen'}
                      </button>
                      <div style={{ color: '#8899aa', fontSize: 12 }}>
                        {isSpeaking ? 'KI-Buddy liest vor...' : 'Klick auf Vorlesen zum Starten'}
                      </div>
                    </div>

                    <div style={{
                      background: '#0a1624',
                      border: '1px solid #111e2e',
                      borderRadius: 8,
                      padding: 16,
                      maxHeight: 400,
                      overflowY: 'auto'
                    }}>
                      <p style={{
                        fontSize: 13,
                        lineHeight: 1.8,
                        color: '#aabbd0',
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word'
                      }}>
                        {lectureContent}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
