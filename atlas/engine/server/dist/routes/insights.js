import { Router } from 'express';
import { pool } from '../db.js';
import { agentBroker } from '../multiAgent/index.js';
const router = Router();
router.get('/overview', async (_req, res, next) => {
    try {
        const [agentCountResult, taskCountsResult, memoryCountResult, tasksPerDayResult, recentTasksResult] = await Promise.all([
            pool.query('SELECT COUNT(*)::text as count FROM agents'),
            pool.query(`SELECT status, COUNT(*)::int as count
           FROM tasks
          GROUP BY status`),
            pool.query(`SELECT COUNT(*)::text as count
           FROM agent_memory
          WHERE memory_type != 'short_term' OR expires_at IS NULL OR expires_at > NOW()`),
            pool.query(`SELECT TO_CHAR(day, 'YYYY-MM-DD') as day, count
           FROM (
                 SELECT date_trunc('day', generate_series(NOW() - INTERVAL '6 days', NOW(), INTERVAL '1 day')) AS day
           ) days
           LEFT JOIN (
             SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
               FROM tasks
              WHERE created_at >= NOW() - INTERVAL '7 days'
              GROUP BY date_trunc('day', created_at)
           ) task_counts USING (day)
           ORDER BY day`),
            pool.query(`SELECT t.id, t.prompt, t.status, t.created_at, t.updated_at, a.name AS agent_name
           FROM tasks t
           JOIN agents a ON a.id = t.agent_id
          ORDER BY t.created_at DESC
          LIMIT 10`)
        ]);
        const taskCounts = taskCountsResult.rows.reduce((acc, row) => {
            acc[row.status] = row.count;
            return acc;
        }, {});
        const tasksPerDay = tasksPerDayResult.rows.map((row) => ({
            day: row.day,
            count: row.count ?? 0
        }));
        res.json({
            agentCount: Number(agentCountResult.rows[0]?.count ?? 0),
            taskCounts: {
                total: Object.values(taskCounts).reduce((sum, value) => sum + value, 0),
                pending: taskCounts.pending ?? 0,
                working: taskCounts.working ?? 0,
                completed: taskCounts.completed ?? 0,
                error: taskCounts.error ?? 0
            },
            memoryCount: Number(memoryCountResult.rows[0]?.count ?? 0),
            uptimeSeconds: process.uptime(),
            tasksPerDay,
            recentTasks: recentTasksResult.rows.map((row) => ({
                id: row.id,
                prompt: row.prompt,
                status: row.status,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                agentName: row.agent_name
            })),
            tokenUsage: agentBroker.getTokenUsage()
        });
    }
    catch (error) {
        next(error);
    }
});
export default router;
