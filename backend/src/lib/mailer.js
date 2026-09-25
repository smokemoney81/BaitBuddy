import nodemailer from 'nodemailer';

// Gemeinsamer SMTP-Versand für Support-Tickets, Ticket-Antworten und
// Rundmails aus dem Admin-Bereich.
//
// Der Transporter wird erst beim ersten Versand aus den Env-Variablen gebaut
// (nicht beim Modul-Import), damit eine später gesetzte Konfiguration und die
// Tests greifen und ein fehlendes SMTP das Backend nicht am Start hindert.

// Öffentliche Support-Adresse: Empfänger der Ticket-Benachrichtigungen und
// Reply-To der Rundmails. Per SUPPORT_EMAIL überschreibbar.
const DEFAULT_SUPPORT_EMAIL = 'kaisaschnitt99@gmail.com';

export function supportEmail() {
  return String(process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();
}

let cached = null;

export function getMailTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_PORT } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null;

  const key = `${SMTP_HOST}|${SMTP_PORT}|${SMTP_USER}|${SMTP_PASSWORD}`;
  if (cached?.key === key) return cached.transporter;

  try {
    const port = parseInt(SMTP_PORT, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
    cached = { key, transporter };
    return transporter;
  } catch (e) {
    console.warn('[mailer] SMTP-Transporter konnte nicht erstellt werden:', e.message);
    return null;
  }
}

export function mailFrom() {
  return `BaitBuddy Support <${process.env.SMTP_USER}>`;
}

export function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

// Absätze eines Freitexts als HTML (Zeilenumbrüche bleiben erhalten).
export function textToHtml(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}
