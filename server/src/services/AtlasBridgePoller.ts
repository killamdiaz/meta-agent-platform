import { AtlasBridgeClient, type AtlasBridgeClientOptions } from '../core/atlas/BridgeClient.js';

const POLL_INTERVAL_MS = 15000;

let client: AtlasBridgeClient | null = null;
let loopPromise: Promise<void> | null = null;

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop() {
  while (client) {
    const activeClient = client;
    try {
      await activeClient.request({ path: '/fetch-status', method: 'GET', skipCache: true, cacheTtlMs: 0 });
      await activeClient.request({ path: '/bridge-user-summary', method: 'GET', skipCache: true, cacheTtlMs: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Bridge polling failed:', message);
    }
    await delay(POLL_INTERVAL_MS);
    if (client !== activeClient) {
      // Configuration changed; restart loop iteration immediately.
      continue;
    }
  }
}

function ensureLoop() {
  if (!loopPromise) {
    loopPromise = runLoop().finally(() => {
      loopPromise = null;
    });
  }
}

export function configureAtlasBridgePolling(options?: Omit<AtlasBridgeClientOptions, 'defaultCacheTtlMs'> & {
  defaultCacheTtlMs?: number;
}) {
  if (!options) {
    client = null;
    return;
  }

  client = new AtlasBridgeClient({
    ...options,
    defaultCacheTtlMs: options.defaultCacheTtlMs ?? 0,
  });
  ensureLoop();
}

export function stopAtlasBridgePolling() {
  client = null;
}
