import { Router } from 'express';
import { MarketplaceService } from '../atlas/marketplace/marketplace-service.js';
import { PostgresConnectorStore } from '../atlas/core/connector-store.js';
const router = Router();
const marketplace = new MarketplaceService(new PostgresConnectorStore());
router.get('/', async (_req, res, next) => {
    try {
        const connectors = await marketplace.list();
        res.json(connectors);
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id/download', async (req, res, next) => {
    try {
        const buffer = await marketplace.downloadAsZip(req.params.id);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="connector.zip"');
        res.send(buffer);
    }
    catch (err) {
        next(err);
    }
});
export default router;
