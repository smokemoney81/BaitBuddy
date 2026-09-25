import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

const clerkState = { isLoaded: true, isSignedIn: true };
const getToken = vi.fn(async () => 'clerk-session-token');
const signOut = vi.fn(async () => {});
const loginWithClerk = vi.fn(async () => ({ token: 'bb' }));

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }) => <>{children}</>,
  ClerkLoaded: ({ children }) => <>{children}</>,
  ClerkFailed: () => null,
  useAuth: () => ({ ...clerkState, getToken }),
  useClerk: () => ({ signOut }),
}));
vi.mock('@clerk/localizations', () => ({ deDE: {} }));
vi.mock('@/api/frontendClient', () => ({ auth: { loginWithClerk } }));
vi.mock('@/lib/guestStore', () => ({ postLoginPath: () => '/Dashboard' }));
vi.mock('@/lib/clerkLogin', () => ({ clerkPublishableKey: () => 'pk_test_x' }));

const { default: ClerkCallback } = await import('./ClerkCallback');

beforeEach(() => {
  vi.clearAllMocks();
  clerkState.isLoaded = true;
  clerkState.isSignedIn = true;
  sessionStorage.clear();
  window.history.replaceState(null, '', '/ClerkCallback');
});

afterEach(() => cleanup());

describe('ClerkCallback', () => {
  it('tauscht die Clerk-Sitzung und wechselt beim Abmelden ins Dashboard', async () => {
    render(<ClerkCallback />);
    await waitFor(() => expect(loginWithClerk).toHaveBeenCalledWith('clerk-session-token'));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/Dashboard' }));
  });

  it('meldet Clerk bei einem Fehler ab und merkt sich die Meldung für die Fehleransicht', async () => {
    loginWithClerk.mockRejectedValueOnce({ data: { error: 'Deine E-Mail-Adresse ist bei Clerk nicht bestätigt' } });
    render(<ClerkCallback />);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/ClerkCallback?error=1' }));
    expect(sessionStorage.getItem('bb_clerk_login_error')).toBe('Deine E-Mail-Adresse ist bei Clerk nicht bestätigt');
  });

  it('zeigt die gemerkte Meldung, nie Text aus der URL', () => {
    sessionStorage.setItem('bb_clerk_login_error', 'Clerk ist gerade nicht erreichbar.');
    window.history.replaceState(null, '', '/ClerkCallback?error=1&msg=Fremdtext');
    render(<ClerkCallback />);
    expect(screen.getByRole('alert')).toHaveTextContent('Clerk ist gerade nicht erreichbar.');
    expect(screen.queryByText(/Fremdtext/)).toBeNull();
    expect(loginWithClerk).not.toHaveBeenCalled();
  });

  it('erklärt, wenn keine Clerk-Anmeldung vorliegt', async () => {
    clerkState.isSignedIn = false;
    render(<ClerkCallback />);
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht abgeschlossen');
    expect(loginWithClerk).not.toHaveBeenCalled();
  });
});
