import express from 'express';
import cors from 'cors';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initDb } from './db.js';
import agentsRoute from './routes/agents.js';
import tasksRoute from './routes/tasks.js';
import commandsRoute from './routes/commands.js';
import agentBuilderRoute from './routes/agentBuilder.js';
import { coordinator } from './core/Coordinator.js';
import insightsRoute from './routes/insights.js';
import memoryRoute from './routes/memory.js';
import metaControllerRoute from './routes/metaController.js';
import multiAgentRoute from './routes/multiAgent.js';
import chatRoute from './routes/chat.js';
import { metaController } from './core/MetaController.js';
import automationsRoute from './routes/automations.js';
import { toolRuntime } from './multiAgent/ToolRuntime.js';
import agentConfigRoute from './routes/agentConfig.js';
import automationBuilderRoute from './routes/automationBuilder.js';
import connectorsRoute from './routes/connectors.js';
import usageRoute from './routes/usage.js';
import ingestionRoute from './routes/ingestion.js';
import { startIngestionWorker } from './services/IngestionWorker.js';
import { buildJiraApiRouter } from './connectors/jira/api/index.js';
import { errorCounter, metricsHandler, requestCounter } from './metrics.js';
import { validateLicense } from './middleware/license.js';
import licenseRoute from './routes/license.js';
import deploymentRoute from './routes/deployment.js';
import samlRoute from './routes/saml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  await initDb();
  const app = express();

  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, _res, next) => {
    requestCounter.inc({ route: req.path, method: req.method });
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/metrics', metricsHandler());

  app.use('/api/license', licenseRoute);
  app.use('/api/deployment', deploymentRoute);
  app.use(samlRoute);
  app.use(validateLicense);

  app.use('/agents', agentsRoute);
  app.use('/tasks', tasksRoute);
  app.use('/commands', commandsRoute);
  app.use('/agent-builder', agentBuilderRoute);
  app.use('/agent-config', agentConfigRoute);
  app.use('/insights', insightsRoute);
  app.use('/memory', memoryRoute);
  app.use('/meta-controller', metaControllerRoute);
  app.use('/multi-agent', multiAgentRoute);
  app.use('/chat', chatRoute);
  app.use('/automations', automationsRoute);
  app.use('/automation-builder', automationBuilderRoute);
  app.use('/connectors', connectorsRoute);
  // Alias for Jira OAuth callback when redirect URI is set to /oauth/jira/callback
  app.use('/oauth/jira', buildJiraApiRouter());
  app.use('/usage', usageRoute);
  app.use('/ingestion', ingestionRoute);

  const publicDir = path.resolve(__dirname, 'public');
  if (existsSync(publicDir)) {
    const apiPrefixes = [
      '/agents',
      '/tasks',
      '/commands',
      '/agent-builder',
      '/agent-config',
      '/automation-builder',
      '/insights',
      '/memory',
      '/multi-agent',
      '/meta-controller',
      '/automations',
      '/connectors',
      '/exhaust',
      '/ingestion',
      '/usage',
      '/healthz'
    ];
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      if (apiPrefixes.some((prefix) => req.path.startsWith(prefix))) {
        next();
        return;
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    errorCounter.inc({ route: req.path, method: req.method, status: 400 });
    res.status(400).json({ message: err instanceof Error ? err.message : 'Unknown error' });
  });

  app.listen(config.port, () => {
    console.log(`Agent framework API listening on port ${config.port}`);
  });

  await metaController.getMetaAgentId();
  coordinator.start();
  await toolRuntime.initialise();
  startIngestionWorker();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server', error);
  process.exit(1);
});
