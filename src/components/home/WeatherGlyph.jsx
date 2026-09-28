import React, { useId } from 'react';

// Farbige Wetter-Symbole der Dashboard-Vorlage (Sonne gelb, Wolken weiß,
// Regen blau). Bewusst SVG statt Emoji: skaliert scharf, ist im Theme
// einfärbbar und bleibt ein reines Bild (aria-hidden, Text steht daneben).

/** Ordnet einen WMO-Wettercode (Open-Meteo) einer Symbolart zu. */
export function glyphKind(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return 'cloudy';
  if (c === 0) return 'clear';
  if (c === 1 || c === 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 95) return 'thunder';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return 'snow';
  return 'rain';
}

function Cloud({ fill, dx = 0, dy = 0, scale = 1 }) {
  return (
    <g fill={fill} transform={`translate(${dx} ${dy}) scale(${scale})`}>
      <circle cx="17" cy="30" r="7" />
      <circle cx="26.5" cy="25" r="10" />
      <circle cx="35" cy="31" r="6" />
      <rect x="11" y="30" width="30" height="8" rx="4" />
    </g>
  );
}

function Sun({ cx, cy, r, core, ray }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const inner = r + 2.5;
    const outer = r + 6;
    return (
      <line
        key={i}
        x1={cx + Math.cos(a) * inner}
        y1={cy + Math.sin(a) * inner}
        x2={cx + Math.cos(a) * outer}
        y2={cy + Math.sin(a) * outer}
      />
    );
  });
  return (
    <g>
      <g stroke={ray} strokeWidth="2.4" strokeLinecap="round">{rays}</g>
      <circle cx={cx} cy={cy} r={r} fill={core} />
    </g>
  );
}

function Moon({ cx, cy, r, maskId }) {
  return (
    <g>
      <mask id={maskId}>
        <rect x="0" y="0" width="48" height="48" fill="white" />
        <circle cx={cx + r * 0.55} cy={cy - r * 0.35} r={r * 0.85} fill="black" />
      </mask>
      <circle cx={cx} cy={cy} r={r} fill="#F6E7A1" mask={`url(#${maskId})`} />
    </g>
  );
}

export default function WeatherGlyph({ code, night = false, size = 32, className = '' }) {
  const id = useId().replace(/:/g, '');
  const kind = glyphKind(code);
  const cloudFill = `url(#${id}-cloud)`;
  const darkFill = `url(#${id}-dark)`;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`bb-wx-glyph ${className}`.trim()}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-cloud`} x1="0" y1="14" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C9D6E4" />
        </linearGradient>
        <linearGradient id={`${id}-dark`} x1="0" y1="14" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B8C5D4" />
          <stop offset="1" stopColor="#7D8DA1" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#FFE27A" />
          <stop offset="1" stopColor="#FFB21E" />
        </radialGradient>
      </defs>

      {kind === 'clear' && (night
        ? <Moon cx={24} cy={24} r={11} maskId={`${id}-moon`} />
        : <Sun cx={24} cy={24} r={9} core={`url(#${id}-sun)`} ray="#FFC43D" />)}

      {kind === 'partly' && (
        <>
          {night
            ? <Moon cx={18} cy={17} r={8} maskId={`${id}-moon`} />
            : <Sun cx={18} cy={17} r={7.5} core={`url(#${id}-sun)`} ray="#FFC43D" />}
          <Cloud fill={cloudFill} dx={3} dy={3} scale={0.95} />
        </>
      )}

      {kind === 'cloudy' && (
        <>
          <Cloud fill={darkFill} dx={6} dy={-5} scale={0.8} />
          <Cloud fill={cloudFill} dx={-1} dy={2} />
        </>
      )}

      {kind === 'fog' && (
        <>
          <Cloud fill={cloudFill} dx={0} dy={-4} />
          <g stroke="#C9D6E4" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="40" x2="36" y2="40" />
            <line x1="16" y1="45" x2="32" y2="45" />
          </g>
        </>
      )}

      {kind === 'rain' && (
        <>
          <Cloud fill={cloudFill} dx={0} dy={-5} />
          <g stroke="#4DB2FF" strokeWidth="2.6" strokeLinecap="round">
            <line x1="17" y1="38" x2="15" y2="44" />
            <line x1="24" y1="38" x2="22" y2="44" />
            <line x1="31" y1="38" x2="29" y2="44" />
          </g>
        </>
      )}

      {kind === 'snow' && (
        <>
          <Cloud fill={cloudFill} dx={0} dy={-5} />
          <g fill="#E8F4FF">
            <circle cx="16" cy="41" r="2" />
            <circle cx="24" cy="44" r="2" />
            <circle cx="32" cy="41" r="2" />
          </g>
        </>
      )}

      {kind === 'thunder' && (
        <>
          <Cloud fill={darkFill} dx={0} dy={-5} />
          <path d="M25 33 L19 42 H24 L21 48 L30 38 H25 L28 33 Z" fill="#FFC43D" />
        </>
      )}
    </svg>
  );
}
