import { config } from '../../config.js';
import { InMemoryCache } from '../../core/cache/InMemoryCache.js';
import { withSupabase } from '../../core/SupabaseClientFactory.js';

const cacheTtlMs = config.cacheTtlSeconds * 1000;
const summaryCache = new InMemoryCache<BridgeSummary>(cacheTtlMs, 200, 4 * 1024 * 1024);
const invoiceCache = new InMemoryCache<PaginatedResult<BridgeInvoice>>(cacheTtlMs, 300, 12 * 1024 * 1024);
const contractCache = new InMemoryCache<PaginatedResult<BridgeContract>>(cacheTtlMs, 300, 12 * 1024 * 1024);

interface BridgeSummary {
  agentId: string;
  summary: unknown;
  stats: unknown[];
  updatedAt: string | null;
}

interface BridgeInvoice {
  id: string;
  agentId: string;
  amount: number;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
}

interface BridgeContract {
  id: string;
  agentId: string;
  title: string;
  status: string;
  signedAt: string | null;
  counterparty: string | null;
}

interface BridgeTask {
  id: string;
  agentId: string;
  description: string;
  status: string;
  updatedAt: string | null;
}

interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
}

const clonePaginated = <T>(result: PaginatedResult<T>): PaginatedResult<T> => ({
  items: [...result.items],
  pagination: { ...result.pagination },
});

const emptyPaginated = <T>(page: number, pageSize: number): PaginatedResult<T> => ({
  items: [],
  pagination: {
    page,
    pageSize,
    total: 0,
    pageCount: 1,
  },
});

const defaultSummary = (agentId: string): BridgeSummary => ({
  agentId,
  summary: null,
  stats: [],
  updatedAt: null,
});

export async function fetchBridgeUserSummary(agentId: string, requestId: string) {
  const cacheKey = `summary:${agentId}`;
  const cached = summaryCache.get(cacheKey);
  const fallback = cached
    ? {
        ...cached,
        stats: Array.isArray(cached.stats) ? [...cached.stats] : [],
      }
    : defaultSummary(agentId);
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('bridge_user_summary')
        .select('agent_id, summary, stats, updated_at')
        .eq('agent_id', agentId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      const payload: BridgeSummary = data
        ? {
            agentId: data.agent_id,
            summary: data.summary,
            stats: data.stats ?? [],
            updatedAt: data.updated_at ?? null,
          }
        : defaultSummary(agentId);
      summaryCache.set(cacheKey, payload);
      return payload;
    },
    fallback,
    { requestId, endpoint: '/bridge-user-summary', agentId },
  );
}

export async function fetchBridgeInvoices(
  agentId: string,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<PaginatedResult<BridgeInvoice>> {
  const cacheKey = `invoices:${agentId}:${page}:${pageSize}`;
  const cached = invoiceCache.get(cacheKey);
  const fallback = cached ? clonePaginated(cached) : emptyPaginated<BridgeInvoice>(page, pageSize);
  return withSupabase(
    async (client) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await client
        .from('bridge_invoices')
        .select('id, agent_id, amount, status, issued_at, due_at', { count: 'exact' })
        .eq('agent_id', agentId)
        .order('issued_at', { ascending: false })
        .range(from, to);
      if (error) {
        throw error;
      }
      const items: BridgeInvoice[] = (data ?? []).map((invoice: Record<string, any>) => ({
        id: invoice.id,
        agentId: invoice.agent_id,
        amount: invoice.amount,
        status: invoice.status,
        issuedAt: invoice.issued_at,
        dueAt: invoice.due_at,
      }));
      const total = typeof count === 'number' ? count : items.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
      const payload: PaginatedResult<BridgeInvoice> = {
        items,
        pagination: {
          page,
          pageSize,
          total,
          pageCount,
        },
      };
      invoiceCache.set(cacheKey, payload);
      return payload;
    },
    fallback,
    { requestId, endpoint: '/bridge-invoices', agentId },
  );
}

export async function fetchBridgeContracts(
  agentId: string,
  page: number,
  pageSize: number,
  requestId: string,
): Promise<PaginatedResult<BridgeContract>> {
  const cacheKey = `contracts:${agentId}:${page}:${pageSize}`;
  const cached = contractCache.get(cacheKey);
  const fallback = cached ? clonePaginated(cached) : emptyPaginated<BridgeContract>(page, pageSize);
  return withSupabase(
    async (client) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await client
        .from('bridge_contracts')
        .select('id, agent_id, title, status, signed_at, counterparty', { count: 'exact' })
        .eq('agent_id', agentId)
        .order('signed_at', { ascending: false })
        .range(from, to);
      if (error) {
        throw error;
      }
      const items: BridgeContract[] = (data ?? []).map((contract: Record<string, any>) => ({
        id: contract.id,
        agentId: contract.agent_id,
        title: contract.title,
        status: contract.status,
        signedAt: contract.signed_at,
        counterparty: contract.counterparty,
      }));
      const total = typeof count === 'number' ? count : items.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
      const payload: PaginatedResult<BridgeContract> = {
        items,
        pagination: {
          page,
          pageSize,
          total,
          pageCount,
        },
      };
      contractCache.set(cacheKey, payload);
      return payload;
    },
    fallback,
    { requestId, endpoint: '/bridge-contracts', agentId },
  );
}

export async function fetchBridgeTasks(
  agentId: string,
  page: number,
  pageSize: number,
  status: string | undefined,
  requestId: string,
): Promise<PaginatedResult<BridgeTask>> {
  const fallback = emptyPaginated<BridgeTask>(page, pageSize);
  return withSupabase(
    async (client) => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = client
        .from('bridge_tasks')
        .select('id, agent_id, description, status, updated_at', { count: 'exact' })
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })
        .range(from, to);
      if (status) {
        query = query.eq('status', status);
      }
      const { data, error, count } = await query;
      if (error) {
        throw error;
      }
      const items: BridgeTask[] = (data ?? []).map((task: Record<string, any>) => ({
        id: task.id,
        agentId: task.agent_id,
        description: task.description,
        status: task.status,
        updatedAt: task.updated_at,
      }));
      const total = typeof count === 'number' ? count : items.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
      return {
        items,
        pagination: {
          page,
          pageSize,
          total,
          pageCount,
        },
      } satisfies PaginatedResult<BridgeTask>;
    },
    fallback,
    { requestId, endpoint: '/bridge-tasks', agentId },
  );
}

export async function recordBridgeNotification(
  agentId: string,
  requestId: string,
  payload: { channel: string; message: string },
) {
  return withSupabase(
    async (client) => {
      const { error } = await client.from('bridge_notifications').insert({
        agent_id: agentId,
        channel: payload.channel,
        message: payload.message,
      });
      if (error) {
        throw error;
      }
      return { success: true };
    },
    { success: true },
    { requestId, endpoint: '/bridge-notify', agentId },
  );
}
