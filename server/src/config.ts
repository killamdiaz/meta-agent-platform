import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/postgres',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  coordinatorIntervalMs: Number(process.env.COORDINATOR_INTERVAL_MS || 15000),
  internetProxyUrl: process.env.INTERNET_PROXY_URL || '',
  internetProxyToken: process.env.INTERNET_PROXY_TOKEN || '',
  internetRequestTimeoutMs: Number(process.env.INTERNET_REQUEST_TIMEOUT_MS || 15000),
  searchApiKey: process.env.SEARCH_API_KEY || '',
  searchApiProvider: process.env.SEARCH_API_PROVIDER || 'tavily',
  resendApiKey: process.env.RESEND_API_KEY || '',
  defaultInternetAccess: String(process.env.DEFAULT_INTERNET_ACCESS || 'false').toLowerCase() === 'true',
  metaControllerAgentName: process.env.META_CONTROLLER_AGENT_NAME || 'Meta-Controller',
  metaControllerAgentRole:
    process.env.META_CONTROLLER_AGENT_ROLE ||
    'Supervisory AI overseeing all subordinate agents, responsible for coordination, safety, and approvals.',
  metaControllerAutoApprove: String(process.env.META_CONTROLLER_AUTO_APPROVE || '').toLowerCase() === 'true'
};
