import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import WebAdSlot from './WebAdSlot';

const state = vi.hoisted(() => ({ config: null, consent: null, load: vi.fn() }));
vi.mock('@/lib/webAds', () => ({
  getWebAdConfig: () => state.config,
  subscribeAdConsent: (callback) => { state.consent = callback; return () => {}; },
  loadAdSense: (...args) => state.load(...args),
}));
vi.mock('@/lib/adAnalytics', () => ({ trackAdEvent: vi.fn() }));

beforeEach(() => {
  state.config = { client: 'ca-pub-1234567890123456', slot: '1234567890' };
  state.consent = null;
  state.load.mockReset().mockResolvedValue(undefined);
  window.adsbygoogle = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320 });
});

describe('real web advertising', () => {
  it('does not contact provider without configuration or consent', () => {
    state.config = null;
    const { container } = render(<WebAdSlot placement="test" />);
    expect(container.innerHTML).toBe('');
    expect(state.load).not.toHaveBeenCalled();
  });
  it('requests once under StrictMode and removes slot on consent withdrawal', async () => {
    const { container } = render(<React.StrictMode><WebAdSlot placement="test" /></React.StrictMode>);
    expect(state.load).not.toHaveBeenCalled();
    act(() => state.consent(true));
    await waitFor(() => expect(window.adsbygoogle.length).toBe(1));
    expect(container.querySelector('ins').dataset.adSlot).toBe('1234567890');
    act(() => state.consent(false));
    expect(container.innerHTML).toBe('');
  });
  it('hides unfilled inventory without a fake creative', async () => {
    const { container } = render(<WebAdSlot placement="test" />);
    act(() => state.consent(true));
    await waitFor(() => expect(window.adsbygoogle.length).toBe(1));
    act(() => { container.querySelector('ins').dataset.adStatus = 'unfilled'; });
    await waitFor(() => expect(container.querySelector('aside').style.display).toBe('none'));
  });
});
