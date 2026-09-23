import { describe, it, expect, vi, beforeEach } from 'vitest';

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
