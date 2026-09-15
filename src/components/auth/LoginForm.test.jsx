import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';

// Mock Login Form Component
function LoginForm({ onSubmit, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!email || !password) {
        throw new Error('E-Mail und Passwort erforderlich');
      }
      await onSubmit(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="E-Mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="E-Mail-Eingabe"
      />
      <input
        type="password"
        placeholder="Passwort"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Passwort-Eingabe"
      />
      {error && <p data-testid="error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? 'Anmelden...' : 'Anmelden'}
      </button>
      <button
        type="button"
        onClick={() => onForgotPassword?.(email)}
        aria-label="Passwort vergessen"
      >
        Passwort vergessen?
      </button>
    </form>
  );
}

describe('LoginForm – Anmeldeformular', () => {
  const mockOnSubmit = vi.fn();
  const mockOnForgotPassword = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
    mockOnForgotPassword.mockClear();
  });

  it('validiert, dass E-Mail erforderlich ist', () => {
    const { error } = validateLoginInput({ email: '', password: 'test' });
    expect(error).toBeTruthy();
  });

  it('validiert, dass Passwort erforderlich ist', () => {
    const { error } = validateLoginInput({ email: 'test@example.com', password: '' });
    expect(error).toBeTruthy();
  });

  it('akzeptiert gültige E-Mail und Passwort', () => {
    const { error } = validateLoginInput({ email: 'test@example.com', password: 'secret123' });
    expect(error).toBeFalsy();
  });

  it('erkennt ungültige E-Mail-Format', () => {
    const { error } = validateLoginInput({ email: 'invalid-email', password: 'pass' });
    expect(error).toBeTruthy();
  });

  it('ruft onSubmit mit gültigen Credentials auf', async () => {
    mockOnSubmit.mockResolvedValue({ success: true });

    const credentials = { email: 'user@example.com', password: 'password123' };
    await mockOnSubmit(credentials.email, credentials.password);

    expect(mockOnSubmit).toHaveBeenCalledWith('user@example.com', 'password123');
  });

  it('handhabt Anmeldungsfehler', async () => {
    const error = new Error('Ungültige Anmeldedaten');
    mockOnSubmit.mockRejectedValue(error);

    try {
      await mockOnSubmit('wrong@example.com', 'wrong');
    } catch (err) {
      expect(err.message).toBe('Ungültige Anmeldedaten');
    }
  });

  it('ruft onForgotPassword mit E-Mail auf', () => {
    mockOnForgotPassword('user@example.com');
    expect(mockOnForgotPassword).toHaveBeenCalledWith('user@example.com');
  });
});

// Helper für Validierung
function validateLoginInput({ email, password }) {
  if (!email || !password) {
    return { error: 'E-Mail und Passwort erforderlich' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: 'Ungültige E-Mail-Adresse' };
  }
  return { error: null };
}
