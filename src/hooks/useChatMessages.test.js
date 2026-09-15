import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatMessages } from './useChatMessages';

describe('useChatMessages – Chat-Message-Management', () => {
  it('initialiert mit leerer Message-Liste', () => {
    const { result } = renderHook(() => useChatMessages());
    expect(result.current.messages).toEqual([]);
  });

  it('initialiert mit initial Message, wenn übergeben', () => {
    const { result } = renderHook(() => useChatMessages('Hallo!'));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual({
      role: 'assistant',
      content: 'Hallo!',
    });
  });

  it('addMessage fügt eine neue Message hinzu', () => {
    const { result } = renderHook(() => useChatMessages());
    act(() => {
      result.current.addMessage('user', 'Wie geht es?');
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toEqual({
      role: 'user',
      content: 'Wie geht es?',
    });
  });

  it('addMessage kann mehrere Messages hinzufügen', () => {
    const { result } = renderHook(() => useChatMessages());
    act(() => {
      result.current.addMessage('user', 'Frage 1');
      result.current.addMessage('assistant', 'Antwort 1');
      result.current.addMessage('user', 'Frage 2');
    });
    expect(result.current.messages).toHaveLength(3);
  });

  it('clearMessages setzt Messages auf Leer-Liste zurück', () => {
    const { result } = renderHook(() => useChatMessages());
    act(() => {
      result.current.addMessage('user', 'Test');
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
  });

  it('clearMessages stellt Initial-Message wieder her, wenn vorhanden', () => {
    const { result } = renderHook(() => useChatMessages('Initial'));
    act(() => {
      result.current.addMessage('user', 'User Input');
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Initial');
  });

  it('setMessages erlaubt direktes Setzen der Message-Liste', () => {
    const { result } = renderHook(() => useChatMessages());
    act(() => {
      result.current.setMessages([
        { role: 'user', content: 'Test 1' },
        { role: 'assistant', content: 'Response 1' },
      ]);
    });
    expect(result.current.messages).toHaveLength(2);
  });

  it('messagesRef hält die aktuellen Messages', () => {
    const { result } = renderHook(() => useChatMessages());
    act(() => {
      result.current.addMessage('user', 'Test');
    });
    expect(result.current.messagesRef.current).toEqual(result.current.messages);
  });
});
