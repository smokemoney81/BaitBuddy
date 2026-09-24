import React, { useState, useEffect } from "react";
import { GraduationCap, MapPin, ArrowLeft, Check, X, Trophy, Target, Clock, Sparkles, Wrench, BookOpen, AlertTriangle, Play, Fish } from "lucide-react";
import { motion } from "framer-motion";
import RodBuilderGame from "@/components/exam/RodBuilderGame";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { isInClosedSeason } from "@/lib/closedSeason";

export default function AngelscheinPruefungSchonzeiten() {
  useFeatureTracking("angelschein_pruefung");
  const [selectedRegion, setSelectedRegion] = useState("Baden-Württemberg");
  const [examStarted, setExamStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3600);
  const [showGame, setShowGame] = useState(false);
  const [rules, setRules] = useState([]);
  const [_user, setUser] = useState(null);
  const [revealedExplanations, setRevealedExplanations] = useState({});

  const bundeslaender = [
    "Baden-Württemberg",
    "Bayern",
    "Berlin",
    "Brandenburg",
    "Bremen",
    "Hamburg",
    "Hessen",
    "Mecklenburg-Vorpommern",
    "Niedersachsen",
    "Nordrhein-Westfalen",
    "Rheinland-Pfalz",
    "Saarland",
    "Sachsen",
    "Sachsen-Anhalt",
    "Schleswig-Holstein",
    "Thüringen"
  ];

  useEffect(() => {
    auth.me()
      .then(setUser)
      .catch(err => {
        console.warn('Fehler beim Laden des aktuellen Benutzers:', err);
      });
  }, []);

  useEffect(() => {
    if (examStarted && !showResults && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleFinishExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [examStarted, showResults, timeLeft]);

  useEffect(() => {
    const loadRules = async () => {
      try {
        const allRules = await entities.RuleEntry.list();
        const filteredRules = allRules.filter(r =>
          r.region === selectedRegion || r.region === "Deutschland"
        );
        setRules(filteredRules);
      } catch (error) {
        console.error("Fehler beim Laden der Regeln:", error);
      }
    };
    loadRules();
  }, [selectedRegion]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const allQuestions = await entities.ExamQuestion.list();

      if (!allQuestions || allQuestions.length === 0) {
        toast.error("Keine Prüfungsfragen in der Datenbank vorhanden!");
        setLoading(false);
        return;
      }

      let regionQuestions = allQuestions.filter(q =>
        q.region === selectedRegion || q.region === "Deutschland"
      );

      if (regionQuestions.length === 0) {
        toast.warning(`Keine Fragen für ${selectedRegion} gefunden. Verwende deutschlandweite Fragen.`);
        regionQuestions = allQuestions.filter(q => q.region === "Deutschland");
      }

      const shuffled = regionQuestions.sort(() => 0.5 - Math.random());
      const selectedQuestions = shuffled.slice(0, Math.min(30, shuffled.length));

      if (selectedQuestions.length < 10) {
        toast.error("Nicht genügend Fragen für eine Prüfung vorhanden!");
        setLoading(false);
        return;
      }

      setQuestions(selectedQuestions);
      setUserAnswers(new Array(selectedQuestions.length).fill(null));
      setExamStarted(true);
      setCurrentQuestion(0);
      setTimeLeft(3600);
      setShowResults(false);

      toast.success(`Prüfung gestartet mit ${selectedQuestions.length} Fragen!`);
    } catch (error) {
      console.error("Fehler beim Laden der Fragen:", error);
      toast.error("Fehler beim Laden der Prüfungsfragen!");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (answerIndex) => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestion] = answerIndex;
    setUserAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleFinishExam = () => {
    setShowResults(true);

    // Fragen, bei denen die Erklärung vor der Antwort aufgedeckt wurde, zählen nicht
    const scorableIndices = questions
      .map((_, i) => i)
      .filter(i => !revealedExplanations[i]);

    const correctAnswers = scorableIndices.filter(i =>
      userAnswers[i] === questions[i]?.correct_answer_index
    ).length;

    const totalScorable = scorableIndices.length || 1;
    const percentage = (correctAnswers / totalScorable) * 100;
    const passed = percentage >= 60;

    if (passed) {
      toast.success(`Bestanden! ${correctAnswers} von ${totalScorable} richtig (${percentage.toFixed(1)}%)`);
    } else {
      toast.error(`Nicht bestanden. ${correctAnswers} von ${totalScorable} richtig (${percentage.toFixed(1)}%)`);
    }
  };

  const handleRevealExplanation = () => {
    if (revealedExplanations[currentQuestion]) return;
    const ok = window.confirm(
      "Wenn du dir die Erklärung jetzt anzeigen lässt, wird diese Frage nicht gewertet (kein Punkt). Fortfahren?"
    );
    if (!ok) return;
    setRevealedExplanations(prev => ({ ...prev, [currentQuestion]: true }));
  };

  const resetExam = () => {
    setExamStarted(false);
    setCurrentQuestion(0);
    setQuestions([]);
    setUserAnswers([]);
    setShowResults(false);
    setTimeLeft(3600);
    setRevealedExplanations({});
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isCurrentlyClosedSeason = (closedFrom, closedTo) => isInClosedSeason(closedFrom, closedTo);

  return (
    <>
      {/* Schonzeiten/Mindestmaße & Angelschein-Quiz sind laut Plan Free-Funktionen. */}
      {showGame && (
        <div className="bb-page">
          <button
            onClick={() => setShowGame(false)}
            className="bb-secondary mb-6"
          >
            <ArrowLeft size={16} className="mr-2" />
            Zurück zur Prüfung
          </button>
          <RodBuilderGame />
        </div>
      )}

      {loading && (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 border-4 border-t-transparent rounded-full mx-auto mb-4"
              style={{ borderColor: 'var(--bb-cyan)', borderTopColor: 'transparent' }}
            />
            <p style={{ color: 'var(--bb-muted)' }}>Lade Prüfungsfragen...</p>
          </div>
        </div>
      )}

      {!examStarted && !loading && !showGame && (
        <div className="bb-page">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mb-8">
              <GraduationCap size={64} className="mx-auto mb-4" style={{ color: 'var(--bb-cyan)' }} />
              <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--bb-cyan)' }}>
                Angelschein-Prüfung & Schonzeiten
              </h1>
              <p style={{ color: 'var(--bb-muted)' }}>
                Bereite dich optimal auf die Fischerprüfung vor und kenne deine Regeln
              </p>
            </div>

            <div className="bb-card mb-6">
              <div className="bb-form-title flex items-center gap-2" style={{ color: 'var(--bb-cyan)' }}>
                <MapPin size={20} />
                Bundesland wählen
              </div>
              <div>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full rounded-lg px-4 py-3 focus:ring-2 focus:ring-cyan-500"
                  style={{ background: 'var(--bb-surface)', border: '1px solid var(--bb-border)', color: 'var(--bb-text)' }}
                >
                  {bundeslaender.map(land => (
                    <option key={land} value={land}>{land}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bb-card">
                <div className="pt-6">
                  <Target size={48} style={{ color: '#10b981' }} className="mb-4" />
                  <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--bb-text)' }}>Prüfungssimulation</h3>
                  <p className="mb-4" style={{ color: 'var(--bb-muted)' }}>
                    Realistische Prüfung mit 30 Fragen aus allen Kategorien
                  </p>
                  <ul className="space-y-2 text-sm mb-4" style={{ color: 'var(--bb-muted)' }}>
                    <li className="flex items-center gap-2">
                      <Check size={16} style={{ color: '#10b981' }} />
                      60 Minuten Zeitlimit
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} style={{ color: '#10b981' }} />
                      Verschiedene Schwierigkeitsgrade
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} style={{ color: '#10b981' }} />
                      Detaillierte Auswertung
                    </li>
                  </ul>
                  <button
                    onClick={loadQuestions}
                    disabled={loading}
                    className="bb-action w-full"
                    style={{ background: '#059669' }}
                  >
                    <Play size={16} className="mr-2" />
                    Prüfung starten
                  </button>
                </div>
              </div>

              <div className="bb-card">
                <div className="pt-6">
                  <Wrench size={48} style={{ color: '#a855f7' }} className="mb-4" />
                  <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--bb-text)' }}>Ruten-Bau-Spiel</h3>
                  <p className="mb-4" style={{ color: 'var(--bb-muted)' }}>
                    Lerne spielerisch den Aufbau einer Angelrute
                  </p>
                  <ul className="space-y-2 text-sm mb-4" style={{ color: 'var(--bb-muted)' }}>
                    <li className="flex items-center gap-2">
                      <Check size={16} style={{ color: '#a855f7' }} />
                      Interaktives Lernen
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} style={{ color: '#a855f7' }} />
                      Praktisches Wissen
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={16} style={{ color: '#a855f7' }} />
                      Spaß beim Lernen
                    </li>
                  </ul>
                  <button
                    onClick={() => setShowGame(true)}
                    className="bb-secondary w-full"
                    style={{ borderColor: '#a855f7', color: '#a855f7' }}
                  >
                    <Sparkles size={16} className="mr-2" />
                    Spiel starten
                  </button>
                </div>
              </div>
            </div>

            <div className="bb-card mb-6">
              <div className="bb-form-title flex items-center gap-2" style={{ color: '#f59e0b' }}>
                <BookOpen size={20} />
                Prüfungstipps
              </div>
              <div className="space-y-3" style={{ color: 'var(--bb-muted)' }}>
                <p>Lies jede Frage sorgfältig durch, bevor du antwortest</p>
                <p>Du kannst zwischen den Fragen vor und zurück navigieren</p>
                <p>Achte auf die verbleibende Zeit im oberen Bereich</p>
                <p>Zum Bestehen benötigst du mindestens 60% richtige Antworten</p>
                <p>Nach der Prüfung erhältst du eine detaillierte Auswertung</p>
              </div>
            </div>

            <div className="bb-card">
              <div className="bb-form-title flex items-center gap-2" style={{ color: '#f43f5e' }}>
                <Fish size={20} />
                Angelregeln & Schonzeiten ({selectedRegion})
              </div>
              <div className="space-y-4">
                {rules.length > 0 ? (
                  rules.map((rule, index) => (
                    <div key={index} className="p-4 rounded-lg" style={{ background: 'var(--bb-bg)', border: '1px solid var(--bb-border)' }}>
                      <h4 className="font-semibold text-lg mb-1" style={{ color: 'var(--bb-text)' }}>{rule.fish}</h4>
                      <p className="text-sm mb-1" style={{ color: 'var(--bb-muted)' }}>
                        Region: <span className="font-medium" style={{ color: 'var(--bb-cyan)' }}>{rule.region}</span>
                      </p>
                      {rule.min_size_cm && (
                        <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Mindestmaß: {rule.min_size_cm} cm</p>
                      )}
                      {rule.closed_from && rule.closed_to && (
                        <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                          Schonzeit: {rule.closed_from} bis {rule.closed_to}
                          {isCurrentlyClosedSeason(rule.closed_from, rule.closed_to) && (
                            <span className="ml-2 px-2 py-0.5 text-xs rounded-full" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
                              Aktuell Schonzeit
                            </span>
                          )}
                        </p>
                      )}
                      {rule.hook_limit && (
                        <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Hakenlimit: {rule.hook_limit}</p>
                      )}
                      {rule.notes && (
                        <p className="text-xs mt-2" style={{ color: 'var(--bb-muted)', opacity: 0.7 }}>{rule.notes}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--bb-muted)' }}>Keine spezifischen Regeln für {selectedRegion} gefunden.</p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showResults && !loading && !showGame && (() => {
        const correctAnswers = userAnswers.filter((answer, index) =>
          answer === questions[index]?.correct_answer_index
        ).length;
        const percentage = (correctAnswers / questions.length) * 100;
        const passed = percentage >= 60;

        return (
          <div className="bb-page">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="bb-card mb-6" style={{ borderWidth: '2px', borderColor: passed ? '#10b981' : '#ef4444' }}>
                <div className="flex items-center gap-3 text-2xl font-semibold mb-4">
                  {passed ? (
                    <>
                      <Trophy size={32} style={{ color: '#10b981' }} />
                      <span style={{ color: '#10b981' }}>Herzlichen Glückwunsch</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={32} style={{ color: '#ef4444' }} />
                      <span style={{ color: '#ef4444' }}>Leider nicht bestanden</span>
                    </>
                  )}
                </div>
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-6xl font-bold mb-2" style={{ color: passed ? '#10b981' : '#ef4444' }}>
                      {percentage.toFixed(1)}%
                    </div>
                    <p className="text-lg" style={{ color: 'var(--bb-muted)' }}>
                      {correctAnswers} von {questions.length} Fragen richtig beantwortet
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Allgemein", key: "allgemein" },
                      { label: "Gerätekunde", key: "geraetekunde" },
                      { label: "Gewässerkunde", key: "gewaesserkunde" },
                      { label: "Gesetzeskunde", key: "gesetzeskunde" }
                    ].map(category => {
                      const categoryQuestions = questions.filter(q => q.category === category.key);
                      const categoryCorrect = categoryQuestions.filter((q, _i) => {
                        const questionIndex = questions.indexOf(q);
                        return userAnswers[questionIndex] === q.correct_answer_index;
                      }).length;
                      const categoryPercentage = categoryQuestions.length > 0
                        ? (categoryCorrect / categoryQuestions.length) * 100
                        : 0;

                      return (
                        <div key={category.key} className="bb-stat-card text-center">
                          <div className="bb-stat-value" style={{ color: 'var(--bb-cyan)' }}>
                            {categoryPercentage.toFixed(0)}%
                          </div>
                          <div className="bb-stat-label">{category.label}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--bb-muted)', opacity: 0.6 }}>
                            {categoryCorrect}/{categoryQuestions.length}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold mb-4" style={{ color: 'var(--bb-cyan)' }}>Fragenübersicht</h3>
                    <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                      {questions.map((question, index) => {
                        const isCorrect = userAnswers[index] === question.correct_answer_index;
                        const wasAnswered = userAnswers[index] !== null;

                        return (
                          <button type="button"
                            key={index}
                            onClick={() => {
                              setCurrentQuestion(index);
                              setShowResults(false);
                              setExamStarted(true);
                            }}
                            className="aspect-square rounded-lg flex items-center justify-center font-semibold text-sm transition-all hover:scale-110"
                            style={{
                              background: isCorrect ? '#059669' : (!isCorrect && wasAnswered ? '#dc2626' : 'var(--bb-surface)'),
                              color: wasAnswered ? '#fff' : 'var(--bb-muted)',
                            }}
                          >
                            {index + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={resetExam}
                      className="bb-secondary flex-1"
                    >
                      Neue Prüfung
                    </button>
                    <button
                      onClick={() => {
                        setShowResults(false);
                        setCurrentQuestion(0);
                      }}
                      className="bb-action flex-1"
                    >
                      Antworten überprüfen
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        );
      })()}

      {!showGame && examStarted && !showResults && questions.length === 0 && (
        <div className="bb-page text-center">
          <AlertTriangle size={64} style={{ color: '#f59e0b' }} className="mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--bb-text)' }}>Keine Fragen verfügbar</h2>
          <p className="mb-6" style={{ color: 'var(--bb-muted)' }}>
            Es konnten keine Prüfungsfragen geladen werden. Bitte versuche es später erneut.
          </p>
          <button onClick={resetExam} className="bb-action">
            Zurück zur Startseite
          </button>
        </div>
      )}

      {!showGame && examStarted && !showResults && questions.length > 0 && (() => {
        const question = questions[currentQuestion];
        const progress = ((currentQuestion + 1) / questions.length) * 100;

        return (
          <div className="bb-page">
            <motion.div
              key={currentQuestion}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2" style={{ color: 'var(--bb-muted)' }}>
                  <Target size={20} style={{ color: 'var(--bb-cyan)' }} />
                  <span className="font-semibold">
                    Frage {currentQuestion + 1} von {questions.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{
                  background: timeLeft < 300 ? 'rgba(239,68,68,0.15)' : 'var(--bb-surface)',
                  border: timeLeft < 300 ? '1px solid rgba(239,68,68,0.5)' : 'none',
                }}>
                  <Clock size={20} style={{ color: timeLeft < 300 ? '#f87171' : 'var(--bb-cyan)' }} />
                  <span className="font-mono font-semibold" style={{ color: timeLeft < 300 ? '#f87171' : 'var(--bb-text)' }}>
                    {formatTime(timeLeft)}
                  </span>
                </div>
              </div>

              <Progress value={progress} className="mb-6 h-2" />

              <div className="bb-card mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bb-pill-info text-xs">
                        {question.category}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{
                        background: question.difficulty === 'leicht' ? 'rgba(16,185,129,0.2)' :
                          question.difficulty === 'mittel' ? 'rgba(245,158,11,0.2)' :
                          'rgba(239,68,68,0.2)',
                        color: question.difficulty === 'leicht' ? '#34d399' :
                          question.difficulty === 'mittel' ? '#fbbf24' :
                          '#f87171',
                      }}>
                        {question.difficulty}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold leading-relaxed" style={{ color: 'var(--bb-text)' }}>
                      {question.question}
                    </h2>
                  </div>
                </div>

                <div className="space-y-3">
                  {question.answers.map((answer, index) => {
                    const isSelected = userAnswers[currentQuestion] === index;
                    const isCorrect = question.correct_answer_index === index;
                    const _showCorrect = showResults || userAnswers[currentQuestion] !== null;

                    return (
                      <button type="button"
                        key={index}
                        onClick={() => !showResults && handleAnswer(index)}
                        disabled={showResults}
                        className="w-full p-4 rounded-lg text-left transition-all disabled:cursor-not-allowed"
                        style={{
                          border: `2px solid ${
                            showResults && isCorrect ? '#10b981' :
                            showResults && isSelected && !isCorrect ? '#ef4444' :
                            isSelected && !showResults ? 'var(--bb-cyan)' :
                            'var(--bb-border)'
                          }`,
                          background: showResults && isCorrect ? 'rgba(16,185,129,0.15)' :
                            showResults && isSelected && !isCorrect ? 'rgba(239,68,68,0.15)' :
                            isSelected && !showResults ? 'rgba(6,182,212,0.15)' :
                            'transparent',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{
                            borderColor: showResults && isCorrect ? '#10b981' :
                              showResults && isSelected && !isCorrect ? '#ef4444' :
                              isSelected && !showResults ? 'var(--bb-cyan)' :
                              'var(--bb-border)',
                            background: showResults && isCorrect ? '#10b981' :
                              showResults && isSelected && !isCorrect ? '#ef4444' :
                              isSelected && !showResults ? 'var(--bb-cyan)' :
                              'transparent',
                          }}>
                            {showResults && isCorrect && <Check size={16} style={{ color: '#fff' }} />}
                            {showResults && isSelected && !isCorrect && <X size={16} style={{ color: '#fff' }} />}
                            {isSelected && !showResults && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <span style={{ color: 'var(--bb-text)' }}>{answer}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {question.explanation && (
                revealedExplanations[currentQuestion] ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="bb-card mb-6">
                      <div className="pt-2">
                        <div className="flex items-start gap-3">
                          <BookOpen size={20} className="mt-1 flex-shrink-0" style={{ color: 'var(--bb-cyan)' }} />
                          <div>
                            <h4 className="font-semibold mb-2" style={{ color: 'var(--bb-cyan)' }}>Erklärung</h4>
                            <p className="leading-relaxed" style={{ color: 'var(--bb-muted)' }}>{question.explanation}</p>
                            <p className="text-xs mt-3" style={{ color: '#f59e0b' }}>
                              Diese Frage wird nicht gewertet.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="bb-card mb-6">
                    <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                      <div className="flex items-start gap-3">
                        <BookOpen size={20} className="mt-1 flex-shrink-0" style={{ color: 'var(--bb-cyan)' }} />
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--bb-muted)' }}>
                          Du kannst dir die Erklärung anzeigen lassen. Diese Frage wird dann nicht gewertet.
                        </p>
                      </div>
                      <button
                        onClick={handleRevealExplanation}
                        className="bb-secondary whitespace-nowrap"
                        style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                      >
                        Erklärung anzeigen
                      </button>
                    </div>
                  </div>
                )
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={handlePrevious}
                  disabled={currentQuestion === 0}
                  className="bb-secondary flex-1 disabled:opacity-40"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Zurück
                </button>

                {currentQuestion < questions.length - 1 ? (
                  <button
                    onClick={handleNext}
                    className="bb-action flex-1"
                  >
                    Weiter
                    <ArrowLeft size={16} className="ml-2 rotate-180" />
                  </button>
                ) : (
                  <button
                    onClick={handleFinishExam}
                    className="bb-action flex-1"
                    style={{ background: '#059669' }}
                  >
                    <Trophy size={16} className="mr-2" />
                    Prüfung abschließen
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}
    </>
  );
}
