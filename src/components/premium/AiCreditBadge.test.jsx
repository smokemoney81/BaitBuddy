import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiCreditBadge from './AiCreditBadge';
import { ai } from '@/api/frontendClient';
import { notifyAiUsageChanged } from '@/lib/aiUsageBus';

vi.mock('@/api/frontendClient', () => ({
  ai: { usage: vi.fn() },
}));

const USAGE = {
  ok: true,
  used: 100,
  limit: 500,
  remaining: 400,
  resets_at: '2026-10-01T00:00:00.000Z',
  costs: { chat: 2, tts: 1, tts_chars: 200, realtime: 150, vision: 5, tool: 3 },
  plan_quotas: { free: 500, basic: 5000, pro: 12000, elite: 30000 },
  recent: [
    { feature: 'chat', tokens: 2, created_at: '2026-09-27T10:00:00.000Z' },
  ],
};

function renderBadge(user = { id: 'u1' }) {
  return render(
    <MemoryRouter>
      <AiCreditBadge user={user} />
    </MemoryRouter>
  );
}

describe('AiCreditBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('rendert nichts ohne Nutzer', () => {
    ai.usage.mockResolvedValue(USAGE);
    const { container } = renderBadge(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert nichts, solange kein Guthaben geladen ist', async () => {
    ai.usage.mockRejectedValue(new Error('offline'));
    const { container } = renderBadge();
    await waitFor(() => expect(ai.usage).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt das verbleibende Guthaben nach dem Laden', async () => {
    ai.usage.mockResolvedValue(USAGE);
    renderBadge();
    expect(await screen.findByText('400')).toBeInTheDocument();
  });

  it('öffnet die Verbrauchsübersicht mit letzten Nutzungen beim Tippen', async () => {
    ai.usage.mockResolvedValue(USAGE);
    renderBadge();
    const badge = await screen.findByRole('button', { name: /KI-Guthaben/ });
    fireEvent.click(badge);
    expect(await screen.findByText('Dein KI-Guthaben')).toBeInTheDocument();
    expect(screen.getByText('Buddy-Antwort')).toBeInTheDocument();
  });

  it('lädt das Guthaben nach einer Buddy-Nutzung erneut (aiUsageBus)', async () => {
    ai.usage.mockResolvedValue(USAGE);
    renderBadge();
    await screen.findByText('400');

    ai.usage.mockResolvedValue({ ...USAGE, remaining: 398 });
    act(() => { notifyAiUsageChanged(); });

    await waitFor(() => expect(screen.getByText('398')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('färbt die Anzeige bei aufgebrauchtem Guthaben als Warnung', async () => {
    ai.usage.mockResolvedValue({ ...USAGE, used: 500, remaining: 0 });
    renderBadge();
    const badge = await screen.findByRole('button', { name: /KI-Guthaben/ });
    expect(badge.className).toContain('bb-ai-credit-badge--exhausted');
  });
});
