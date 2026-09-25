import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const users = [
  {
    id: 'u1', email: 'kai@baitbuddy.test', full_name: 'Kai', created_at: '2026-06-01T10:00:00Z',
    last_sign_in_at: '2026-09-24T08:00:00Z', email_confirmed: true, providers: ['google'],
    plan: { id: 'elite', source: 'premium_pass', expires_at: '2026-10-01T10:00:00Z' },
    subscription: { id: 'basic', expires_at: '2026-10-20T10:00:00Z', payment_method: 'stripe', assigned_by: null },
  },
  {
    id: 'u2', email: 'lea@baitbuddy.test', full_name: '', created_at: '2026-09-20T10:00:00Z',
    last_sign_in_at: null, email_confirmed: false, providers: ['email'],
    plan: { id: 'free', source: 'base', expires_at: null },
    subscription: { id: 'free', expires_at: null, payment_method: null, assigned_by: null },
  },
];

const superAdminMock = {
  users: vi.fn(async () => ({ total: users.length, users })),
  assignPlan: vi.fn(),
  stats: vi.fn(() => new Promise(() => {})),
};
vi.mock('@/api/auth', () => ({ auth: { me: vi.fn(async () => ({ is_superuser: true })) } }));
vi.mock('@/api/frontendClient', () => ({ superAdmin: superAdminMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const { default: Admin } = await import('./Admin');

async function openUsers(user) {
  render(<MemoryRouter><Admin /></MemoryRouter>);
  await user.click(await screen.findByRole('tab', { name: 'Nutzer' }));
  return screen.findByRole('heading', { name: 'Kai' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => cleanup());

describe('Admin — Nutzer', () => {
  it('zeigt alle Konten mit Login, Anmeldeweg und geltendem Plan', async () => {
    const user = userEvent.setup();
    await openUsers(user);
    expect(screen.getByText('2 von 2')).toBeInTheDocument();
    const kai = screen.getByRole('heading', { name: 'Kai' }).closest('li');
    expect(within(kai).getByText('Google')).toBeInTheDocument();
    expect(within(kai).getByText(/Ultimate · Pass · bis/)).toBeInTheDocument();
    // Das gespeicherte Abo steht daneben, weil der Pass es gerade überdeckt.
    expect(within(kai).getByText(/^Basic · bis/)).toBeInTheDocument();
    const lea = screen.getByRole('heading', { name: 'lea@baitbuddy.test' }).closest('li');
    expect(within(lea).getByText('noch nie')).toBeInTheDocument();
    expect(within(lea).getByText(/E-Mail unbestätigt/)).toBeInTheDocument();
  });

  it('sucht und filtert', async () => {
    const user = userEvent.setup();
    await openUsers(user);
    await user.type(screen.getByLabelText('Nutzer suchen'), 'lea');
    expect(screen.queryByRole('heading', { name: 'Kai' })).toBeNull();
    await user.clear(screen.getByLabelText('Nutzer suchen'));
    await user.click(screen.getByRole('button', { name: 'Mit Plan' }));
    expect(screen.getByRole('heading', { name: 'Kai' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'lea@baitbuddy.test' })).toBeNull();
  });

  it('weist einen Plan zu und zeigt den neuen Stand', async () => {
    superAdminMock.assignPlan.mockResolvedValue({
      ok: true,
      user: { ...users[1], plan: { id: 'pro', source: 'subscription', expires_at: '2026-12-24T10:00:00Z' }, subscription: { id: 'pro', expires_at: '2026-12-24T10:00:00Z', payment_method: 'admin', assigned_by: 'kaisaschnitt99@gmail.com' } },
    });
    const user = userEvent.setup();
    await openUsers(user);
    const lea = screen.getByRole('heading', { name: 'lea@baitbuddy.test' }).closest('li');
    await user.click(within(lea).getByRole('button', { name: 'Plan zuweisen' }));
    await user.selectOptions(within(lea).getByLabelText('Plan'), 'pro');
    await user.selectOptions(within(lea).getByLabelText('Laufzeit'), '90');
    await user.click(within(lea).getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(superAdminMock.assignPlan).toHaveBeenCalledWith('u2', 'pro', 90));
    const updated = screen.getByRole('heading', { name: 'lea@baitbuddy.test' }).closest('li');
    await waitFor(() => expect(within(updated).getByText(/^Pro · bis/)).toBeInTheDocument());
    expect(within(updated).getByText('kaisaschnitt99@gmail.com')).toBeInTheDocument();
  });

  it('fragt vor dem Speichern nach und bricht bei "Abbrechen" ab', async () => {
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    await openUsers(user);
    const kai = screen.getByRole('heading', { name: 'Kai' }).closest('li');
    await user.click(within(kai).getByRole('button', { name: 'Plan zuweisen' }));
    await user.click(within(kai).getByRole('button', { name: 'Speichern' }));
    expect(superAdminMock.assignPlan).not.toHaveBeenCalled();
  });
});
