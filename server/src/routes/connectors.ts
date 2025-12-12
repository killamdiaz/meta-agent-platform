import { Router } from 'express';
import axios from 'axios';
import { config } from '../config.js';
import { ConnectorService } from '../atlas/core/connector-service.js';
import { PostgresConnectorStore } from '../atlas/core/connector-store.js';
import { MarketplaceService } from '../atlas/marketplace/marketplace-service.js';
import { PostgresCredentialVault } from '../atlas/vault/credential-vault.js';
import { UniversalConnectorRuntime } from '../atlas/runtime/runtime.js';
import { ConnectorTestRunner } from '../atlas/tests/test-runner.js';

const router = Router();
const store = new PostgresConnectorStore();
const connectorService = new ConnectorService(store);
const vault = new PostgresCredentialVault();
const runtime = new UniversalConnectorRuntime(
  vault,
  axios.create({ timeout: config.connectorRuntimeTimeoutMs || 15000 }),
);
const marketplaceService = new MarketplaceService(store);
const testRunner = new ConnectorTestRunner(runtime);

function tenantId(req: any) {
  return (req.headers['x-tenant-id'] as string) || req.body.tenantId || config.defaultOrgId || 'default';
}

router.post('/install', async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    if (req.body?.connectorId) {
      const connector = await connectorService.installPublishedConnector(req.body.connectorId, tenant);
      res.json(connector);
      return;
    }
    const connector = await connectorService.installConnector(tenant, req.body);
    res.json(connector);
  } catch (err) {
    next(err);
  }
});

router.post('/draft', async (req, res, next) => {
  try {
    const connector = await connectorService.saveDraft(tenantId(req), req.body);
    res.json(connector);
  } catch (err) {
    next(err);
  }
});

router.post('/publish', async (req, res, next) => {
  try {
    const connector = await connectorService.publishConnector(tenantId(req), req.body, Boolean(req.body?.verified));
    res.json(connector);
  } catch (err) {
    next(err);
  }
});

router.get('/installed', async (req, res, next) => {
  try {
    const connectors = await connectorService.listInstalled(tenantId(req));
    res.json(connectors);
  } catch (err) {
    next(err);
  }
});

router.get('/drafts', async (req, res, next) => {
  try {
    const connectors = await connectorService.listDrafts(tenantId(req));
    res.json(connectors);
  } catch (err) {
    next(err);
  }
});

router.get('/marketplace', async (_req, res, next) => {
  try {
    const connectors = await marketplaceService.list();
    res.json(connectors);
  } catch (err) {
    next(err);
  }
});

router.get('/marketplace/:id/download', async (req, res, next) => {
  try {
    const buffer = await marketplaceService.downloadAsZip(req.params.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="connector.zip"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.post('/run', async (req, res, next) => {
  try {
    const { connectorId, action, input, authKey } = req.body;
    const connector = await connectorService.getConnector(connectorId);
    if (!connector) {
      res.status(404).json({ message: 'Connector not found' });
      return;
    }
    const result = await runtime.executeAction({
      connector,
      action,
      input: input || {},
      tenantId: tenantId(req),
      authKey,
      transformName: req.body.transformName,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    const connectorId = req.body.connectorId;
    const connector = await connectorService.getConnector(connectorId);
    if (!connector) {
      res.status(404).json({ message: 'Connector not found' });
      return;
    }
    const result = await testRunner.run(connector, tenantId(req), req.body.authKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/secrets', async (req, res, next) => {
  try {
    const { connectorId, key, value } = req.body;
    if (!connectorId || !key || !value) {
      res.status(400).json({ message: 'connectorId, key and value are required' });
      return;
    }
    await vault.saveSecret(tenantId(req), connectorId, key, value);
    res.json({ status: 'ok' });
  } catch (err) {
    next(err);
  }
});

export default router;
