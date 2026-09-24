import React from 'react';
import { GraduationCap } from 'lucide-react';

export default function TutorialButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="bb-round-btn" aria-label="Anleitung starten" title="Anleitung starten">
      <GraduationCap size={22} aria-hidden="true" />
    </button>
  );
}
