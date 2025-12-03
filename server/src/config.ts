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
  slackClientId: process.env.SLACK_CLIENT_ID || '',
  slackClientSecret: process.env.SLACK_CLIENT_SECRET || '',
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',
  slackAppId: process.env.SLACK_APP_ID || '',
  slackRedirectUrl: process.env.SLACK_REDIRECT_URL || '',
  slackScopes: process.env.SLACK_SCOPES || 'app_mentions:read,channels:history,chat:write,files:read,commands,users:read,im:history',
  jiraClientId: process.env.JIRA_CLIENT_ID || '',
  jiraClientSecret: process.env.JIRA_CLIENT_SECRET || '',
  jiraRedirectUrl: process.env.JIRA_REDIRECT_URL || '',
  jiraScopes:
    process.env.JIRA_SCOPES ||
    'read:jira-work read:jira-user read:jira-project write:jira-work manage:jira-webhook offline_access',
  defaultOrgId: process.env.DEFAULT_ORG_ID || '',
  defaultAccountId: process.env.DEFAULT_ACCOUNT_ID || '',
  modelRouterUrl: process.env.MODEL_ROUTER_URL || '',
  crawlAdditionalPaths: process.env.CRAWL_ADDITIONAL_PATHS || '',
  crawlMaxPages: Number(process.env.CRAWL_MAX_PAGES || 50),
  licenseSecret: process.env.LICENSE_SECRET || 'dev-license-secret',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',')
};
