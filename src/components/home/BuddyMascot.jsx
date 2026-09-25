import React from 'react';

// KI-Buddy-Maskottchen des Startbildschirms: ein kleiner Roboterfisch mit
// dunklem Visier und lächelnden Leuchtaugen. Reines SVG (keine Bilddatei),
// skaliert verlustfrei und kostet kaum Bytes.
export default function BuddyMascot({ size = 170, className = '' }) {
  return (
    <svg
      viewBox="0 0 200 170"
      width={size}
      height={size * 0.85}
      className={className}
      role="img"
      aria-label="KI-Buddy, ein freundlicher Roboterfisch"
    >
      <defs>
        <radialGradient id="bbm-body" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#7df3ff" />
          <stop offset="45%" stopColor="#17b6e6" />
          <stop offset="100%" stopColor="#0a4f86" />
        </radialGradient>
        <linearGradient id="bbm-fin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8af5ff" />
          <stop offset="100%" stopColor="#0f7fbf" />
        </linearGradient>
        <radialGradient id="bbm-visor" cx="45%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#1f3550" />
          <stop offset="70%" stopColor="#070d18" />
          <stop offset="100%" stopColor="#02060c" />
        </radialGradient>
        <filter id="bbm-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Schwanzflosse */}
      <path d="M40 88 L6 58 Q14 88 6 118 Z" fill="url(#bbm-fin)" opacity="0.95" />
      {/* Rückenflosse */}
      <path d="M92 34 Q112 4 140 22 Q124 30 120 44 Z" fill="url(#bbm-fin)" />
      {/* Körper */}
      <ellipse cx="112" cy="90" rx="74" ry="62" fill="url(#bbm-body)" />
      <ellipse cx="96" cy="58" rx="36" ry="14" fill="#ffffff" opacity="0.18" />
      {/* Brustflosse */}
      <path d="M82 128 Q70 160 98 162 Q102 146 104 132 Z" fill="url(#bbm-fin)" />
      {/* Visier */}
      <ellipse cx="124" cy="92" rx="54" ry="40" fill="url(#bbm-visor)" stroke="#0b3a5c" strokeWidth="3" />
      <ellipse cx="108" cy="72" rx="20" ry="7" fill="#ffffff" opacity="0.12" />
      {/* Lächelnde Leuchtaugen */}
      <g filter="url(#bbm-glow)" stroke="#5ff0ff" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M96 100 Q106 84 116 100" />
        <path d="M134 100 Q144 84 154 100" />
      </g>
      {/* Luftblasen */}
      <circle cx="186" cy="74" r="5" fill="none" stroke="#7df3ff" strokeWidth="2" opacity="0.7" />
      <circle cx="192" cy="56" r="3" fill="none" stroke="#7df3ff" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}
