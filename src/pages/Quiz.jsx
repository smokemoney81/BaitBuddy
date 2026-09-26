
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { User } from '@/entities/User';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Check, X, Award, Clock, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageTitle from "@/components/layout/PageTitle";
import VoiceMuteButton from "@/components/voice/VoiceMuteButton";
import { useReadAloud, buildQuestionSpeech } from "@/hooks/useReadAloud";

// Removed global QUIZ_LEVELS and question definitions as they are now embedded within QuizPage component

const QUESTION_TIME = 20; // Time in seconds for each question

// Helper to shuffle arrays
const shuffleArray = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

export default function QuizPage() {
  const [gameState, setGameState] = useState('level-selection');
  const [currentLevelData, setCurrentLevelData] = useState(null); // Stores the selected level's config
  const [currentQuestions, setCurrentQuestions] = useState([]); // Questions for the current quiz run
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null); // Index of the option chosen by the user
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0); // Count of correct answers
  const [wrongCount, setWrongCount] = useState(0); // Count of wrong answers
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [runStartTime, setRunStartTime] = useState(null);
  const [answered, setAnswered] = useState(false); // New state: true if user has answered the current question

  // useRef for the timer to manage intervals reliably
  const timerRef = useRef(null);

  // New QUIZ_LEVELS structure as per outline, with embedded and converted questions
  const quizLevelsConfig = useMemo(() => {
    // Original combined questions for conversion
    const ORIGINAL_INLINE_QUESTIONS_DE_SOURCE = [
      { "id": "de001", "level": "leicht", "category": "Fischarten", "question": "Welcher dieser Fische ist ein Raubfisch?", "answers": [{ "id": 1, "text": "Hecht", "isCorrect": true }, { "id": 2, "text": "Karpfen", "isCorrect": false }, { "id": 3, "text": "Brachse", "isCorrect": false }, { "id": 4, "text": "Rotauge", "isCorrect": false }] },
      { "id": "de002", "level": "mittel", "category": "Ausrüstung", "question": "Was bedeutet 'Wurfgewicht' bei einer Angelrute?", "answers": [{ "id": 1, "text": "Das optimale Gewicht des Köders", "isCorrect": true }, { "id": 2, "text": "Das Gewicht der Rute", "isCorrect": false }, { "id": 3, "text": "Das maximale Gewicht des Fisches", "isCorrect": false }, { "id": 4, "text": "Das Gewicht der Rolle", "isCorrect": false }] },
      { "id": "de003", "level": "profi", "category": "Technik", "question": "Was ist das 'Drop-Shot-Rig'?", "answers": [{ "id": 1, "text": "Eine Finesse-Montage, bei der der Köder über dem Blei schwebt", "isCorrect": true }, { "id": 2, "text": "Eine Montage zum Grundangeln auf Karpfen", "isCorrect": false }, { "id": 3, "text": "Eine spezielle Art des Fliegenfischens", "isCorrect": false }, { "id": 4, "text": "Eine Methode zum Schleppfischen", "isCorrect": false }] },
      { "id": "de004", "level": "ass", "category": "Biologie", "question": "Welches Sinnesorgan ist beim Zander besonders ausgeprägt und für die Jagd in trübem Wasser entscheidend?", "answers": [{ "id": 1, "text": "Das Seitenlinienorgan", "isCorrect": true }, { "id": 2, "text": "Der Geruchssinn", "isCorrect": false }, { "id": 3, "text": "Das Gehör", "isCorrect": false }, { "id": 4, "text": "Die Augen (Restlichtverstärker)", "isCorrect": false }] }
    ];

    const NEW_INLINE_QUESTIONS_DE_SOURCE = [
      { question: "Welcher Knoten ist ideal, um eine Hauptschnur mit einem Vorfach zu verbinden?", answers: ["Albright-Knoten", "Grinner-Knoten", "Palomar-Knoten", "Blutknoten"], correct: "Albright-Knoten", category: "Knoten" },
      { question: "Was ist das Mindestmaß für Hecht in den meisten deutschen Bundesländern?", answers: ["50cm", "60cm", "45cm", "70cm"], correct: "50cm", category: "Regeln" },
      { question: "Welche Funktion hat ein Bissanzeiger?", answers: ["Fisch anlocken", "Biss signalisieren", "Schnur entwirren", "Köder auswerfen"], correct: "Biss signalisieren", category: "Ausrüstung" },
      { question: "Was bedeutet 'C&R'?", answers: ["Catch & Release", "Come & Relax", "Cast & Retrieve", "Carp & Roach"], correct: "Catch & Release", category: "Technik" },
      { question: "Welcher Fisch wird oft als 'König der Flüsse' bezeichnet?", answers: ["Lachs", "Huchen", "Barbe", "Forelle"], correct: "Huchen", category: "Fischkunde" },
      { question: "Was ist eine 'Pose'?", answers: ["Ein künstlicher Köder", "Ein Schwimmer", "Eine spezielle Angelrute", "Ein Gewicht"], correct: "Ein Schwimmer", category: "Ausrüstung" },
      { question: "Welche Jahreszeit gilt als beste für das Hechtangeln?", answers: ["Frühling & Herbst", "Nur Sommer", "Nur Winter", "Ganzjährig gleich"], correct: "Frühling & Herbst", category: "Saisonal" },
    ];

    const allConvertedQuestions = [];

    // Convert ORIGINAL_INLINE_QUESTIONS_DE_SOURCE to new format
    ORIGINAL_INLINE_QUESTIONS_DE_SOURCE.forEach(q => {
      const options = q.answers.map(a => a.text);
      const originalCorrectText = q.answers.find(a => a.isCorrect)?.text;
      const shuffledOptions = shuffleArray([...options]);
      const correctIndex = originalCorrectText ? shuffledOptions.indexOf(originalCorrectText) : -1;

      allConvertedQuestions.push({
        id: q.id,
        level: q.level, // Keep original level for initial categorization
        category: q.category,
        question: q.question,
        options: shuffledOptions,
        correct: correctIndex
      });
    });

    // Convert NEW_INLINE_QUESTIONS_DE_SOURCE to new format
    let currentQuestionIdCounter = 100;
    NEW_INLINE_QUESTIONS_DE_SOURCE.forEach(q => {
      const options = q.answers;
      const originalCorrectText = q.correct;
      const shuffledOptions = shuffleArray([...options]);
      const correctIndex = originalCorrectText ? shuffledOptions.indexOf(originalCorrectText) : -1;

      allConvertedQuestions.push({
        id: `de${currentQuestionIdCounter++}`,
        level: 'dynamic', // Placeholder for new questions to be distributed
        category: q.category,
        question: q.question,
        options: shuffledOptions,
        correct: correctIndex
      });
    });

    // Categorize questions into new levels
    const einsteigerPool = allConvertedQuestions.filter(q => q.level === 'leicht');
    const fortgeschrittenPool = allConvertedQuestions.filter(q => q.level === 'mittel');
    const profiPool = allConvertedQuestions.filter(q => q.level === 'profi' || q.level === 'ass');
    const dynamicPool = allConvertedQuestions.filter(q => q.level === 'dynamic');

    // Distribute dynamic questions evenly, prioritizing levels with fewer questions
    dynamicPool.forEach(q => {
      if (einsteigerPool.length <= fortgeschrittenPool.length && einsteigerPool.length <= profiPool.length) {
          einsteigerPool.push(q);
      } else if (fortgeschrittenPool.length <= profiPool.length) {
          fortgeschrittenPool.push(q);
      } else {
          profiPool.push(q);
      }
    });

    // Shuffle questions within each pool once for a random base order
    const getLevelQuestions = (pool) => shuffleArray([...pool]);

    return [
      {
        name: "Einsteiger",
        key: "einsteiger", // Internal key for level identification
        description: "Grundlagen des Angelns",
        pointsPerCorrectAnswer: 100, // Fixed 100 points as per outline
        color: 'bg-green-500', // Re-introducing colors for UI
        questions: getLevelQuestions(einsteigerPool)
      },
      {
        name: "Fortgeschritten",
        key: "fortgeschritten",
        description: "Erweiterte Angeltechniken",
        pointsPerCorrectAnswer: 100,
        color: 'bg-yellow-500',
        questions: getLevelQuestions(fortgeschrittenPool)
      },
      {
        name: "Profi",
        key: "profi",
        description: "Expertenwissen für erfahrene Angler",
        pointsPerCorrectAnswer: 100,
        color: 'bg-red-500',
        questions: getLevelQuestions(profiPool)
      }
    ];
  }, []);

  // Effect for loading user data on component mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const userData = await User.me();
        setUser(userData);
      } catch (error) {
        console.debug('Quiz: Benutzer nicht verfügbar (nicht eingeloggt):', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Callback to handle quiz end and save results
  const handleQuizEnd = useCallback(async () => {
    const durationSec = Math.round((Date.now() - runStartTime) / 1000);
    const newRun = {
      date: new Date().toISOString(),
      level: currentLevelData.key,
      correct: correctCount,
      wrong: wrongCount,
      durationSec,
      score: score,
    };

    try {
        if (user) {
          const updatedUserData = {
              quiz_points: (user.quiz_points || 0) + score,
              quiz_runs: [...(user.quiz_runs || []), newRun]
          };
          await User.updateMyUserData(updatedUserData);
          setUser(prev => ({...prev, ...updatedUserData}));
        } else {
            console.warn("User data not available, cannot save quiz progress.");
        }
    } catch (error) {
        console.error('Quiz: Fortschritt konnte nicht gespeichert werden:', error);
    }
    setGameState('results');
  }, [correctCount, wrongCount, currentLevelData, runStartTime, score, user]);

  // Function to start a new quiz
  const startQuiz = (levelConfig) => {
    // Shuffle the questions for the chosen level for this specific quiz run
    const shuffledLevelQuestions = shuffleArray([...levelConfig.questions]);

    if (shuffledLevelQuestions.length === 0) {
      toast.error("Für dieses Level sind keine Fragen verfügbar. Bitte wähle ein anderes Level.");
      return;
    }

    setCurrentLevelData(levelConfig);
    setCurrentQuestions(shuffledLevelQuestions);
    setQuestionIndex(0);
    setScore(0);
    setCorrectCount(0);
    setWrongCount(0);
    setSelectedOptionIndex(null);
    setAnswered(false); // Reset answered state for the first question
    setTimeLeft(QUESTION_TIME);
    setRunStartTime(Date.now());
    setGameState('playing');
  };

  // Function to handle answer selection as per outline
  const handleAnswer = useCallback((selectedIndex) => {
    if (answered) return; // Prevent multiple answers for the same question

    // Clear the main countdown timer when an answer is selected
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setAnswered(true);
    setSelectedOptionIndex(selectedIndex);

    const currentQuestion = currentQuestions[questionIndex];
    const isCorrect = selectedIndex === currentQuestion.correct;

    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
      setScore(prev => prev + currentLevelData.pointsPerCorrectAnswer); // Use points from level config
    } else {
      setWrongCount(prev => prev + 1);
    }

    // Wait for 2 seconds before moving to the next question or ending the quiz
    setTimeout(() => {
      if (questionIndex < currentQuestions.length - 1) {
        setQuestionIndex(prev => prev + 1);
        setSelectedOptionIndex(null);
        setAnswered(false); // Reset for next question
        setTimeLeft(QUESTION_TIME); // Reset timer for next question
      } else {
        handleQuizEnd(); // End of Quiz
      }
    }, 2000); // 2 seconds delay as per outline
  }, [answered, currentQuestions, questionIndex, currentLevelData, handleQuizEnd]);

  // Effect for the question countdown timer
  useEffect(() => {
    // Don't run timer if not playing, or if an answer has already been given (handleAnswer's setTimeout takes over)
    if (gameState !== 'playing' || answered) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // If time runs out and no answer was selected
    if (timeLeft === 0) {
      setWrongCount(prev => prev + 1); // Increment wrong answers (unanswered questions count as wrong)
      // No score awarded for unanswered questions

      // Auto-advance to the next question or end the quiz
      if (questionIndex < currentQuestions.length - 1) {
        setQuestionIndex(prev => prev + 1);
        setSelectedOptionIndex(null);
        setAnswered(false);
        setTimeLeft(QUESTION_TIME);
      } else {
        handleQuizEnd();
      }
      return;
    }

    // Start or continue the countdown timer
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    // Cleanup function to clear the interval when component unmounts or dependencies change
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameState, answered, currentQuestions.length, questionIndex, handleQuizEnd]);

  // Memoize current question for efficient rendering
  const currentQuestion = useMemo(() => {
    return currentQuestions[questionIndex];
  }, [currentQuestions, questionIndex]);

  // Vorlesen: Frage mit allen Antworten, nach dem Antworten die Auflösung.
  const speechText = useMemo(() => {
    if (gameState !== 'playing' || !currentQuestion) return '';
    if (answered) {
      return selectedOptionIndex === currentQuestion.correct
        ? 'Richtig!'
        : `Leider falsch. Richtig ist: ${currentQuestion.options[currentQuestion.correct]}.`;
    }
    return buildQuestionSpeech({
      index: questionIndex,
      total: currentQuestions.length,
      question: currentQuestion.question,
      answers: currentQuestion.options,
    });
  }, [gameState, currentQuestion, answered, selectedOptionIndex, questionIndex, currentQuestions.length]);
  useReadAloud(speechText);

  if (isLoading) {
    return <div className="p-8 text-center"><LoadingSpinner /></div>;
  }

  // Display message if no quiz levels are configured (should not happen with embedded data)
  if (quizLevelsConfig.length === 0 && !isLoading) {
      return (
          <div className="p-8 max-w-2xl mx-auto text-center">
              <div className="bb-card">
                  <div className="bb-form-title text-white">Keine Quizfragen gefunden</div>
                  <div className="grid gap-4 mt-4">
                      <p style={{ color: 'var(--bb-muted)' }} className="mb-4">Der Fragenkatalog ist leer. Es gab ein Problem beim Laden der eingebetteten Fragen.</p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="p-4 sm:p-8">
      <AnimatePresence mode="wait">
        {gameState === 'level-selection' && (
          <motion.div key="level-selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="max-w-2xl mx-auto">
              <PageTitle className="mb-6" title="Angel-Quiz Zeit!" subtitle="Wähle deinen Schwierigkeitsgrad und sammle Punkte." />
              <div className="flex justify-end mb-4"><VoiceMuteButton /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quizLevelsConfig.map((level, index) => (
                  <div key={level.key || index} className="bb-card hover:border-emerald-500/50 transition-all">
                    <div className="p-6">
                      <h3 className="text-xl font-semibold text-white mb-2">{level.name}</h3>
                      <p className="mb-2" style={{ color: 'var(--bb-muted)' }}>{level.description}</p>
                      <p className="mb-4" style={{ color: 'var(--bb-muted)' }}>Fragen: {level.questions.length} - Punkte/Frage: {level.pointsPerCorrectAnswer}</p>
                      <button onClick={() => startQuiz(level)} className={`bb-action ${level.color} w-full text-white`}>
                        Start
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'playing' && currentQuestion && (
          <motion.div key="playing" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="max-w-2xl mx-auto">
            <div className="bb-card">
              <div>
                <div className="flex justify-between items-center">
                  <span className={`bb-pill-info ${currentLevelData?.color || 'bg-gray-500'} text-white`}>{currentLevelData?.name}</span>
                  <div className="flex items-center gap-3">
                    <VoiceMuteButton />
                    <div className="flex items-center gap-2 font-mono text-lg text-white">
                      <Clock size={20} /> {timeLeft}s
                    </div>
                  </div>
                </div>
                <Progress value={(questionIndex / currentQuestions.length) * 100} className="mt-4" />
                <p className="text-sm text-center mt-2" style={{ color: 'var(--bb-muted)' }}>Frage {questionIndex + 1} von {currentQuestions.length}</p>
              </div>
              <div className="grid gap-4 mt-4 text-center">
                <h2 className="text-xl md:text-2xl font-semibold text-white mb-8">{currentQuestion.question}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                  {currentQuestion.options.map((option, idx) => {
                    let buttonStyle = { background: 'rgba(0,0,0,.25)', border: '1px solid var(--bb-border)' };
                    if (answered) {
                        if (idx === currentQuestion.correct) {
                            buttonStyle = { background: 'rgba(34,197,94,0.8)', border: '1px solid #4ade80', color: '#fff' };
                        } else if (idx === selectedOptionIndex) {
                            buttonStyle = { background: 'rgba(239,68,68,0.8)', border: '1px solid #f87171', color: '#fff' };
                        }
                    }
                    return (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            disabled={answered}
                            className="h-auto p-4 rounded-xl text-white text-base justify-start text-left whitespace-normal"
                            style={buttonStyle}
                        >
                            {option}
                        </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'results' && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto text-center">
            <div className="bb-card">
                <div className="bb-form-title text-3xl font-bold text-white flex items-center justify-center gap-3">
                    <Award size={32} style={{ color: '#fbbf24' }} /> Ergebnis
                </div>
                <div className="grid gap-4 mt-4">
                    <p className="text-2xl font-bold mb-4" style={{ color: '#34d399' }}>+{score} Punkte</p>
                    <div className="grid grid-cols-2 gap-4 text-left mb-8 p-4 rounded-xl" style={{ color: '#d1d5db', background: 'rgba(0,0,0,.25)' }}>
                        <div className="flex items-center gap-2"><Check size={20} style={{ color: '#22c55e' }} /> Richtig: {correctCount}</div>
                        <div className="flex items-center gap-2"><X size={20} style={{ color: '#ef4444' }} /> Falsch: {wrongCount}</div>
                        <div className="flex items-center gap-2"><Clock size={20} style={{ color: '#3b82f6' }} /> Zeit: {Math.round((Date.now() - runStartTime) / 1000)}s</div>
                        <div className="flex items-center gap-2"><Award size={20} style={{ color: '#f59e0b' }} /> Gesamtpunkte: {user?.quiz_points || 0}</div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={() => setGameState('level-selection')} className="bb-secondary w-full">
                            Neue Runde
                        </button>
                        <Link to={createPageUrl("Shop")} className="w-full">
                            <button className="bb-action w-full" style={{ background: '#059669' }}>
                                <ShoppingCart size={16} className="mr-2" /> Zum Shop
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
