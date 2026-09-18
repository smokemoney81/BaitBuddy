import express from 'express';
import nodemailer from 'nodemailer';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = express.Router();

// Email-Transporter (mit Fallback auf Console-Logging)
let emailTransporter;
try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT == 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
} catch (e) {
  console.warn('Email-Transporter konnte nicht initialisiert werden:', e.message);
}

// POST /api/support/tickets - Neues Support-Ticket erstellen
router.post('/support/tickets', requireAuth, async (req, res) => {
  try {
    const { subject, category, message } = req.body;
    const user_email = req.user.email;
    const user_name = req.user.user_metadata?.name || 'Nutzer';

    if (!subject || !message) {
      return res.status(400).json({ error: 'Betreff und Nachricht erforderlich' });
    }

    // Ticket in Supabase speichern
    const { data, error } = await supabase
      .from('support_tickets')
      .insert([
        {
          subject: subject.trim(),
          category: category || 'sonstiges',
          message: message.trim(),
          user_email,
          user_name,
          status: 'offen',
          created_date: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.error('Supabase-Fehler beim Speichern des Tickets:', error);
      return res.status(500).json({ error: 'Ticket konnte nicht gespeichert werden' });
    }

    const ticket = data?.[0];

    // Email-Versand (Entwickler-Benachrichtigung + Bestätigungsmail an Nutzer)
    if (emailTransporter) {
      const developerEmail = process.env.DEVELOPER_EMAIL;
      const escapeHtml = (str) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(str).replace(/[&<>"']/g, (c) => map[c]);
      };

      const ticketDetailsHtml = `
        <h2>Neues Support-Ticket</h2>
        <p><strong>ID:</strong> ${escapeHtml(ticket?.id || '')}</p>
        <p><strong>Von:</strong> ${escapeHtml(user_name)} (${escapeHtml(user_email)})</p>
        <p><strong>Kategorie:</strong> ${escapeHtml(category || '')}</p>
        <p><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
        <hr />
        <p><strong>Nachricht:</strong></p>
        <pre>${escapeHtml(message)}</pre>
        <hr />
        <p><em>Dieses Ticket wurde am ${new Date().toLocaleString('de-DE')} erstellt.</em></p>
      `;

      // 1. Benachrichtigung an Entwickler
      if (!developerEmail) {
        console.warn('DEVELOPER_EMAIL nicht konfiguriert — Entwickler-Benachrichtigung wird nicht versendet');
      } else {
        const developerMailOptions = {
          from: `BaitBuddy Support <${process.env.SMTP_USER}>`,
          to: developerEmail,
          subject: `[TICKET] ${escapeHtml(subject)}`,
          html: ticketDetailsHtml,
          replyTo: user_email,
        };

        try {
          await emailTransporter.sendMail(developerMailOptions);
          logger.info('Entwickler-Benachrichtigung versendet für Ticket:', { ticketId: ticket?.id });
        } catch (emailErr) {
          console.error('Entwickler-Email-Versand fehlgeschlagen:', emailErr.message);
        }
      }

      // 2. Bestätigungsmail an Nutzer
      const confirmationMailOptions = {
        from: `BaitBuddy Support <${process.env.SMTP_USER}>`,
        to: user_email,
        subject: 'Ticket-Bestätigung – Wir haben deine Anfrage erhalten',
        html: `
          <h2>Danke für deine Anfrage!</h2>
          <p>Hallo ${escapeHtml(user_name)},</p>
          <p>wir haben dein Support-Ticket erhalten und werden uns schnellstmöglich darum kümmern.</p>
          <p><strong>Ticket-ID:</strong> ${escapeHtml(ticket?.id || '')}</p>
          <p><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
          <p><strong>Erstellt:</strong> ${new Date().toLocaleString('de-DE')}</p>
          <hr />
          <p>Bitte bewahre diese Ticket-ID auf, falls du Fragen zum Status hast.</p>
          <p>Du wirst eine weitere E-Mail erhalten, sobald dein Ticket bearbeitet wird.</p>
          <hr />
          <p>Viele Grüße,<br />das BaitBuddy-Team</p>
        `,
      };

      try {
        await emailTransporter.sendMail(confirmationMailOptions);
        logger.info('Bestätigungsmail versendet an Nutzer', { user_email });
      } catch (emailErr) {
        console.error('Bestätigungsmail-Versand fehlgeschlagen:', emailErr.message);
      }
    } else {
      console.warn('SMTP nicht konfiguriert — Emails werden nicht versendet. Benoetigte Env-Vars: SMTP_HOST, SMTP_USER, SMTP_PASSWORD, DEVELOPER_EMAIL');
    }

    // Erfolgreiche Antwort an Client
    return res.status(201).json({
      message: 'Ticket erfolgreich erstellt',
      ticket: {
        id: ticket?.id,
        status: 'offen',
      },
    });
  } catch (err) {
    console.error('Fehler beim Erstellen des Tickets:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// GET /api/support/tickets - Tickets des aktuellen Benutzers abrufen
router.get('/support/tickets', requireAuth, async (req, res) => {
  try {
    const userEmail = req.user.email;

    let query = supabase
      .from('support_tickets')
      .select('*')
      .eq('user_email', userEmail);

    query = query.order('created_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Supabase-Fehler beim Abrufen von Tickets:', error);
      return res.status(500).json({ error: 'Tickets konnten nicht abgerufen werden' });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('Fehler beim Abrufen der Tickets:', err);
    return res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

export default router;
