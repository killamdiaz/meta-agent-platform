import { Router } from 'express';
import { z } from 'zod';
import { metaController } from '../core/MetaController.js';
const router = Router();
router.get('/approvals', async (req, res, next) => {
    try {
        const statusParam = req.query.status ? String(req.query.status) : undefined;
        const status = statusParam && ['pending', 'approved', 'rejected'].includes(statusParam)
            ? statusParam
            : undefined;
        const approvals = await metaController.listApprovals(status);
        res.json({ items: approvals });
    }
    catch (error) {
        next(error);
    }
});
router.post('/approvals/:id/resolve', async (req, res, next) => {
    try {
        const body = z
            .object({
            status: z.enum(['approved', 'rejected']),
            notes: z.string().optional(),
        })
            .parse(req.body);
        const approval = await metaController.resolveApproval(req.params.id, body.status, body.notes);
        res.json(approval);
    }
    catch (error) {
        next(error);
    }
});
router.get('/events', async (req, res, next) => {
    try {
        const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 200;
        const events = await metaController.listEvents(limit);
        res.json({ items: events });
    }
    catch (error) {
        next(error);
    }
});
router.get('/conversation-graph', async (req, res, next) => {
    try {
        const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 100;
        const edges = await metaController.listConversationEdges(limit);
        res.json({ items: edges });
    }
    catch (error) {
        next(error);
    }
});
export default router;
