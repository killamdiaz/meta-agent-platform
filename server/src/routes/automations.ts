import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';

const router = Router();

const createAutomationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  automation_type: z.string().min(2, 'Type must be provided'),
  metadata: z.record(z.unknown()).default({}),
});

const automationIdSchema = z.string().uuid('Invalid automation id');

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, automation_type, metadata, created_at, updated_at
         FROM automations
        ORDER BY created_at DESC`
    );
    return res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = createAutomationSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO automations(name, automation_type, metadata)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, name, automation_type, metadata, created_at, updated_at`,
      [payload.name, payload.automation_type, JSON.stringify(payload.metadata ?? {})]
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:automationId', async (req, res, next) => {
  try {
    const automationId = automationIdSchema.parse(req.params.automationId);
    const payload = createAutomationSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE automations
          SET name = $2,
              automation_type = $3,
              metadata = $4::jsonb,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id, name, automation_type, metadata, created_at, updated_at`,
      [automationId, payload.name, payload.automation_type, JSON.stringify(payload.metadata ?? {})]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Automation not found' });
    }
    return res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
