import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { initDb } from './db.js';
import agentsRoute from './routes/agents.js';
import tasksRoute from './routes/tasks.js';
import commandsRoute from './routes/commands.js';
import memoryRoute from './routes/memory.js';
import { coordinator } from './core/Coordinator.js';
import { agentEvents, type AgentEventName, type AgentEventPayloads } from './events.js';
import { agentManager } from './core/AgentManager.js';

async function bootstrap() {
  await initDb();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const apiRouter = express.Router();
  apiRouter.use('/agents', agentsRoute);
  apiRouter.use('/tasks', tasksRoute);
  apiRouter.use('/commands', commandsRoute);
  apiRouter.use('/memory', memoryRoute);

  app.use('/api', apiRouter);
  app.use('/agents', agentsRoute);
  app.use('/tasks', tasksRoute);
  app.use('/commands', commandsRoute);
  app.use('/memory', memoryRoute);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(400).json({ message: err instanceof Error ? err.message : 'Unknown error' });
  });

  const server = http.createServer(app);

  const wss = new WebSocketServer({ server, path: '/api/chat' });

  wss.on('connection', (socket) => {
    const handlers = new Map<string, (payload: AgentEventPayloads[AgentEventName]) => void>();

    const events: AgentEventName[] = [
      'task:queued',
      'task:start',
      'task:thought',
      'task:action',
      'task:completed',
      'task:error'
    ];

    for (const eventName of events) {
      const handler = (payload: AgentEventPayloads[typeof eventName]) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ event: eventName, ...payload }));
        }
      };
      agentEvents.on(eventName, handler as (payload: AgentEventPayloads[typeof eventName]) => void);
      handlers.set(eventName as string, handler);
    }

    socket.on('message', async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        const agentId = typeof payload.agent_id === 'string' ? payload.agent_id : payload.agentId;
        const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
        if (!agentId || !prompt) {
          socket.send(JSON.stringify({ event: 'socket:error', message: 'agent_id and prompt are required' }));
          return;
        }
        await agentManager.addTask(agentId, prompt);
      } catch (error) {
        socket.send(
          JSON.stringify({
            event: 'socket:error',
            message: error instanceof Error ? error.message : 'Unknown error'
          })
        );
      }
    });

    socket.on('close', () => {
      handlers.forEach((handler, eventName) => {
        agentEvents.off(eventName as AgentEventName, handler as any);
      });
    });
  });

  server.listen(config.port, () => {
    console.log(`Agent framework API listening on port ${config.port}`);
  });

  coordinator.start();
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server', error);
  process.exit(1);
});
