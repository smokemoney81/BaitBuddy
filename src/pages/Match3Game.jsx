
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { User } from "@/entities/User";
import PremiumGuard from "@/components/premium/PremiumGuard";
import { Crown } from "lucide-react";

// ---------- Match-3 Game Component ----------
import { useMemo } from "react";
import PageTitle from "@/components/layout/PageTitle";

// Konstante Spielwerte
const SIZE = 8;
const COLORS = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#845ef7", "#ffa94d"];
const MOVES_START = 30;
const SCORE_PER_3 = 30;
const SCORE_PER_EXTRA = 15;
const COMBO_BONUS = 50;
const FOUR_LINE_SPECIAL = true;
const FIVE_BOMB_SPECIAL = true;

// crypto.randomUUID gibt es erst ab Chrome/WebView 92 und Safari 15.4 und nur
// in sicheren Kontexten — ohne Fallback warf das Aufbauen des Spielfelds auf
// aelteren Android-WebViews und iPhones einen TypeError.
let cellCounter = 0;
const newCellId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  cellCounter += 1;
  return `cell_${Date.now().toString(36)}_${cellCounter}`;
};

const newCell = (avoidColor = null) => {
  let c;
  do c = Math.floor(Math.random() * COLORS.length);
  while (avoidColor !== null && c === avoidColor);
  return { color: c, id: newCellId() };
};

const _inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const cloneBoard = (b) => b.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

function createInitialBoard() {
  const b = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      while (true) {
        const candidate = newCell();
        b[r][c] = candidate;
        const h = c >= 2 && b[r][c] && b[r][c - 1] && b[r][c - 2] && 
                  b[r][c].color === b[r][c - 1].color && b[r][c].color === b[r][c - 2].color;
        const v = r >= 2 && b[r][c] && b[r - 1][c] && b[r - 2][c] && 
                  b[r][c].color === b[r - 1][c].color && b[r][c].color === b[r - 2][c].color;
        if (!h && !v) break;
      }
    }
  }
  return b;
}

function neighbors4([r1, c1], [r2, c2]) {
  return (Math.abs(r1 - r2) === 1 && c1 === c2) || (Math.abs(c1 - c2) === 1 && r1 === r2);
}

function findMatches(board) {
  const matched = new Set();
  const groups = [];
  
  // horizontal
  for (let r = 0; r < SIZE; r++) {
    let streak = 1;
    for (let c = 1; c <= SIZE; c++) {
      const curr = c < SIZE ? board[r][c] : null;
      const prev = board[r][c - 1];
      if (curr && prev && curr.color === prev.color) {
        streak++;
      } else {
        if (streak >= 3 && prev) {
          const cells = [];
          for (let k = c - streak; k < c; k++) {
            matched.add(`${r},${k}`);
            cells.push([r, k]);
          }
          groups.push({ cells, color: prev.color, len: streak, dir: "h" });
        }
        streak = 1;
      }
    }
  }
  
  // vertical
  for (let c = 0; c < SIZE; c++) {
    let streak = 1;
    for (let r = 1; r <= SIZE; r++) {
      const curr = r < SIZE ? board[r][c] : null;
      const prev = board[r - 1][c];
      if (curr && prev && curr.color === prev.color) {
        streak++;
      } else {
        if (streak >= 3 && prev) {
          const cells = [];
          for (let k = r - streak; k < r; k++) {
            matched.add(`${k},${c}`);
            cells.push([k, c]);
          }
          groups.push({ cells, color: prev.color, len: streak, dir: "v" });
        }
        streak = 1;
      }
    }
  }
  return { matched, groups };
}

function applySpecials(board, toClearSet) {
  const extra = new Set();
  for (const key of Array.from(toClearSet)) {
    const [r, c] = key.split(",").map(Number);
    const cell = board[r][c];
    if (!cell) continue;
    if (cell.special === "row") {
      for (let cc = 0; cc < SIZE; cc++) extra.add(`${r},${cc}`);
    } else if (cell.special === "col") {
      for (let rr = 0; rr < SIZE; rr++) extra.add(`${rr},${c}`);
    } else if (cell.special === "bomb") {
      const color = cell.color;
      for (let rr = 0; rr < SIZE; rr++)
        for (let cc = 0; cc < SIZE; cc++)
          if (board[rr][cc] && board[rr][cc].color === color) extra.add(`${rr},${cc}`);
    }
  }
  for (const e of extra) toClearSet.add(e);
}

function dropAndRefill(board) {
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      if (board[r][c]) {
        if (write !== r) {
          board[write][c] = board[r][c];
          board[r][c] = null;
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      board[r][c] = newCell();
    }
  }
}

function makeQuest() {
  const types = ["score", "color", "combo"];
  const type = types[Math.floor(Math.random() * types.length)];
  
  if (type === "score") {
    const target = 2000 + Math.floor(Math.random() * 3000);
    return { type, target, desc: `Erreiche ${target} Punkte`, current: 0 };
  } else if (type === "color") {
    const color = Math.floor(Math.random() * COLORS.length);
    const target = 30 + Math.floor(Math.random() * 40);
    return { type, target, color, desc: `Sammle ${target}x diese Farbe`, current: 0 };
  } else {
    const target = 3 + Math.floor(Math.random() * 3);
    return { type, target, desc: `Schaffe ${target} Combos`, current: 0 };
  }
}

// Match-3 Hauptkomponente
function Match3QuestGame() {
  const [board, setBoard] = useState(() => createInitialBoard());
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(MOVES_START);
  const [combo, setCombo] = useState(0);
  const [quest, setQuest] = useState(() => makeQuest());
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [gameEnded, setGameEnded] = useState(false); // New state for game ended

  const questComplete = useMemo(() => {
    if (quest.type === "score") return quest.current >= quest.target;
    if (quest.type === "color") return quest.current >= quest.target;
    if (quest.type === "combo") return quest.current >= quest.target;
    return false;
  }, [quest]);

  const handleGameEnd = async (finalScoreValue, gameWon) => {
    if (gameEnded) return;
    
    setGameEnded(true);
    setWon(gameWon); // Set won state based on parameter

    const baseCredits = Math.floor(finalScoreValue / 10);
    const bonusCredits = gameWon ? 200 : 0; // Bonus only for winning
    const totalCredits = baseCredits + bonusCredits;
    
    try {
      const user = await User.me();
      await User.updateMyUserData({
        credits: (user.credits || 0) + totalCredits,
        total_earned: (user.total_earned || 0) + totalCredits
      });
      
      // Success Sound
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmEfAzuR0OzMgDEYHX29t15NEQ5Pp+HuulIeBTuOwOitB5qNkWE2NWSn0N2wYh4HP5nZ88V3JgYsgs/x2Ik3CRhpu+3noUwQDFC7UUFA');
        audio.volume = 0.3;
        audio.play();
      } catch (soundError) {
        console.warn("Could not play success sound:", soundError);
      }
      
      let creditsMessage = `+${baseCredits} Credits für Punkte`;
      if (gameWon) {
        creditsMessage += `\n+${bonusCredits} Bonus-Credits für gewonnenes Spiel`;
      }
      creditsMessage += `\nGesamt: +${totalCredits} Credits!`;
      toast.success(`Spiel beendet! ${finalScoreValue} Punkte erreicht!`, {
        description: creditsMessage,
      });

    } catch (error) {
      console.error("Fehler beim Speichern der Credits:", error);
      toast.error(`Spiel beendet mit ${finalScoreValue} Punkten! Fehler beim Speichern der Credits.`);
    }
  };


  const handleCellClick = async (r, c) => {
    if (processing || gameOver || gameEnded) return; // Also block if game has officially ended
    const pos = [r, c];
    
    if (!selected) {
      setSelected(pos);
      return;
    }
    
    if (selected[0] === r && selected[1] === c) {
      setSelected(null);
      return;
    }
    
    if (!neighbors4(selected, pos)) {
      setSelected(pos);
      return;
    }

    // Tausch durchführen
    setProcessing(true);
    const newBoard = cloneBoard(board);
    const temp = newBoard[selected[0]][selected[1]];
    newBoard[selected[0]][selected[1]] = newBoard[r][c];
    newBoard[r][c] = temp;
    
    setBoard(newBoard);
    setSelected(null);
    
    // Animationszeit
    await new Promise(resolve => setTimeout(resolve, 300));
    
    let hasMatches = true;
    let chainCount = 0;
    let totalScore = 0;
    let questProgress = { ...quest };
    
    while (hasMatches) {
      const { matched, groups } = findMatches(newBoard);
      
      if (matched.size === 0) {
        hasMatches = false;
        break;
      }
      
      chainCount++;
      
      // Spezialsteine erzeugen
      for (const group of groups) {
        const { cells, len } = group;
        if (len === 4 && FOUR_LINE_SPECIAL) {
          const [r, c] = cells[0];
          newBoard[r][c] = { ...newBoard[r][c], special: group.dir === "h" ? "col" : "row" };
        } else if (len >= 5 && FIVE_BOMB_SPECIAL) {
          const [r, c] = cells[0];
          newBoard[r][c] = { ...newBoard[r][c], special: "bomb" };
        }
      }
      
      applySpecials(newBoard, matched);
      
      // Punkte berechnen
      let roundScore = 0;
      for (const group of groups) {
        roundScore += SCORE_PER_3 + (group.len - 3) * SCORE_PER_EXTRA;
        
        // Quest progress
        if (questProgress.type === "color" && group.color === questProgress.color) {
          questProgress.current += group.len;
        }
      }
      
      if (chainCount > 1) {
        roundScore += COMBO_BONUS;
        if (questProgress.type === "combo") {
          questProgress.current++;
        }
      }
      
      totalScore += roundScore;
      
      // Zellen löschen
      for (const key of matched) {
        const [r, c] = key.split(",").map(Number);
        newBoard[r][c] = null;
      }
      
      dropAndRefill(newBoard);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    if (questProgress.type === "score") {
      questProgress.current += totalScore;
    }
    
    const newScore = score + totalScore;
    setScore(newScore);
    setQuest(questProgress);
    setCombo(chainCount > 1 ? combo + 1 : 0);
    setMoves(prev => prev - 1);
    
    const newMoves = moves - 1;
    const isQuestComplete = questProgress.type === "score" ? questProgress.current >= questProgress.target :
                           questProgress.type === "color" ? questProgress.current >= questProgress.target :
                           questProgress.current >= questProgress.target;
    
    if (isQuestComplete) {
      setGameOver(true);
      handleGameEnd(newScore, true); // Call internal handler for winning
    } else if (newMoves <= 0) {
      setGameOver(true);
      handleGameEnd(newScore, false); // Call internal handler for losing
    }
    
    setProcessing(false);
  };

  const resetGame = () => {
    setBoard(createInitialBoard());
    setSelected(null);
    setScore(0);
    setMoves(MOVES_START);
    setCombo(0);
    setQuest(makeQuest());
    setGameOver(false);
    setWon(false);
    setProcessing(false);
    setGameEnded(false); // Reset gameEnded state
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Header */}
      <div className="mb-4 p-4 bg-gray-800/40 rounded-xl">
        <div className="flex justify-between items-center mb-2">
          <div className="text-white font-bold text-xl">Match-3 Quest</div>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 text-sm">Premium</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-gray-400 text-sm">Score</div>
            <div className="text-white font-bold">{score}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Züge</div>
            <div className="text-white font-bold">{moves}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Combo</div>
            <div className="text-white font-bold">{combo}</div>
          </div>
        </div>
      </div>

      {/* Quest */}
      <div className="mb-4 p-3 bg-gray-800/40 rounded-xl">
        <div className="text-gray-300 text-sm mb-1">Quest:</div>
        <div className="text-white">{quest.desc}</div>
        <div className="text-gray-400 text-sm">
          Fortschritt: {quest.current} / {quest.target}
          {quest.type === "color" && (
            <span
              className="inline-block w-4 h-4 rounded ml-2"
              style={{ backgroundColor: COLORS[quest.color] }}
            />
          )}
        </div>
        {questComplete && <div className="text-green-400 text-sm">Abgeschlossen!</div>}
      </div>

      {/* Spielfeld */}
      <div className="mb-4">
        <div 
          className="grid gap-1 bg-gray-900 p-2 rounded-xl mx-auto"
          style={{ 
            gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
            maxWidth: '400px'
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const isSelected = selected && selected[0] === r && selected[1] === c;
              const isEmpty = !cell;
              
              return (
                <div
                  key={`${r}-${c}`}
                  className={`
                    w-12 h-12 rounded cursor-pointer transition-all duration-200 
                    flex items-center justify-center text-white text-xs font-bold
                    ${isEmpty ? 'bg-gray-700' : ''}
                    ${isSelected ? 'ring-2 ring-yellow-400 scale-110' : ''}
                    ${!isEmpty ? 'hover:scale-105 active:scale-95' : ''}
                  `}
                  style={{ 
                    backgroundColor: isEmpty ? undefined : COLORS[cell.color],
                    border: isSelected ? '2px solid #fbbf24' : '1px solid #374151'
                  }}
                  onClick={() => handleCellClick(r, c)}
                >
                  {cell?.special === 'row' && '↔'}
                  {cell?.special === 'col' && '↕'}
                  {cell?.special === 'bomb' && '💥'}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Game Over */}
      {gameOver && (
        <div className="p-4 bg-gray-800/60 rounded-xl text-center">
          <div className={`text-2xl font-bold mb-2 ${won ? 'text-green-400' : 'text-red-400'}`}>
            {won ? 'Gewonnen!' : 'Verloren'}
          </div>
          <div className="text-white mb-4">
            Endpunktzahl: {score}
          </div>
          <button type="button"
            onClick={resetGame}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
          >
            Neues Spiel
          </button>
        </div>
      )}
    </div>
  );
}

// Haupt-Match3Game Seite
export default function Match3Game() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const u = await User.me();
        setUser(u);
      } catch {
        setUser(null);
      }
    };
    loadUser();
  }, []);

  // The handleGameEnd function previously defined here in the parent Match3Game
  // is now moved and integrated directly into Match3QuestGame,
  // so it's no longer needed in this parent component.

  return (
    <div className="min-h-screen text-slate-50">
      <div className="px-4 pb-32">
        <PageTitle className="mb-4" title="Match-3 Quest" subtitle="Kombiniere Köder und sammle Punkte." />
        <PremiumGuard user={user} feature="Match-3 Quest Spiel">
          {/* onGameEnd prop is removed as Match3QuestGame now handles game end logic internally */}
          <Match3QuestGame />
        </PremiumGuard>
      </div>
    </div>
  );
}
