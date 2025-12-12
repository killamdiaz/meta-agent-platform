import { pool } from '../db.js';
import { config } from '../config.js';
import { sendMail } from '../utils/sendMail.js';
class MailQueueServiceClass {
    async enqueue({ agentId, to, subject, html }) {
        const { rows } = await pool.query(`INSERT INTO sent_messages(agent_id, to_email, subject, html, status)
       VALUES ($1, $2, $3, $4, 'queued')
       RETURNING *`, [agentId, to, subject, html]);
        return rows[0];
    }
    async markSent(id, response) {
        await pool.query(`UPDATE sent_messages
          SET status = 'sent', response = $2, error = NULL, updated_at = NOW()
        WHERE id = $1`, [id, response]);
    }
    async markFailed(id, message) {
        await pool.query(`UPDATE sent_messages
          SET status = 'failed', error = $2, updated_at = NOW()
        WHERE id = $1`, [id, message]);
    }
    async processPending(limit = 10) {
        if (!config.resendApiKey) {
            return;
        }
        const { rows } = await pool.query(`SELECT * FROM sent_messages
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT $1`, [limit]);
        for (const record of rows) {
            try {
                const response = await sendMail({ to: record.to_email, subject: record.subject, html: record.html });
                await this.markSent(record.id, response);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown mail error';
                await this.markFailed(record.id, message);
            }
        }
    }
}
export const MailQueueService = new MailQueueServiceClass();
