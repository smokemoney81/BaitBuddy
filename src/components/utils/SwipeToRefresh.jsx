import React, { useRef, useState } from 'react';

const THRESHOLD = 70;

export default function SwipeToRefresh({ onRefresh, children }) {
  const startY = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);

  // Nur ganz oben ziehen: weder das Fenster noch ein scrollbarer Bereich unter
  // dem Finger (z. B. der Chatverlauf im Voice Buddy) darf nach unten gescrollt
  // sein — sonst wird aus normalem Hochscrollen ein Refresh.
  const isAtTop = (target) => {
    if (window.scrollY > 0) return false;
    const el = containerRef.current;
    for (let node = target; node && node !== el; node = node.parentElement) {
      if (node.scrollTop > 0) return false;
    }
    return !el || el.scrollTop === 0;
  };

  const handleTouchStart = (e) => {
    if (isAtTop(e.target)) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0 && isAtTop(e.target)) {
      setPullDistance(Math.min(delta, THRESHOLD * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(0);
      startY.current = null;
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
      startY.current = null;
    }
  };

  const progress = Math.min(pullDistance / THRESHOLD, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-live="polite"
      aria-label="Zum Aktualisieren nach unten ziehen"
    >
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex justify-center items-center text-xs text-cyan-400 py-2 transition-all"
          style={{ height: refreshing ? 36 : pullDistance * 0.5 }}
          aria-hidden="true"
        >
          {refreshing
            ? 'Aktualisiere...'
            : progress >= 1
            ? 'Loslassen zum Aktualisieren'
            : 'Ziehen zum Aktualisieren'}
        </div>
      )}
      {children}
    </div>
  );
}