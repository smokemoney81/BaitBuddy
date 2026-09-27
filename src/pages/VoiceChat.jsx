import React from 'react';
import { KiBuddyBetaInner } from './KiBuddyBeta';
import PremiumGuard from '@/components/premium/PremiumGuard';

// "Buddy Live" (siehe KiBuddyBeta.jsx) im Live-Modus vorausgewählt — derselbe
// Screen, derselbe Gesprächsverlauf, keine eigene Sitzung mehr.
export default function VoiceChat() {
  return (
    <PremiumGuard requiredPlan="free" feature="KI-Buddy Chat">
      <KiBuddyBetaInner initialMode="live" />
    </PremiumGuard>
  );
}
