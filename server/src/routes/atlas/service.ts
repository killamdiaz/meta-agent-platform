import { withSupabase } from '../../core/SupabaseClientFactory.js';

export interface AtlasAgentRequest {
  agentId: string;
  input: string;
  metadata?: Record<string, unknown>;
}

export interface AtlasStreamRequest {
  sessionId: string;
  cursor?: string;
}

export interface ContractOperationRequest {
  contractId: string;
  action: 'approve' | 'reject' | 'cancel';
  reason?: string;
}

export async function createAtlasAgentExecution(
  payload: AtlasAgentRequest,
  requestId: string,
  userId: string,
) {
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('atlas_ai_requests')
        .insert({
          agent_id: payload.agentId,
          input: payload.input,
          metadata: payload.metadata ?? {},
          requested_by: userId,
        })
        .select('id, status')
        .single();
      if (error) {
        throw error;
      }
      return {
        requestId,
        jobId: data.id,
        status: data.status ?? 'queued',
      };
    },
    { requestId, jobId: null, status: 'queued' },
    { requestId, endpoint: '/atlas-ai-agent', agentId: payload.agentId },
  );
}

export async function fetchAtlasStream(payload: AtlasStreamRequest, requestId: string, agentId: string) {
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('atlas_ai_stream')
        .select('cursor, chunk, created_at')
        .eq('session_id', payload.sessionId)
        .gte('created_at', payload.cursor ?? '1970-01-01T00:00:00.000Z')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) {
        throw error;
      }
      return {
        requestId,
        sessionId: payload.sessionId,
        items: data ?? [],
        nextCursor: data?.[data.length - 1]?.created_at ?? payload.cursor ?? null,
      };
    },
    { requestId, sessionId: payload.sessionId, items: [], nextCursor: payload.cursor ?? null },
    { requestId, endpoint: '/atlas-ai-stream', agentId },
  );
}

export async function executeContractOperation(
  payload: ContractOperationRequest,
  requestId: string,
  agentId: string,
) {
  return withSupabase(
    async (client) => {
      const { error } = await client
        .from('bridge_contracts')
        .update({
          status: payload.action,
          resolution_reason: payload.reason ?? null,
        })
        .eq('id', payload.contractId);
      if (error) {
        throw error;
      }
      return { requestId, contractId: payload.contractId, status: payload.action };
    },
    { requestId, contractId: payload.contractId, status: payload.action },
    { requestId, endpoint: '/contract-operations', agentId },
  );
}
