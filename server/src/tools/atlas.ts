import crypto from 'node:crypto';

interface AtlasRequestAuth {
  token: string;
  agentId: string;
  secret: string;
  baseUrl?: string;
}

interface AtlasRequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  logMessage?: string;
}

interface FetchConfig extends AtlasRequestAuth, AtlasRequestOptions {}

const DEFAULT_BASE_URL = (() => {
  if (typeof process !== 'undefined' && process.env?.ATLAS_BRIDGE_BASE_URL) {
    return process.env.ATLAS_BRIDGE_BASE_URL;
  }
  return 'https://lighdepncfhiecqllmod.supabase.co/functions/v1';
})();

const RETRYABLE_STATUS = new Set([401, 429]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 400;

export interface AtlasCredentials {
  token: string;
  agentId: string;
  secret: string;
  baseUrl?: string;
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

export function generateSignature(agentId: string, token: string, secret: string): string {
  if (!agentId) throw new Error('agentId is required to generate signature.');
  if (!token) throw new Error('token is required to generate signature.');
  if (!secret) throw new Error('secret is required to generate signature.');
  return crypto.createHmac('sha256', secret).update(agentId + token).digest('hex');
}

class AtlasApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
    this.name = 'AtlasApiError';
  }
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | boolean | undefined>) {
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const prefixedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${trimmedBase}${prefixedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

async function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function performRequest<T>(config: FetchConfig): Promise<T> {
  const { token, agentId, secret, baseUrl, path, method = 'GET', query, body, logMessage } = config;
  const resolvedBaseUrl = baseUrl ?? DEFAULT_BASE_URL;

  const url = buildUrl(resolvedBaseUrl, path, query);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const signature = generateSignature(agentId, token, secret);
    try {
      if (logMessage) {
        console.log(logMessage);
      }
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Agent-Id': agentId,
          'X-Agent-Signature': signature,
          Accept: 'application/json',
          ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        return (await parseJsonSafely(response)) as T;
      }

      const payload = await parseJsonSafely(response);
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
        const backoff = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 100;
        await delay(backoff);
        continue;
      }

      const message =
        typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Atlas Bridge API request failed with status ${response.status}`;
      throw new AtlasApiError(message, response.status, payload);
    } catch (error) {
      if (error instanceof AtlasApiError) {
        throw error;
      }
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 100;
      await delay(backoff);
    }
  }

  throw new Error('Failed to execute Atlas Bridge API request after retries.');
}

export async function getUserSummary(params: AtlasCredentials): Promise<UserSummaryResponse> {
  return performRequest<UserSummaryResponse>({
    ...params,
    path: '/bridge-user-summary',
  });
}

export interface GetContractsParams extends AtlasCredentials {
  status?: string;
  limit?: number;
}

export async function getContracts(params: GetContractsParams): Promise<ContractsResponse> {
  const { status, limit, ...auth } = params;
  return performRequest<ContractsResponse>({
    ...auth,
    path: '/bridge-contracts',
    query: {
      status,
      limit,
    },
  });
}

export interface CreateContractParams extends AtlasCredentials {
  body: CreateContractBody;
}

export async function createContract(params: CreateContractParams): Promise<CreateContractResponse> {
  const { body, ...auth } = params;
  return performRequest<CreateContractResponse>({
    ...auth,
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
  const { limit, ...auth } = params;
  return performRequest<InvoicesResponse>({
    ...auth,
    path: '/bridge-invoices',
    query: {
      limit,
    },
  });
}

export interface CreateTaskParams extends AtlasCredentials {
  body: CreateTaskBody;
}

export async function createTask(params: CreateTaskParams): Promise<CreateTaskResponse> {
  const { body, ...auth } = params;
  return performRequest<CreateTaskResponse>({
    ...auth,
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
  const { body, ...auth } = params;
  return performRequest<SendNotificationResponse>({
    ...auth,
    path: '/bridge-notify',
    method: 'POST',
    body,
    logMessage: 'Sending notification...',
  });
}
