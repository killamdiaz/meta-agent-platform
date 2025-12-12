import { Router } from 'express';
import { AIConnectorGenerator } from '../atlas/ai/generator-service.js';
import { ConnectorService } from '../atlas/core/connector-service.js';
import { PostgresConnectorStore } from '../atlas/core/connector-store.js';
import { config } from '../config.js';
const router = Router();
const connectorService = new ConnectorService(new PostgresConnectorStore());
const generator = new AIConnectorGenerator(connectorService);
function tenantId(req) {
    return req.headers['x-tenant-id'] || req.body.tenantId || config.defaultOrgId || 'default';
}
router.post('/generate-connector', async (req, res, next) => {
    try {
        const prompt = req.body?.prompt || '';
        if (!prompt) {
            res.status(400).json({ message: 'prompt is required' });
            return;
        }
        const result = await generator.generateConnector(tenantId(req), prompt);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
export default router;
