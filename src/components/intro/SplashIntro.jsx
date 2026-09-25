import { Component, useEffect, useRef, useState } from "react";

// Start-Animation „Buddy erwacht" (ca. 3 s):
//   Szene 1 (0–900 ms)     Dunkelheit → ein Cyan-Auge leuchtet auf → Kopf,
//                          Rücken, Flossen und Körper zeichnen sich nach und nach ab.
//   Szene 2 (900–2000 ms)  Ein Köder gleitet von rechts oben ein, das Auge
//                          fixiert ihn, der Fisch dreht den Kopf und setzt an.
//   Szene 3 (2000–3000 ms) Kurzer Antritt, Biss, Cyan-Impuls, Logo + Claim.
//
// Rein visuell: Die Animation liegt als Overlay über der App, die darunter
// ganz normal startet (Auth, Routing, Plan). Sie entscheidet nichts und hält
// nichts auf. Reines Inline-SVG + CSS-Keyframes (nur transform/opacity/
// stroke-dashoffset, keine SVG-Filter) — keine Assets, die fehlen könnten,
// keine Abhängigkeiten. Tippen überspringt.
export const SPLASH_TIMING = Object.freeze({
  leaveMs: 3000,          // Beginn der Überblendung zur App
  removeMs: 3300,         // Overlay wird entfernt
  reducedLeaveMs: 1400,   // Variante für „Bewegung reduzieren"
  reducedRemoveMs: 1700,
  skipFadeMs: 300,
});

// Biss-Punkt im Bühnen-Koordinatensystem (viewBox 400 × 300).
const BITE_X = 300;
const BITE_Y = 138;
// Startposition des Fisch-Kopfes; die Bewegung bis zum Biss-Punkt steckt in bbxFishMove.
const FISH_X = 180;
const FISH_Y = 160;

const CSS = `
  .bbx-splash {
    /* Theme-Tokens der App (baitbuddy-v2.css) mit Fallback, falls das
       Stylesheet noch nicht geladen ist. */
    --bbx-bg: var(--bb-bg, #0B1324);
    --bbx-cyan: #22D3EE;
    --bbx-teal: #14B8A6;
    --bbx-cyan-light: #67E8F9;
    --bbx-white: #F8FAFC;

    position: fixed; inset: 0; z-index: 99999; cursor: pointer;
    background:
      radial-gradient(ellipse 70% 55% at 50% 42%, rgba(20, 60, 90, .35) 0%, rgba(11, 19, 36, 0) 70%),
      linear-gradient(180deg, #0d1a30 0%, var(--bbx-bg) 55%, #070d19 100%);
    background-color: var(--bbx-bg);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
             env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
    box-sizing: border-box;
    opacity: 1; transition: opacity .3s ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none;
  }
  .bbx-splash.bbx-leave { opacity: 0; pointer-events: none; }

  /* Bühne 4:3, passt immer vollständig in den sicheren Bereich
     (kein aspect-ratio: fehlt in Safari 14). */
  .bbx-stage {
    --bbx-w: min(calc(100vw - 32px), 640px, calc((100vh - 120px) * 1.3333));
    position: relative;
    width: var(--bbx-w); height: calc(var(--bbx-w) * .75);
    max-width: 100%;
  }
  .bbx-stage svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }

  /* extrem dezente Lichtstrahlen, ohne Blur-Filter */
  .bbx-ray {
    position: absolute; top: -10vh; height: 90vh; pointer-events: none;
    background: linear-gradient(180deg, rgba(103, 232, 249, .07) 0%, rgba(103, 232, 249, .02) 45%, transparent 80%);
    transform-origin: top center; opacity: 0;
    animation: bbxRayIn 1.2s ease-out .15s forwards;
  }
  @keyframes bbxRayIn { to { opacity: 1; } }

  /* alle Szenen-Animationen laufen auf einer gemeinsamen 3-s-Zeitachse */
  .bbx-splash svg * { animation-fill-mode: both; }

  /* Szene 1 — Auge */
  .bbx-halo { opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; animation: bbxHalo 3s linear; }
  @keyframes bbxHalo {
    0%, 6%  { opacity: 0; transform: scale(.4); }
    17%     { opacity: .95; transform: scale(1.1); }
    30%     { opacity: .6; transform: scale(1); }
    70%     { opacity: .7; transform: scale(1); }
    76%     { opacity: 1; transform: scale(1.15); }
    100%    { opacity: .5; transform: scale(1); }
  }
  .bbx-eye { opacity: 0; animation: bbxEye 3s linear; }
  @keyframes bbxEye { 0%, 7% { opacity: 0; } 16%, 100% { opacity: 1; } }
  .bbx-pupil { animation: bbxPupil 3s ease-in-out; }
  @keyframes bbxPupil {
    0%, 40% { transform: translate(0, 0); }
    48%, 100% { transform: translate(1.1px, -.9px); }
  }

  /* Szene 1 — Konturen zeichnen sich ab (pathLength = 1) */
  .bbx-line { fill: none; stroke-dasharray: 1; stroke-dashoffset: 1; stroke-linecap: round; }
  .bbx-draw-head  { animation: bbxDraw .38s cubic-bezier(.4,0,.2,1) .48s both; }
  .bbx-draw-back  { animation: bbxDraw .42s cubic-bezier(.4,0,.2,1) .58s both; }
  .bbx-draw-fins  { animation: bbxDraw .36s cubic-bezier(.4,0,.2,1) .68s both; }
  .bbx-draw-body  { animation: bbxDraw .40s cubic-bezier(.4,0,.2,1) .74s both; }
  @keyframes bbxDraw { to { stroke-dashoffset: 0; } }
  .bbx-fill { opacity: 0; animation: bbxFill .5s ease-out .78s both; }
  .bbx-fill-fins { opacity: 0; animation: bbxFillFins .4s ease-out .82s both; }
  @keyframes bbxFill { to { opacity: 1; } }
  @keyframes bbxFillFins { to { opacity: .85; } }

  /* Szene 2/3 — Bewegung des Fisches (Ursprung = Kopf) */
  .bbx-fish-move { animation: bbxFishMove 3s linear; }
  @keyframes bbxFishMove {
    0%   { transform: translate(0, 0) rotate(0deg); }
    40%  { transform: translate(0, 0) rotate(0deg); animation-timing-function: ease-in-out; }
    56%  { transform: translate(14px, -3px) rotate(-6deg); animation-timing-function: ease-in-out; }
    62%  { transform: translate(20px, -5px) rotate(-7deg); animation-timing-function: cubic-bezier(.55, 0, .9, .45); }
    75%  { transform: translate(88px, -17px) rotate(-8deg); animation-timing-function: ease-out; }
    79%  { transform: translate(100px, -18px) rotate(-5deg); animation-timing-function: ease-in; }
    100% { transform: translate(210px, -8px) rotate(0deg); }
  }
  .bbx-fish-fade { animation: bbxFishFade 3s linear; }
  @keyframes bbxFishFade { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }

  /* Schwanzschlag: ruhig, beim Antritt schneller */
  .bbx-tail { transform-box: fill-box; transform-origin: 100% 50%; animation: bbxTail 3s ease-in-out; }
  @keyframes bbxTail {
    0%   { transform: rotate(0deg); }
    30%  { transform: rotate(4deg); }
    45%  { transform: rotate(-4deg); }
    58%  { transform: rotate(4deg); }
    63%  { transform: rotate(-9deg); }
    66%  { transform: rotate(9deg); }
    69%  { transform: rotate(-9deg); }
    72%  { transform: rotate(8deg); }
    75%  { transform: rotate(-4deg); }
    85%  { transform: rotate(5deg); }
    100% { transform: rotate(-3deg); }
  }

  /* Biss: Unterkiefer öffnet kurz und schnappt zu */
  .bbx-jaw { transform-box: fill-box; transform-origin: 0% 20%; animation: bbxJaw 3s linear; }
  @keyframes bbxJaw {
    0%, 66% { transform: rotate(0deg); }
    72%     { transform: rotate(16deg); }
    75%     { transform: rotate(-1deg); }
    78%, 100% { transform: rotate(0deg); }
  }

  /* Szene 2 — Köder gleitet von rechts oben ein */
  .bbx-lure { animation: bbxLure 3s linear; }
  @keyframes bbxLure {
    0%, 30% { transform: translate(92px, -86px); opacity: 0; }
    32%     { opacity: 1; animation-timing-function: cubic-bezier(.2, .7, .3, 1); }
    46%     { transform: translate(0, 0); animation-timing-function: ease-in-out; }
    58%     { transform: translate(0, 4px); animation-timing-function: ease-in-out; }
    70%     { transform: translate(0, 1px); opacity: 1; }
    75%     { transform: translate(0, 2px); opacity: 1; }
    76%, 100% { transform: translate(0, 2px); opacity: 0; }
  }
  .bbx-lure-sway { transform-box: fill-box; transform-origin: 90% 50%; animation: bbxLureSway 3s ease-in-out; }
  @keyframes bbxLureSway {
    0%, 44% { transform: rotate(-14deg); }
    52% { transform: rotate(6deg); }
    60% { transform: rotate(-4deg); }
    68%, 100% { transform: rotate(3deg); }
  }

  /* Szene 2 — eine einzelne, kaum sichtbare Sonarwelle */
  .bbx-sonar { opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; animation: bbxSonar 3s ease-out; }
  @keyframes bbxSonar {
    0%, 43% { opacity: 0; transform: scale(.35); }
    52%     { opacity: .15; }
    67%     { opacity: 0; transform: scale(3.2); }
    100%    { opacity: 0; transform: scale(3.2); }
  }

  /* Szene 3 — Cyan-Impuls beim Biss */
  .bbx-flash { opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; animation: bbxFlash 3s ease-out; }
  @keyframes bbxFlash {
    0%, 74.5% { opacity: 0; transform: scale(.3); }
    77%       { opacity: .9; transform: scale(1); }
    86%, 100% { opacity: 0; transform: scale(1.5); }
  }
  .bbx-ring { opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; animation: bbxRing 3s ease-out; }
  @keyframes bbxRing {
    0%, 75% { opacity: 0; transform: scale(.3); }
    77%     { opacity: .75; }
    92%, 100% { opacity: 0; transform: scale(2.6); }
  }
  .bbx-spark { opacity: 0; animation: bbxSpark 3s cubic-bezier(.2, .7, .3, 1); }
  @keyframes bbxSpark {
    0%, 75% { opacity: 0; transform: translateX(4px); }
    77%     { opacity: .9; }
    95%, 100% { opacity: 0; transform: translateX(var(--bbx-d, 34px)); }
  }

  /* Umgebung: Schwebeteilchen und Blasen */
  .bbx-mote { animation: bbxMote 3s linear; }
  @keyframes bbxMote {
    0%   { opacity: 0; transform: translate(0, 0); }
    25%  { opacity: var(--bbx-o, .35); }
    100% { opacity: var(--bbx-o, .35); transform: translate(-10px, -6px); }
  }
  .bbx-bubble { animation: bbxBubble 3s ease-in; }
  @keyframes bbxBubble {
    0%   { opacity: 0; transform: translateY(0); }
    20%  { opacity: .45; }
    100% { opacity: 0; transform: translateY(-70px); }
  }

  /* Logo-Reveal */
  .bbx-logo {
    position: absolute; left: 0; right: 0; top: 64%;
    text-align: center; pointer-events: none;
    opacity: 0; transform: scale(.96);
    animation: bbxLogo .38s cubic-bezier(.2, .8, .2, 1) 2.45s forwards;
    font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  @keyframes bbxLogo { to { opacity: 1; transform: scale(1); } }
  .bbx-logo-word {
    margin: 0; line-height: 1;
    font-size: max(26px, calc(var(--bbx-w) * .085));
    font-weight: 800; letter-spacing: .08em;
    color: var(--bbx-white);
  }
  .bbx-logo-word span { color: var(--bbx-cyan); }
  .bbx-logo-claim {
    margin: .7em 0 0; line-height: 1.3;
    font-size: max(13px, calc(var(--bbx-w) * .03));
    font-weight: 500; letter-spacing: .02em;
    color: var(--bbx-cyan-light); opacity: .8;
  }

  .bbx-skip {
    position: absolute; left: 0; right: 0;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
    text-align: center; font-size: 11px; letter-spacing: .5px;
    color: rgba(148, 178, 200, .5);
    font-family: Inter, system-ui, sans-serif;
  }

  /* Bewegung reduziert: dunkler Hintergrund → Fisch + Logo blenden ein → App */
  .bbx-splash.bbx-reduced *, .bbx-splash.bbx-reduced .bbx-ray { animation: none !important; }
  .bbx-splash.bbx-reduced .bbx-line { stroke-dashoffset: 0; }
  .bbx-splash.bbx-reduced .bbx-lure,
  .bbx-splash.bbx-reduced .bbx-sonar,
  .bbx-splash.bbx-reduced .bbx-flash,
  .bbx-splash.bbx-reduced .bbx-ring,
  .bbx-splash.bbx-reduced .bbx-spark,
  .bbx-splash.bbx-reduced .bbx-mote,
  .bbx-splash.bbx-reduced .bbx-bubble { opacity: 0; }
  .bbx-splash.bbx-reduced .bbx-halo { opacity: .6; }
  /* Fisch ruhig mittig über dem Logo statt an der Startposition */
  .bbx-splash.bbx-reduced .bbx-fish-move { transform: translate(89px, -34px); }
  .bbx-splash.bbx-reduced .bbx-fish-fade { animation: bbxFill .5s ease-out both !important; }
  .bbx-splash.bbx-reduced .bbx-eye,
  .bbx-splash.bbx-reduced .bbx-fill,
  .bbx-splash.bbx-reduced .bbx-fill-fins { opacity: 1; }
  .bbx-splash.bbx-reduced .bbx-logo { animation: bbxLogo .5s ease .25s forwards !important; }
`;

// Schwebeteilchen [x, y, r, Deckkraft] und Blasen [x, y, r, Verzögerung]
const MOTES = [
  [42, 60, 0.9, 0.35], [88, 214, 0.7, 0.25], [134, 38, 0.6, 0.3], [176, 250, 1, 0.3],
  [214, 84, 0.6, 0.25], [262, 222, 0.8, 0.3], [318, 48, 0.7, 0.3], [356, 186, 0.9, 0.35],
  [382, 102, 0.6, 0.25], [24, 150, 0.7, 0.3], [236, 170, 0.5, 0.2], [150, 110, 0.5, 0.2],
];
const BUBBLES = [
  [72, 270, 1.6, "0s"], [128, 286, 1.1, ".7s"], [344, 280, 1.4, ".35s"], [268, 292, 1, "1.1s"],
];
// Partikel des Biss-Impulses: Winkel (Grad) und Flugweite
const SPARKS = [[-150, 30], [-105, 36], [-60, 30], [-15, 38], [30, 28], [75, 34], [125, 26], [175, 32]];

function BuddyFish() {
  // Lokale Koordinaten: Kopf-Referenz (0,0) liegt kurz vor dem Auge,
  // die Maulspitze bei ~(32,-1), der Schwanz bei ~(-170,0).
  return (
    <g transform="translate(-140,0)">
      {/* Schwanzflosse */}
      <g className="bbx-tail">
        <path className="bbx-fill-fins"
          d="M6,0 C -6,-7 -18,-20 -30,-26 C -23,-10 -23,10 -30,26 C -18,20 -6,7 6,0 Z"
          fill="url(#bbxFin)" />
        <path className="bbx-line bbx-draw-body" pathLength="1"
          d="M6,0 C -6,-7 -18,-20 -30,-26 C -23,-10 -23,10 -30,26 C -18,20 -6,7 6,0"
          stroke="url(#bbxRim)" strokeWidth="1.1" />
      </g>

      {/* Rückenflossen */}
      <path className="bbx-fill-fins" d="M72,-22 C 80,-39 99,-42 110,-24 Z" fill="url(#bbxFin)" />
      <path className="bbx-fill-fins" d="M40,-16 C 44,-26 56,-28 62,-19 Z" fill="url(#bbxFin)" />
      <path className="bbx-line bbx-draw-fins" pathLength="1"
        d="M72,-22 C 80,-39 99,-42 110,-24" stroke="url(#bbxRim)" strokeWidth="1.1" />
      <path className="bbx-line bbx-draw-fins" pathLength="1"
        d="M40,-16 C 44,-26 56,-28 62,-19" stroke="url(#bbxRim)" strokeWidth=".9" />

      {/* Bauch- und Afterflosse */}
      <path className="bbx-fill-fins" d="M88,19 C 84,30 72,33 64,29 C 70,24 76,21 88,19 Z" fill="url(#bbxFin)" />
      <path className="bbx-fill-fins" d="M48,16 C 44,25 34,27 28,23 C 33,19 40,17 48,16 Z" fill="url(#bbxFin)" />

      {/* Körper */}
      <path className="bbx-fill"
        d="M5,0 C 22,-14 62,-25 110,-24 C 138,-23 158,-15 171,-3 C 173,-1 173,2 170,4 C 158,14 136,20 106,20 C 62,21 24,13 5,0 Z"
        fill="url(#bbxBody)" />
      {/* Seitenlinie mit Cyan-Schimmer */}
      <path className="bbx-fill" d="M132,-2 C 102,-5 62,-4 16,0" stroke="url(#bbxLateral)" strokeWidth=".9" fill="none" />
      {/* Brustflosse */}
      <path className="bbx-fill-fins" d="M126,6 C 118,14 108,19 99,21 C 106,12 115,7 126,6 Z" fill="url(#bbxFin)" />

      {/* Konturen in Reihenfolge: Kopf → Rücken → Flossen → Körper */}
      <path className="bbx-line bbx-draw-head" pathLength="1"
        d="M171,-3 C 162,-14 148,-22 128,-23 M 139,-18 C 131,-8 131,8 138,16"
        stroke="url(#bbxRim)" strokeWidth="1.3" />
      <path className="bbx-line bbx-draw-back" pathLength="1"
        d="M128,-23 C 96,-26 52,-20 5,0" stroke="url(#bbxRim)" strokeWidth="1.2" />
      <path className="bbx-line bbx-draw-fins" pathLength="1"
        d="M126,6 C 118,14 108,19 99,21 M 88,19 C 84,30 72,33 64,29" stroke="url(#bbxRim)" strokeWidth=".9" />
      <path className="bbx-line bbx-draw-body" pathLength="1"
        d="M170,4 C 158,14 136,20 106,20 C 62,21 24,13 5,0" stroke="url(#bbxRimLow)" strokeWidth="1" />

      {/* Unterkiefer (klappt beim Biss) */}
      <path className="bbx-jaw bbx-fill" d="M152,5 C 160,5 167,4 171,2 C 166,6 158,8 152,7 Z" fill="#12263a" stroke="url(#bbxRim)" strokeWidth=".6" />

      {/* Auge: Halo (Radial-Gradient statt Blur-Filter), Iris, Pupille */}
      <circle className="bbx-halo" cx="150" cy="-8" r="15" fill="url(#bbxHalo)" />
      <g className="bbx-eye">
        <circle cx="150" cy="-8" r="3.9" fill="url(#bbxIris)" />
        <g className="bbx-pupil">
          <circle cx="150.6" cy="-8.2" r="1.5" fill="#06121f" />
          <circle cx="151.4" cy="-9.2" r=".55" fill="#F8FAFC" opacity=".9" />
        </g>
      </g>
    </g>
  );
}

function Lure() {
  return (
    <g className="bbx-lure">
      <g className="bbx-lure-sway">
        {/* Schnur nach rechts oben */}
        <line x1="12" y1="-2" x2="170" y2="-190" stroke="rgba(203, 232, 245, .28)" strokeWidth=".6" />
        {/* schlanker Wobbler, Kopf rechts (Schnur-Öse), Tauchschaufel links unten */}
        <path d="M-12,0 C -8,-5 4,-6 11,-2 L 12,0 C 5,4 -7,4 -12,0 Z" fill="url(#bbxLureBody)" />
        <path d="M-12,0 C -8,-5 4,-6 11,-2 C 3,-4 -6,-3 -12,0 Z" fill="#14B8A6" opacity=".55" />
        <circle cx="7.5" cy="-1.6" r="1.2" fill="#F8FAFC" />
        <circle cx="7.9" cy="-1.6" r=".55" fill="#0B1324" />
        <path d="M-12,0 q-4,-3 -6,-7 q3,1 6,5 Z" fill="rgba(203, 232, 245, .55)" />
        <path d="M-2,3 C -2,8 -6,9 -8,6 M 3,3 C 3,8 7,9 8,6" stroke="#9fb2bf" strokeWidth=".7" fill="none" />
      </g>
    </g>
  );
}

function SplashScene({ reduced, leaving, onSkip }) {
  return (
    <div
      onClick={onSkip}
      className={`bbx-splash${leaving ? " bbx-leave" : ""}${reduced ? " bbx-reduced" : ""}`}
      role="presentation"
      aria-hidden="true"
      data-testid="splash-intro"
    >
      <style>{CSS}</style>

      <div className="bbx-ray" style={{ left: "22%", width: "9vw", transform: "rotate(14deg)" }} />
      <div className="bbx-ray" style={{ left: "58%", width: "13vw", transform: "rotate(9deg)" }} />

      <div className="bbx-stage">
        <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bbxBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10243a" />
              <stop offset="55%" stopColor="#0d1c30" />
              <stop offset="100%" stopColor="#15304a" />
            </linearGradient>
            <linearGradient id="bbxFin" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#123049" />
              <stop offset="100%" stopColor="#0B1324" />
            </linearGradient>
            <linearGradient id="bbxRim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67E8F9" stopOpacity=".95" />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity=".55" />
            </linearGradient>
            <linearGradient id="bbxRimLow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity=".35" />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity=".2" />
            </linearGradient>
            <linearGradient id="bbxLateral" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity=".55" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="bbxHalo">
              <stop offset="0%" stopColor="#67E8F9" stopOpacity=".75" />
              <stop offset="35%" stopColor="#22D3EE" stopOpacity=".28" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bbxIris">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="45%" stopColor="#67E8F9" />
              <stop offset="100%" stopColor="#14B8A6" />
            </radialGradient>
            <radialGradient id="bbxFlash">
              <stop offset="0%" stopColor="#F8FAFC" stopOpacity=".95" />
              <stop offset="30%" stopColor="#67E8F9" stopOpacity=".6" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="bbxLureBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e6f1f6" />
              <stop offset="60%" stopColor="#a9bfcb" />
              <stop offset="100%" stopColor="#6f8796" />
            </linearGradient>
          </defs>

          {MOTES.map(([x, y, r, o], i) => (
            <circle key={`m${i}`} className="bbx-mote" cx={x} cy={y} r={r} fill="#67E8F9"
              style={{ "--bbx-o": o }} />
          ))}
          {BUBBLES.map(([x, y, r, delay], i) => (
            <circle key={`b${i}`} className="bbx-bubble" cx={x} cy={y} r={r}
              fill="none" stroke="rgba(203, 232, 245, .5)" strokeWidth=".5"
              style={{ animationDelay: delay }} />
          ))}

          {/* Sonar-/Analysewelle, vom Kopf des Fisches ausgehend */}
          <circle className="bbx-sonar" cx="190" cy="156" r="30" fill="none" stroke="#22D3EE" strokeWidth=".8" />

          <g transform={`translate(${BITE_X},${BITE_Y})`}>
            <Lure />
          </g>

          <g transform={`translate(${FISH_X},${FISH_Y})`}>
            <g className="bbx-fish-fade">
              <g className="bbx-fish-move">
                <BuddyFish />
              </g>
            </g>
          </g>

          {/* Biss-Impuls */}
          <g transform={`translate(${BITE_X},${BITE_Y})`}>
            <circle className="bbx-flash" r="22" fill="url(#bbxFlash)" />
            <circle className="bbx-ring" r="16" fill="none" stroke="#22D3EE" strokeWidth="1" />
            {SPARKS.map(([angle, dist], i) => (
              <g key={`s${i}`} transform={`rotate(${angle})`}>
                <circle className="bbx-spark" r={i % 2 ? 0.9 : 1.2} fill="#67E8F9"
                  style={{ "--bbx-d": `${dist}px` }} />
              </g>
            ))}
          </g>
        </svg>

        <div className="bbx-logo">
          <p className="bbx-logo-word">BAIT<span>BUDDY</span></p>
          <p className="bbx-logo-claim">Bereit für deinen nächsten Fang.</p>
        </div>
      </div>

      <div className="bbx-skip">Tippen zum Überspringen</div>
    </div>
  );
}

// Ein Fehler in der Animation darf die App nie blockieren: statt des
// globalen Fehler-Screens wird das Overlay einfach weggelassen.
class SplashBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn("[SplashIntro] Animation übersprungen:", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function prefersReducedMotion() {
  try {
    return typeof window !== "undefined"
      && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function SplashIntroInner() {
  const [reduced] = useState(prefersReducedMotion);
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const skipTimer = useRef(null);

  useEffect(() => {
    const leaveMs = reduced ? SPLASH_TIMING.reducedLeaveMs : SPLASH_TIMING.leaveMs;
    const removeMs = reduced ? SPLASH_TIMING.reducedRemoveMs : SPLASH_TIMING.removeMs;
    const t1 = setTimeout(() => setLeaving(true), leaveMs);
    const t2 = setTimeout(() => setGone(true), removeMs);
    // Wird die App während der Animation in den Hintergrund geschickt, beim
    // Zurückkehren direkt die App zeigen statt einer halben Animation.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setGone(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(skipTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  if (gone) return null;

  const skip = () => {
    if (leaving) return;
    setLeaving(true);
    skipTimer.current = setTimeout(() => setGone(true), SPLASH_TIMING.skipFadeMs);
  };

  return <SplashScene reduced={reduced} leaving={leaving} onSkip={skip} />;
}

export default function SplashIntro() {
  return (
    <SplashBoundary>
      <SplashIntroInner />
    </SplashBoundary>
  );
}
