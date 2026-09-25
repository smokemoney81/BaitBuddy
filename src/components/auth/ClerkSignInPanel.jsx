import React from 'react';
import { SignIn, ClerkLoading, ClerkLoaded, ClerkFailed } from '@clerk/react';
import BaitBuddyClerkProvider from '@/components/auth/BaitBuddyClerkProvider';

// Eingebettete Clerk-Anmeldung (Anmelden und Registrieren in einem Ablauf).
// Wird von LandingAuthPanel lazy geladen, damit Clerk nicht im Start-Bundle
// landet. Nach erfolgreicher Anmeldung leitet Clerk auf /ClerkCallback weiter,
// dort wird die Clerk-Sitzung gegen die bb_token-Sitzung getauscht.
// Hash-Routing (#/…), weil die Login-Seite unter "/" keine Unterpfade hat.
export default function ClerkSignInPanel() {
  return (
    <BaitBuddyClerkProvider>
      <ClerkLoading>
        <p role="status" className="bb-landing-msg is-info">Anmeldung wird geladen …</p>
      </ClerkLoading>
      <ClerkFailed>
        <p role="alert" className="bb-landing-msg is-error">
          Diese Anmeldung konnte nicht geladen werden. Bitte melde dich mit E-Mail oder Google an.
        </p>
      </ClerkFailed>
      <ClerkLoaded>
        <SignIn
          routing="hash"
          withSignUp
          forceRedirectUrl="/ClerkCallback"
          signUpForceRedirectUrl="/ClerkCallback"
        />
      </ClerkLoaded>
    </BaitBuddyClerkProvider>
  );
}
