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
import { metaController } from './core/MetaController.js';
import automationsRoute from './routes/automations.js';
import { toolRuntime } from './multiAgent/ToolRuntime.js';
import agentConfigRoute from './routes/agentConfig.js';
import automationBuilderRoute from './routes/automationBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  await initDb();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/agents', agentsRoute);
  app.use('/tasks', tasksRoute);
  app.use('/commands', commandsRoute);
  app.use('/agent-builder', agentBuilderRoute);
  app.use('/agent-config', agentConfigRoute);
  app.use('/insights', insightsRoute);
  app.use('/memory', memoryRoute);
  app.use('/meta-controller', metaControllerRoute);
  app.use('/multi-agent', multiAgentRoute);
  app.use('/automations', automationsRoute);
  app.use('/automation-builder', automationBuilderRoute);

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

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(400).json({ message: err instanceof Error ? err.message : 'Unknown error' });
  });

  app.listen(config.port, () => {
    console.log(`Agent framework API listening on port ${config.port}`);
  });

  await metaController.getMetaAgentId();
  coordinator.start();
  await toolRuntime.initialise();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server', error);
  process.exit(1);
});
