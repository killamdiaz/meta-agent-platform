import { pool } from '../db.js';
import { config } from '../config.js';
import { sendMail } from '../utils/sendMail.js';

export interface MailQueueRecord {
  id: string;
  agent_id: string | null;
  to_email: string;
  subject: string;
  html: string;
  status: 'queued' | 'sent' | 'failed';
  response: unknown | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueMailInput {
  agentId: string | null;
  to: string;
  subject: string;
  html: string;
}

class MailQueueServiceClass {
  async enqueue({ agentId, to, subject, html }: QueueMailInput): Promise<MailQueueRecord> {
    const { rows } = await pool.query<MailQueueRecord>(
      `INSERT INTO sent_messages(agent_id, to_email, subject, html, status)
       VALUES ($1, $2, $3, $4, 'queued')
       RETURNING *`,
      [agentId, to, subject, html],
    );

    return rows[0];
  }

  async markSent(id: string, response: unknown): Promise<void> {
    await pool.query(
      `UPDATE sent_messages
          SET status = 'sent', response = $2, error = NULL, updated_at = NOW()
        WHERE id = $1`,
      [id, response],
    );
  }

  async markFailed(id: string, message: string): Promise<void> {
    await pool.query(
      `UPDATE sent_messages
          SET status = 'failed', error = $2, updated_at = NOW()
        WHERE id = $1`,
      [id, message],
    );
  }

  async processPending(limit = 10): Promise<void> {
    if (!config.resendApiKey) {
      return;
    }

    const { rows } = await pool.query<MailQueueRecord>(
      `SELECT * FROM sent_messages
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT $1`,
      [limit],
    );

    for (const record of rows) {
      try {
        const response = await sendMail({ to: record.to_email, subject: record.subject, html: record.html });
        await this.markSent(record.id, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown mail error';
        await this.markFailed(record.id, message);
      }
    }
  }
}

export const MailQueueService = new MailQueueServiceClass();
