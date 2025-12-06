import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const port = process.env.EXHAUST_PORT || 4100;
const allowedOrigins = process.env.EXHAUST_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? ['*'];

const app = express();
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));

/**
 * In-memory store; swap with Redis/Kafka later.
 */
const streams = new Map();
const subscribers = new Map();

const toLog = (streamId, body, level, source) => ({
  id: uuidv4(),
  timestamp: new Date().toISOString(),
  level: level || 'INFO',
  message: body || '',
  source,
  streamId,
});

function broadcast(streamId, log) {
  const subs = subscribers.get(streamId);
  if (!subs) return;
  const payload = `event: log\ndata: ${JSON.stringify(log)}\n\n`;
  for (const res of subs) {
    res.write(payload);
  }
}

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.get('/streams', (_req, res) => {
  res.json({ items: Array.from(streams.values()) });
});

app.post('/streams', (req, res) => {
  const name = (req.body?.name || '').toString();
  const ticketKey = req.body?.ticketKey ? req.body.ticketKey.toString() : null;
  const createdBy = (req.body?.createdBy || 'You').toString();
  if (!name.trim()) return res.status(400).json({ message: 'name required' });
  const id = uuidv4();
  const token = `exh_live_${Math.random().toString(36).slice(2, 22)}`;
  const host = req.get('host');
  const protocol = process.env.EXHAUST_PUBLIC_PROTOCOL || req.protocol;
  const streamUrl = `${protocol}://${host}/streams/${id}/ingest`;
  const now = new Date().toISOString();
  const stream = {
    id,
    name,
    ticketKey,
    linkedTicket: ticketKey ? `Ticket ${ticketKey}` : null,
    status: 'waiting',
    createdBy,
    createdAt: now,
    lastActivity: now,
    streamUrl,
    token,
    logs: [],
  };
  streams.set(id, stream);
  res.json({ stream });
});

app.get('/streams/:id', (req, res) => {
  const stream = streams.get(req.params.id);
  if (!stream) return res.status(404).json({ message: 'not_found' });
  res.json({ stream });
});

app.get('/streams/:id/events', (req, res) => {
  const stream = streams.get(req.params.id);
  if (!stream) return res.status(404).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const set = subscribers.get(stream.id) || new Set();
  set.add(res);
  subscribers.set(stream.id, set);
  res.write(`event: heartbeat\ndata: ok\n\n`);
  req.on('close', () => {
    set.delete(res);
  });
});

app.post('/streams/:id/ingest', express.text({ type: '*/*', limit: '2mb' }), (req, res) => {
  const stream = streams.get(req.params.id);
  if (!stream) return res.status(404).json({ message: 'not_found' });
  const auth = req.headers.authorization || '';
  const token = auth.replace(/Bearer\s+/i, '');
  if (!token || token !== stream.token) {
    return res.status(401).json({ message: 'invalid_token' });
  }
  const message = typeof req.body === 'string' ? req.body : req.body?.message || '';
  if (!message.trim()) return res.status(400).json({ message: 'message required' });
  const log = toLog(stream.id, message, req.body?.level, req.body?.source);
  stream.logs.push(log);
  stream.lastActivity = log.timestamp;
  stream.status = 'active';
  streams.set(stream.id, stream);
  broadcast(stream.id, log);
  res.json({ status: 'ok' });
});

app.post('/streams/:id/disconnect', (req, res) => {
  const stream = streams.get(req.params.id);
  if (!stream) return res.status(404).json({ message: 'not_found' });
  stream.status = 'disconnected';
  stream.lastActivity = new Date().toISOString();
  streams.set(stream.id, stream);
  res.json({ status: 'disconnected' });
});

app.listen(port, () => {
  console.log(`[exhaust] listening on ${port}`);
});
