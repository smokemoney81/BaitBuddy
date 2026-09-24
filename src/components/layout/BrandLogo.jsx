import React from 'react';
import { Link } from 'react-router-dom';

export function BrandMark({ size = 40 }) {
  return (
    <svg
      viewBox="0 0 64 40"
      width={size}
      height={size * 0.625}
      aria-hidden="true"
      className="bb-brand-mark"
    >
      <path d="M5 20C15 6 37 4 49 20C37 36 15 34 5 20Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M49 20L61 9L58 20L61 31Z" fill="currentColor" />
      <path d="M22 11C26 17 26 23 22 29" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M29 9C33 13 38 13 42 11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="14" cy="18" r="2.4" fill="currentColor" />
    </svg>
  );
}

export default function BrandLogo({ size = 'md', align = 'center', withMark = true, to = '/Dashboard' }) {
  return (
    <Link
      to={to}
      className={`bb-brand bb-brand-${size} bb-brand-${align}`}
      aria-label="BaitBuddy Startseite"
    >
      {withMark && <BrandMark size={size === 'lg' ? 46 : 38} />}
      <span className="bb-brand-text">
        <span className="bb-brand-word">
          Bait<span className="bb-title-accent">Buddy</span>
        </span>
        <span className="bb-brand-tagline">Mehr als Angeln</span>
      </span>
    </Link>
  );
}
