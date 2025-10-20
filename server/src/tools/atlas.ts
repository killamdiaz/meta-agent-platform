import { AtlasBridgeClient, ATLAS_BRIDGE_DEFAULT_BASE_URL } from '../core/atlas/BridgeClient.js';

const ENV_BASE_URL = typeof process !== 'undefined' ? process.env?.ATLAS_BRIDGE_BASE_URL?.trim() : '';

const clientRegistry = new Map<string, AtlasBridgeClient>();

export { AtlasBridgeError, generateSignature } from '../core/atlas/BridgeClient.js';

export interface AtlasCredentials {
  token?: string;
  agentId: string;
  secret: string;
  baseUrl?: string;
  refreshToken?: () => Promise<string> | string;
  defaultCacheTtlMs?: number;
}

function resolveBaseUrl(candidate?: string): string {
  const provided = candidate?.trim();
  if (provided && provided.length > 0) {
    return provided.endsWith('/') ? provided.slice(0, -1) : provided;
  }
  if (ENV_BASE_URL && ENV_BASE_URL.length > 0) {
    return ENV_BASE_URL.endsWith('/') ? ENV_BASE_URL.slice(0, -1) : ENV_BASE_URL;
  }
  return ATLAS_BRIDGE_DEFAULT_BASE_URL;
}

function getClient(credentials: AtlasCredentials): AtlasBridgeClient {
  const baseUrl = resolveBaseUrl(credentials.baseUrl);
  const ttlKey = credentials.defaultCacheTtlMs !== undefined ? String(credentials.defaultCacheTtlMs) : 'default';
  const key = `${credentials.agentId}:${credentials.secret}:${baseUrl}:${ttlKey}`;
  let client = clientRegistry.get(key);
  if (!client) {
    client = new AtlasBridgeClient({
      agentId: credentials.agentId,
      secret: credentials.secret,
      baseUrl,
      token: credentials.token,
      tokenProvider: credentials.refreshToken,
      defaultCacheTtlMs: credentials.defaultCacheTtlMs,
    });
    clientRegistry.set(key, client);
    return client;
  }

  if (credentials.token) {
    client.setToken(credentials.token);
  }
  if (credentials.refreshToken) {
    client.setTokenProvider(credentials.refreshToken);
  }
  return client;
}

export interface UserSummaryResponse {
  userId: string;
  workspaceId: string;
  plan: string;
  email?: string;
  name?: string;
  activeModules?: string[];
  [key: string]: unknown;
}

export interface ContractRecord {
  id: string;
  status?: string;
  title?: string;
  parties?: string[];
  fileUrl?: string;
  [key: string]: unknown;
}

export interface ContractsResponse {
  contracts?: ContractRecord[];
  items?: ContractRecord[];
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CreateContractBody {
  title: string;
  parties: string[];
  fileUrl?: string;
  [key: string]: unknown;
}

export interface CreateContractResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface InvoiceRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  client?: string;
  issuedAt?: string;
  dueDate?: string;
  [key: string]: unknown;
}

export interface InvoicesResponse {
  invoices: InvoiceRecord[];
  summary?: {
    total?: number;
    paid?: number;
    pending?: number;
    count?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CreateTaskBody {
  title: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high' | string;
  description?: string;
  source?: string;
  [key: string]: unknown;
}

export interface CreateTaskResponse {
  taskId: string;
  status: string;
  [key: string]: unknown;
}

export interface SendNotificationBody {
  type: string;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendNotificationResponse {
  status: string;
  activityId?: string;
  [key: string]: unknown;
}

export async function getUserSummary(params: AtlasCredentials): Promise<UserSummaryResponse> {
  const client = getClient(params);
  return client.request<UserSummaryResponse>({
    path: '/bridge-user-summary',
    method: 'GET',
  });
}

export interface GetContractsParams extends AtlasCredentials {
  status?: string;
  limit?: number;
}

export async function getContracts(params: GetContractsParams): Promise<ContractsResponse> {
  const client = getClient(params);
  return client.request<ContractsResponse>({
    path: '/bridge-contracts',
    method: 'GET',
    query: {
      status: params.status,
      limit: params.limit,
    },
  });
}

export interface CreateContractParams extends AtlasCredentials {
  body: CreateContractBody;
}

export async function createContract(params: CreateContractParams): Promise<CreateContractResponse> {
  const { body, ...credentials } = params;
  const client = getClient(credentials);
  return client.request<CreateContractResponse>({
    path: '/bridge-contracts',
    method: 'POST',
    body,
    logMessage: 'Creating contract...',
  });
}

export interface GetInvoicesParams extends AtlasCredentials {
  limit?: number;
}

export async function getInvoices(params: GetInvoicesParams): Promise<InvoicesResponse> {
  const client = getClient(params);
  return client.request<InvoicesResponse>({
    path: '/bridge-invoices',
    method: 'GET',
    query: {
      limit: params.limit,
    },
  });
}

export interface CreateTaskParams extends AtlasCredentials {
  body: CreateTaskBody;
}

export async function createTask(params: CreateTaskParams): Promise<CreateTaskResponse> {
  const { body, ...credentials } = params;
  const client = getClient(credentials);
  return client.request<CreateTaskResponse>({
    path: '/bridge-tasks',
    method: 'POST',
    body,
    logMessage: 'Creating task...',
  });
}

export interface SendNotificationParams extends AtlasCredentials {
  body: SendNotificationBody;
}

export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResponse> {
  const { body, ...credentials } = params;
  const client = getClient(credentials);
  return client.request<SendNotificationResponse>({
    path: '/bridge-notify',
    method: 'POST',
    body,
    logMessage: 'Sending notification...',
  });
}
