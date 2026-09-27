import React from 'react';
import { KiBuddyBetaInner } from './KiBuddyBeta';
import PremiumGuard from '@/components/premium/PremiumGuard';

// "Buddy Live" (siehe KiBuddyBeta.jsx) im Hands-free-Modus vorausgewählt —
// derselbe Screen, derselbe Gesprächsverlauf, keine eigene Sitzung mehr.
export default function HandsFreeBuddy() {
  return (
    <PremiumGuard requiredPlan="free" feature="Hands-free Buddy">
      <KiBuddyBetaInner initialMode="handsfree" />
    </PremiumGuard>
  );
}
