import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// Schwere/irrelevante Abhängigkeiten stubben, damit der Test das Feed-Verhalten
// (Like + Kommentar über die memoisierte PostCard) isoliert prüft.
vi.mock('@/components/utils/SwipeToRefresh', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('@/components/community/CompetitionCard', () => ({ default: () => null }));
vi.mock('@/components/community/LeaderboardCard', () => ({ default: () => null }));
vi.mock('@/components/community/CompetitionsSection', () => ({ default: () => null }));
vi.mock('@/components/community/ChatWidget', () => ({ default: () => null }));
vi.mock('@/components/premium/PlanGuard', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('@/hooks/useFeatureTracking', () => ({ useFeatureTracking: () => {} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/api/auth', () => ({ auth: { me: vi.fn(async () => ({ email: 'me@x.de' })) } }));
vi.mock('@/entities/User', () => ({
  User: { list: vi.fn(async () => [{ email: 'other@x.de', full_name: 'Otto' }]) },
}));

const likePost = vi.fn(async () => ({}));
const commentCreate = vi.fn(async () => ({ id: 'c1', post_id: 'p1', text: 'nice', created_by: 'me@x.de' }));
const commentFilter = vi.fn(async () => ([]));

vi.mock('@/api/frontendClient', () => ({
  integrations: { Core: { UploadFile: vi.fn() } },
  api: { get: vi.fn(async () => []) },
  community: { likePost: (...a) => likePost(...a) },
  entities: {
    Post: { list: vi.fn(async () => ([{ id: 'p1', created_by: 'other@x.de', text: 'Hallo Welt', likes: 2, created_at: new Date().toISOString() }])), update: vi.fn(), delete: vi.fn() },
    Comment: { filter: (...a) => commentFilter(...a), create: (...a) => commentCreate(...a) },
    Competition: { list: vi.fn(async () => []), filter: vi.fn(async () => []) },
    ChatSession: { filter: vi.fn(async () => []) },
  },
}));

import Community from './Community';

describe('Community – Feed-Interaktionen (memoisierte PostCard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn();
  });
  afterEach(() => cleanup());

  it('liked einen Post optimistisch und ruft die API', async () => {
    render(<Community />);
    // Der Post-Feed liegt unter dem Feed-Tab (Default ist "Wettbewerbe").
    fireEvent.click(await screen.findByRole('tab', { name: /Feed/ }));
    await screen.findByText('Hallo Welt');

    const likeBtn = screen.getByRole('button', { name: '2' });
    fireEvent.click(likeBtn);

    await waitFor(() => expect(likePost).toHaveBeenCalledWith('p1'));
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
  });

  it('sendet einen Kommentar über das isolierte Eingabefeld', async () => {
    render(<Community />);
    // Der Post-Feed liegt unter dem Feed-Tab (Default ist "Wettbewerbe").
    fireEvent.click(await screen.findByRole('tab', { name: /Feed/ }));
    await screen.findByText('Hallo Welt');

    // Kommentar-Toggle (zeigt die Kommentarzahl 0)
    fireEvent.click(screen.getByRole('button', { name: '0' }));

    const input = await screen.findByPlaceholderText('Dein Kommentar...');
    fireEvent.change(input, { target: { value: 'nice' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    await waitFor(() => expect(commentCreate).toHaveBeenCalledWith({ post_id: 'p1', text: 'nice' }));
  });

  // Regressionstest zum Community-Kommentar-Bug: Kommentare wurden früher
  // plattformweit ohne post_id-Filter geladen (entities.Comment.list('', 1000)),
  // wodurch sie hinter einem harten Server-Limit verschwinden konnten. Jetzt
  // werden nur die Kommentare der aktuell geladenen Posts angefragt.
  it('lädt Kommentare gefiltert nach den geladenen Post-IDs, nicht platt die ganze Plattform', async () => {
    render(<Community />);
    fireEvent.click(await screen.findByRole('tab', { name: /Feed/ }));
    await screen.findByText('Hallo Welt');

    await waitFor(() => expect(commentFilter).toHaveBeenCalledWith(
      expect.objectContaining({ post_ids: 'p1' })
    ));
  });
});
