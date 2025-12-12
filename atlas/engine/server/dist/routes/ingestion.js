import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.post('/jobs', async (req, res, next) => {
    try {
        const orgId = typeof req.body.org_id === 'string' ? req.body.org_id : null;
        const source = typeof req.body.source === 'string' ? req.body.source : null;
        if (!orgId || !source) {
            res.status(400).json({ message: 'org_id and source are required' });
            return;
        }
        const { rows } = await pool.query(`INSERT INTO import_jobs (org_id, source, status, progress)
       VALUES ($1, $2, 'queued', 0)
       RETURNING *`, [orgId, source]);
        res.json(rows[0]);
    }
    catch (error) {
        next(error);
    }
});
router.get('/jobs', async (req, res, next) => {
    try {
        const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
        if (!orgId) {
            res.status(400).json({ message: 'org_id is required' });
            return;
        }
        const { rows } = await pool.query(`SELECT * FROM import_jobs WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50`, [orgId]);
        res.json(rows);
    }
    catch (error) {
        next(error);
    }
});
router.delete('/jobs/:id', async (req, res, next) => {
    try {
        const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
        const id = req.params.id;
        if (!orgId || !id) {
            res.status(400).json({ message: 'org_id and id are required' });
            return;
        }
        await pool.query(`DELETE FROM import_jobs WHERE id = $1 AND org_id = $2`, [id, orgId]);
        res.status(204).end();
    }
    catch (error) {
        next(error);
    }
});
router.get('/search', async (req, res, next) => {
    try {
        const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
        const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!orgId) {
            res.status(400).json({ message: 'org_id is required' });
            return;
        }
        if (!query) {
            res.json({ items: [] });
            return;
        }
        const { rows } = await pool.query(`SELECT id,
              source_type,
              source_id,
              content,
              metadata,
              created_at
         FROM forge_embeddings
        WHERE org_id = $1
          AND content ILIKE '%' || $2 || '%'
        ORDER BY created_at DESC
        LIMIT 20`, [orgId, query]);
        res.json({ items: rows });
    }
    catch (error) {
        next(error);
    }
});
export default router;
