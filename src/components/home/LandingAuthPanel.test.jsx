import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const authMock = {
  login: vi.fn(async () => ({})),
  register: vi.fn(async () => ({})),
  me: vi.fn(async () => ({ oauth_linked: true })),
};
const supabaseMock = {
  auth: {
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
  },
};
const setGuestSessionMock = vi.fn();
const isOnlineMock = vi.fn(() => true);
const maybeShowEventPopupMock = vi.fn(async () => false);

vi.mock('@/api/auth', () => ({ auth: authMock }));
vi.mock('@/api/supabaseClient', () => ({ supabase: supabaseMock }));
vi.mock('@/components/utils/guestMode', () => ({ setGuestSession: setGuestSessionMock }));
vi.mock('@/utils/networkStatus', () => ({ isOnline: isOnlineMock }));
vi.mock('@/utils', () => ({ createPageUrl: (page) => `/${page}` }));
vi.mock('@/lib/publicUrl', () => ({ buildPublicUrl: (path) => `https://baitbuddy.test${path}` }));
vi.mock('@/lib/loginEventPopup', () => ({
  maybeShowEventPopup: maybeShowEventPopupMock,
  EVENT_POPUP_DWELL_MS: 0,
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(async () => {}) } }));

const { default: LandingAuthPanel } = await import('./LandingAuthPanel');

// window.location.href ist in jsdom nicht schreibbar ohne Navigation-Fehler —
// deshalb durch ein einfaches Objekt ersetzen und die Zuweisung beobachten.
let assignedHref;

beforeEach(() => {
  vi.clearAllMocks();
  isOnlineMock.mockReturnValue(true);
  maybeShowEventPopupMock.mockResolvedValue(false);
  assignedHref = undefined;
  delete window.location;
  window.location = {
    get href() {
      return assignedHref ?? 'http://localhost/';
    },
    set href(value) {
      assignedHref = value;
    },
  };
});

afterEach(() => cleanup());

describe('LandingAuthPanel — Anmeldung', () => {
  it('meldet mit E-Mail und Passwort an und navigiert ins Dashboard', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(authMock.login).toHaveBeenCalledWith('angler@baitbuddy.test', 'geheim123'));
    await waitFor(() => expect(assignedHref).toBe('/Dashboard'));
  });

  it('zeigt die Server-Fehlermeldung, wenn die Anmeldung scheitert', async () => {
    authMock.login.mockRejectedValueOnce({ data: { error: 'Falsche Zugangsdaten' } });
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'falsch');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falsche Zugangsdaten');
    expect(assignedHref).toBeUndefined();
  });

  it('blockt die Anmeldung ohne Internetverbindung mit klarem Hinweis', async () => {
    isOnlineMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Keine Internetverbindung');
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it('wartet auf den Event-Hinweis, bevor es navigiert', async () => {
    maybeShowEventPopupMock.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'a@b.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(maybeShowEventPopupMock).toHaveBeenCalled());
    await waitFor(() => expect(assignedHref).toBe('/Dashboard'));
  });
});

describe('LandingAuthPanel — Registrierung', () => {
  it('wechselt in den Registrierungsmodus und legt ein Konto an', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.click(screen.getByRole('button', { name: 'Registrieren' }));
    // Im Registrierungsmodus kommt das Namensfeld dazu.
    const nameField = await screen.findByPlaceholderText('Vollständiger Name');
    await user.type(nameField, 'Test Angler');
    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'neu@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));

    await waitFor(() =>
      expect(authMock.register).toHaveBeenCalledWith('neu@baitbuddy.test', 'geheim123', 'Test Angler')
    );
    expect(authMock.login).not.toHaveBeenCalled();
  });

  it('blendet das Namensfeld im Anmeldemodus aus', () => {
    render(<LandingAuthPanel />);
    expect(screen.queryByPlaceholderText('Vollständiger Name')).toBeNull();
  });
});

describe('LandingAuthPanel — Passwort zuruecksetzen', () => {
  it('verlangt zuerst eine E-Mail-Adresse', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-Mail-Adresse');
    expect(supabaseMock.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('verschickt den Reset-Link und bestaetigt neutral (kein Konto-Leak)', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));

    await waitFor(() =>
      expect(supabaseMock.auth.resetPasswordForEmail).toHaveBeenCalledWith('angler@baitbuddy.test', {
        redirectTo: 'https://baitbuddy.test/ResetPassword',
      })
    );
    // Die Meldung darf nicht verraten, ob das Konto existiert.
    expect(await screen.findByRole('status')).toHaveTextContent('Falls ein Konto mit dieser E-Mail existiert');
  });

  it('meldet Fehler beim Versand', async () => {
    supabaseMock.auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: new Error('Rate limit erreicht'),
    });
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limit erreicht');
  });
});

describe('LandingAuthPanel — Social Login und Gastzugang', () => {
  it('startet den Google-OAuth-Flow mit Web-Redirect', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.click(screen.getByRole('button', { name: /Mit Google fortfahren/ }));

    await waitFor(() =>
      expect(supabaseMock.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'https://baitbuddy.test/AuthCallback' },
      })
    );
  });

  it('zeigt OAuth-Fehler aus dem globalen Event an', async () => {
    render(<LandingAuthPanel />);

    window.dispatchEvent(
      new CustomEvent('baitbuddy:oauth-error', { detail: { message: 'Abbruch durch Nutzer' } })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Abbruch durch Nutzer');
  });

  it('legt eine Gastsitzung an und navigiert ins Dashboard', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.click(screen.getByRole('button', { name: 'Als Gast fortfahren' }));

    expect(setGuestSessionMock).toHaveBeenCalledWith({ is_guest: true });
    expect(assignedHref).toBe('/Dashboard');
  });
});

describe('LandingAuthPanel — OAuth Migration Modal', () => {
  it('zeigt die OAuth-Migration-Modal nach E-Mail-Login, wenn noch nicht verlinkt', async () => {
    authMock.me.mockResolvedValueOnce({ oauth_linked: false });
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(authMock.login).toHaveBeenCalled());
    await waitFor(() => expect(authMock.me).toHaveBeenCalled());
    expect(await screen.findByText(/Sicherheit erhöhen/)).toBeInTheDocument();
    expect(assignedHref).toBeUndefined();
  });

  it('navigiert direkt zum Dashboard, wenn bereits mit OAuth verlinkt', async () => {
    authMock.me.mockResolvedValueOnce({ oauth_linked: true });
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(assignedHref).toBe('/Dashboard'));
  });

  it('schließt Modal ohne Navigieren mit "Später"-Button', async () => {
    authMock.me.mockResolvedValueOnce({ oauth_linked: false });
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    await user.type(screen.getByPlaceholderText('E-Mail Adresse'), 'angler@baitbuddy.test');
    await user.type(screen.getByPlaceholderText('Passwort'), 'geheim123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(screen.queryByText(/Sicherheit erhöhen/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Später' }));

    await waitFor(() => expect(assignedHref).toBe('/Dashboard'));
  });
});

describe('LandingAuthPanel — Passwort-Sichtbarkeit', () => {
  it('schaltet zwischen verborgenem und sichtbarem Passwort um', async () => {
    const user = userEvent.setup();
    render(<LandingAuthPanel />);

    const field = screen.getByPlaceholderText('Passwort');
    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByLabelText('Passwort anzeigen'));
    expect(field).toHaveAttribute('type', 'text');

    await user.click(screen.getByLabelText('Passwort verbergen'));
    expect(field).toHaveAttribute('type', 'password');
  });
});
