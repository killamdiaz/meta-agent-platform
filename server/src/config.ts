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
  metaControllerAutoApprove: String(process.env.META_CONTROLLER_AUTO_APPROVE || '').toLowerCase() === 'true',
  jwtSecret: process.env.JWT_SECRET || 'atlas-jwt-secret',
  bridgeHmacSecret: process.env.BRIDGE_HMAC_SECRET || 'atlas-bridge-secret',
  bridgeAgentHeader: process.env.BRIDGE_AGENT_HEADER || 'x-bridge-agent-id',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  bridgeBaseUrl:
    process.env.BRIDGE_BASE_URL || 'https://lighdepncfhiecqllmod.supabase.co/functions/v1',
  cacheTtlSeconds: Number(process.env.BRIDGE_CACHE_TTL_SECONDS || 60),
  rateLimitPerMinute: Number(process.env.BRIDGE_RATE_LIMIT_PER_MINUTE || 100),
  supabaseRequestTimeoutMs: Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 5000),
  supabaseRetryCount: Number(process.env.SUPABASE_RETRY_COUNT || 2)
};
