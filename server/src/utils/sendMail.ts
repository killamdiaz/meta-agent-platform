import axios from 'axios';
import { config } from '../config.js';

export interface SendMailPayload {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendMail({ to, subject, html, from }: SendMailPayload) {
  const RESEND_API_KEY = config.resendApiKey;
  if (!RESEND_API_KEY) {
    throw new Error('Resend API key is not configured. Set RESEND_API_KEY in the environment.');
  }

  const payload = {
    from: from ?? 'Atlas OS <noreply@atlasos.app>',
    to,
    subject,
    html,
  };

  const response = await axios.post('https://api.resend.com/emails', payload, {
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 10_000,
  });

  return response.data;
}
