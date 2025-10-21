import { config } from '../../config.js';
import { InMemoryCache } from '../../core/cache/InMemoryCache.js';
import { withSupabase } from '../../core/SupabaseClientFactory.js';

const cacheTtlMs = config.cacheTtlSeconds * 1000;
const summaryCache = new InMemoryCache<any>(cacheTtlMs);
const invoiceCache = new InMemoryCache<any[]>(cacheTtlMs);
const contractCache = new InMemoryCache<any[]>(cacheTtlMs);

const defaultSummary = (agentId: string) => ({
  agentId,
  summary: null,
  stats: [],
  updatedAt: null,
});

export async function fetchBridgeUserSummary(agentId: string, requestId: string) {
  const cacheKey = `summary:${agentId}`;
  const cached = summaryCache.get(cacheKey);
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
      const payload = data
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
    cached ?? defaultSummary(agentId),
    { requestId, endpoint: '/bridge-user-summary', agentId },
  );
}

export async function fetchBridgeInvoices(agentId: string, requestId: string) {
  const cacheKey = `invoices:${agentId}`;
  const cached = invoiceCache.get(cacheKey);
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('bridge_invoices')
        .select('id, agent_id, amount, status, issued_at, due_at')
        .eq('agent_id', agentId)
        .order('issued_at', { ascending: false });
      if (error) {
        throw error;
      }
      const payload = (data ?? []).map((invoice) => ({
        id: invoice.id,
        agentId: invoice.agent_id,
        amount: invoice.amount,
        status: invoice.status,
        issuedAt: invoice.issued_at,
        dueAt: invoice.due_at,
      }));
      invoiceCache.set(cacheKey, payload);
      return payload;
    },
    cached ?? [],
    { requestId, endpoint: '/bridge-invoices', agentId },
  );
}

export async function fetchBridgeContracts(agentId: string, requestId: string) {
  const cacheKey = `contracts:${agentId}`;
  const cached = contractCache.get(cacheKey);
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('bridge_contracts')
        .select('id, agent_id, title, status, signed_at, counterparty')
        .eq('agent_id', agentId)
        .order('signed_at', { ascending: false });
      if (error) {
        throw error;
      }
      const payload = (data ?? []).map((contract) => ({
        id: contract.id,
        agentId: contract.agent_id,
        title: contract.title,
        status: contract.status,
        signedAt: contract.signed_at,
        counterparty: contract.counterparty,
      }));
      contractCache.set(cacheKey, payload);
      return payload;
    },
    cached ?? [],
    { requestId, endpoint: '/bridge-contracts', agentId },
  );
}

export async function fetchBridgeTasks(agentId: string, requestId: string) {
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('bridge_tasks')
        .select('id, agent_id, description, status, updated_at')
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) {
        throw error;
      }
      return (data ?? []).map((task) => ({
        id: task.id,
        agentId: task.agent_id,
        description: task.description,
        status: task.status,
        updatedAt: task.updated_at,
      }));
    },
    [],
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
