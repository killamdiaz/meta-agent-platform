import client from 'prom-client';

client.collectDefaultMetrics();

export const requestCounter = new client.Counter({
  name: 'requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'method'],
});

export const errorCounter = new client.Counter({
  name: 'errors_total',
  help: 'Total HTTP errors',
  labelNames: ['route', 'method', 'status'],
});

export const tokensConsumed = new client.Counter({
  name: 'tokens_consumed_total',
  help: 'Total tokens consumed across model calls',
});

export const slackEventsProcessed = new client.Counter({
  name: 'slack_events_processed_total',
  help: 'Slack events processed by API',
});

export const workflowRuns = new client.Counter({
  name: 'workflow_runs_total',
  help: 'Workflow runs handled by server',
});

export function metricsHandler() {
  return async (_req: any, res: any) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  };
}
