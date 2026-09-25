import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SplashIntro, { SPLASH_TIMING } from './SplashIntro';

function mockReducedMotion(reduce) {
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('SplashIntro „Buddy erwacht"', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    setVisibility('visible');
  });

  it('läuft ca. 3 Sekunden und gibt die App danach frei', () => {
    render(<SplashIntro />);
    const splash = screen.getByTestId('splash-intro');
    expect(splash).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Bereit für deinen nächsten Fang.')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(SPLASH_TIMING.leaveMs - 1); });
    expect(splash).not.toHaveClass('bbx-leave');

    act(() => { vi.advanceTimersByTime(1); });
    expect(splash).toHaveClass('bbx-leave');

    act(() => { vi.advanceTimersByTime(SPLASH_TIMING.removeMs - SPLASH_TIMING.leaveMs); });
    expect(screen.queryByTestId('splash-intro')).toBeNull();
  });

  it('hält die Gesamtdauer bei ungefähr 3 Sekunden', () => {
    expect(SPLASH_TIMING.leaveMs).toBeGreaterThanOrEqual(2800);
    expect(SPLASH_TIMING.removeMs).toBeLessThanOrEqual(3500);
  });

  it('lässt sich per Tippen überspringen', () => {
    render(<SplashIntro />);
    fireEvent.click(screen.getByTestId('splash-intro'));
    expect(screen.getByTestId('splash-intro')).toHaveClass('bbx-leave');

    act(() => { vi.advanceTimersByTime(SPLASH_TIMING.skipFadeMs); });
    expect(screen.queryByTestId('splash-intro')).toBeNull();
  });

  it('nutzt bei „Bewegung reduzieren" die kurze, ruhige Variante', () => {
    mockReducedMotion(true);
    render(<SplashIntro />);
    expect(screen.getByTestId('splash-intro')).toHaveClass('bbx-reduced');

    act(() => { vi.advanceTimersByTime(SPLASH_TIMING.reducedRemoveMs); });
    expect(screen.queryByTestId('splash-intro')).toBeNull();
  });

  it('endet sofort, wenn die App in den Hintergrund wechselt', () => {
    render(<SplashIntro />);
    act(() => { setVisibility('hidden'); });
    expect(screen.queryByTestId('splash-intro')).toBeNull();
  });

  it('blockiert die App nie, wenn matchMedia fehlt oder wirft', () => {
    window.matchMedia = () => { throw new Error('nicht verfügbar'); };
    render(<SplashIntro />);
    expect(screen.getByTestId('splash-intro')).not.toHaveClass('bbx-reduced');

    act(() => { vi.advanceTimersByTime(SPLASH_TIMING.removeMs); });
    expect(screen.queryByTestId('splash-intro')).toBeNull();
  });

  it('rendert die Kinder-App unabhängig vom Overlay', () => {
    render(
      <>
        <SplashIntro />
        <main>Login</main>
      </>
    );
    expect(screen.getByText('Login')).toBeInTheDocument();
  });
});
