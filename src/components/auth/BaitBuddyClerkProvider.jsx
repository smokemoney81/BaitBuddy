import React from 'react';
import { ClerkProvider } from '@clerk/react';
import { deDE } from '@clerk/localizations';
import { clerkPublishableKey } from '@/lib/clerkLogin';

// Farben der Login-Seite (baitbuddy-v2.css), damit das Clerk-Fenster nicht
// als fremdes weißes Formular im dunklen Design steht.
const APPEARANCE = {
  variables: {
    colorPrimary: '#22d3ee',
    colorPrimaryForeground: '#04121f',
    colorBackground: '#071526',
    colorForeground: '#f8fafc',
    colorMutedForeground: '#94a3b8',
    colorInput: '#0b1324',
    colorInputForeground: '#f8fafc',
    colorNeutral: '#e2e8f0',
    colorDanger: '#f87171',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full max-w-full shadow-none border border-cyan-400/25',
  },
};

// Gemeinsamer Provider für das eingebettete Anmeldefenster und /ClerkCallback.
// Clerk ist hier nur Anmelde-Zwischenschritt; die App-Sitzung bleibt bb_token.
export default function BaitBuddyClerkProvider({ children }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey()} localization={deDE} appearance={APPEARANCE} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  );
}
