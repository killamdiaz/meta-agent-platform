import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

function requireOrgId(req: import('express').Request) {
  const orgId = typeof req.query.org_id === 'string' ? req.query.org_id : null;
  if (!orgId) {
    const error = new Error('org_id is required');
    (error as any).status = 400;
    throw error;
  }
  return orgId;
}

router.get('/summary', async (req, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const { rows } = await pool.query(
      `SELECT
        COALESCE(SUM(total_tokens),0) AS total_tokens,
        COALESCE(SUM(cost_usd),0) AS total_cost
       FROM forge_token_usage
      WHERE org_id = $1`,
      [orgId]
    );
    res.json(rows[0] ?? { total_tokens: 0, total_cost: 0 });
  } catch (error) {
    next(error);
  }
});

router.get('/daily', async (req, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const { rows } = await pool.query(
      `SELECT date_trunc('day', created_at) AS bucket,
              SUM(total_tokens) AS total_tokens,
              SUM(cost_usd) AS total_cost
         FROM forge_token_usage
        WHERE org_id = $1
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT 30`,
      [orgId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/monthly', async (req, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const { rows } = await pool.query(
      `SELECT date_trunc('month', created_at) AS bucket,
              SUM(total_tokens) AS total_tokens,
              SUM(cost_usd) AS total_cost
         FROM forge_token_usage
        WHERE org_id = $1
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT 12`,
      [orgId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/breakdown', async (req, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const { rows } = await pool.query(
      `SELECT source,
              SUM(total_tokens) AS total_tokens,
              SUM(cost_usd) AS total_cost
         FROM forge_token_usage
        WHERE org_id = $1
        GROUP BY source
        ORDER BY total_tokens DESC`,
      [orgId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/models', async (req, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const { rows } = await pool.query(
      `SELECT model_name,
              model_provider,
              SUM(total_tokens) AS total_tokens,
              SUM(cost_usd) AS total_cost
         FROM forge_token_usage
        WHERE org_id = $1
        GROUP BY model_name, model_provider
        ORDER BY total_tokens DESC`,
      [orgId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/agents', async (req, res, next) => {
  try {
    const orgId = requireOrgId(req);
    const { rows } = await pool.query(
      `SELECT agent_name,
              SUM(total_tokens) AS total_tokens,
              SUM(cost_usd) AS total_cost
         FROM forge_token_usage
        WHERE org_id = $1
        GROUP BY agent_name
        ORDER BY total_tokens DESC`,
      [orgId]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
