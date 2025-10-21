import type { BaseAgentBridgeOptions } from '../../multiAgent/BaseAgent.js';

const trim = (value: string | undefined | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveToken = (overrides?: BaseAgentBridgeOptions): string | undefined => {
  return (
    trim(overrides?.token) ??
    trim(process.env.META_AGENT_JWT) ??
    trim(process.env.ATLAS_BRIDGE_TOKEN) ??
    trim(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    trim(process.env.SUPABASE_ANON_SERVICE_ROLE_KEY)
  );
};

const resolveSecret = (overrides?: BaseAgentBridgeOptions): string | undefined => {
  return trim(overrides?.secret) ?? trim(process.env.META_AGENT_SECRET);
};

const resolveAgentId = (candidate: string, overrides?: BaseAgentBridgeOptions): string => {
  return (
    trim(overrides?.agentId) ??
    trim(process.env.META_AGENT_ID) ??
    trim(process.env.NEXT_PUBLIC_META_AGENT_ID) ??
    trim(process.env.VITE_META_AGENT_ID) ??
    candidate
  );
};

const resolveBaseUrl = (overrides?: BaseAgentBridgeOptions): string | undefined => {
  return trim(overrides?.baseUrl) ?? trim(process.env.ATLAS_BRIDGE_BASE_URL);
};

export function buildAtlasBridgeOptions(agentId: string, overrides?: BaseAgentBridgeOptions): BaseAgentBridgeOptions {
  const secret = resolveSecret(overrides);
  const token = resolveToken(overrides);
  const resolvedAgentId = resolveAgentId(agentId, overrides);
  const baseUrl = resolveBaseUrl(overrides);
  const tokenProvider = overrides?.tokenProvider;

  if (!secret) {
    console.warn('[atlas-bridge] META_AGENT_SECRET not configured; Atlas bridge calls may fail.');
  }
  if (!token) {
    console.warn('[atlas-bridge] No Atlas bridge token configured (META_AGENT_JWT / ATLAS_BRIDGE_TOKEN / SUPABASE_SERVICE_ROLE_KEY).');
  }

  return {
    ...overrides,
    agentId: resolvedAgentId,
    secret: secret ?? '',
    token: token ?? '',
    baseUrl,
    tokenProvider,
  };
}
