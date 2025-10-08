import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './db.js';
import agentsRoute from './routes/agents.js';
import tasksRoute from './routes/tasks.js';
import commandsRoute from './routes/commands.js';
import { coordinator } from './core/Coordinator.js';

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

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(400).json({ message: err instanceof Error ? err.message : 'Unknown error' });
  });

  app.listen(config.port, () => {
    console.log(`Agent framework API listening on port ${config.port}`);
  });

  coordinator.start();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server', error);
  process.exit(1);
});
