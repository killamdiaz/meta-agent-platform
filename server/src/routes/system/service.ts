import { withSupabase } from '../../core/SupabaseClientFactory.js';

export async function checkUserSubscription(userId: string, requestId: string) {
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('subscriptions')
        .select('status, tier, expires_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return {
        requestId,
        status: data?.status ?? 'inactive',
        tier: data?.tier ?? 'free',
        expiresAt: data?.expires_at ?? null,
      };
    },
    { requestId, status: 'inactive', tier: 'free', expiresAt: null },
    { requestId, endpoint: '/check-subscription', agentId: userId },
  );
}

export async function fetchSystemStatus(requestId: string) {
  return withSupabase(
    async (client) => {
      const { data, error } = await client
        .from('system_status')
        .select('component, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) {
        throw error;
      }
      return { requestId, components: data ?? [] };
    },
    { requestId, components: [] },
    { requestId, endpoint: '/fetch-status', agentId: 'system' },
  );
}
