import type {
  AgentRecord,
  AgentMemoryResponse,
  AgentConfigField,
  AutomationRecord,
  BuildAgentResult,
  CommandResponse,
  GraphDataResponse,
  OverviewInsights,
  TaskRecord,
  MultiAgentSession,
  AutomationBuilderResponse,
  AutomationPipeline,
  AutomationInterpretationResponse,
} from '@/types/api';

export const API_BASE = (() => {
  const configured = import.meta.env.VITE_API_BASE_URL;

  const normalize = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value);

  if (typeof window !== 'undefined') {
    if (configured) {
      try {
        const url = new URL(configured, window.location.origin);
        if (url.hostname === 'server' && window.location.hostname !== 'server') {
          url.hostname = window.location.hostname;
        }

        return normalize(url.toString());
      } catch (error) {
        console.warn('Invalid VITE_API_BASE_URL, using as-is', error);
        return normalize(configured);
      }
    }

    if (import.meta.env.DEV) {
      return normalize(
        `${window.location.protocol}//${window.location.hostname || 'localhost'}:4000`,
      );
    }

    return '';
  }

  return configured ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');
})();

export const EXHAUST_BASE = (() => {
  const configured = import.meta.env.VITE_EXHAUST_BASE_URL;
  const normalize = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value);

  if (typeof window !== 'undefined') {
    if (configured) {
      try {
        const url = new URL(configured, window.location.origin);
        if (url.hostname === 'exhaust' && window.location.hostname !== 'exhaust') {
          url.hostname = window.location.hostname;
        }
        return normalize(url.toString());
      } catch (error) {
        console.warn('Invalid VITE_EXHAUST_BASE_URL, using as-is', error);
        return normalize(configured);
      }
    }
    if (import.meta.env.DEV) {
      return normalize(
        `${window.location.protocol}//${window.location.hostname || 'localhost'}:4100`,
      );
    }
    return '';
  }
  return configured ?? (import.meta.env.DEV ? 'http://localhost:4100' : '');
})();

type ApiError = Error & { status?: number };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;
  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };
  const licenseKey = localStorage.getItem('forge_license_key');
  if (licenseKey) {
    mergedHeaders['x-license-key'] = licenseKey;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: mergedHeaders,
    credentials: 'include',
    ...rest,
  });

  if (!response.ok) {
    const text = await response.text();
    const error: ApiError = new Error(text || response.statusText);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  listAgents(): Promise<{ items: AgentRecord[] }> {
    return request('/agents');
  },

  createAgent(payload: {
    name: string;
    role: string;
    tools: Record<string, boolean>;
    objectives: string[];
    memory_context?: string;
    internet_access_enabled?: boolean;
    config?: {
      agentType: string;
      summary?: string;
      schema: AgentConfigField[];
      values: Record<string, unknown>;
    };
  }): Promise<AgentRecord> {
    return request('/agents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAgent(id: string, updates: Partial<Pick<AgentRecord, 'name' | 'role' | 'memory_context'>> & {
    objectives?: string[];
    tools?: Record<string, unknown>;
    status?: AgentRecord['status'];
    internet_access_enabled?: boolean;
    config?: {
      agentType?: string;
      summary?: string;
      schema?: AgentConfigField[];
      values?: Record<string, unknown>;
    };
  }): Promise<AgentRecord | null> {
    return request(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  deleteAgent(id: string): Promise<void> {
    return request(`/agents/${id}`, {
      method: 'DELETE',
    });
  },

  listTasks(status?: string): Promise<{ items: TaskRecord[] }> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/tasks${query}`);
  },

  enqueueTask(agentId: string, prompt: string): Promise<TaskRecord> {
    return request(`/tasks/assign`, {
      method: 'POST',
      body: JSON.stringify({ agentId, prompt }),
    });
  },

  getAgentMemory(agentId: string, limit = 10): Promise<AgentMemoryResponse> {
    return request(`/agents/${agentId}/memory?limit=${limit}`);
  },

  updateAgentStatus(agentId: string, status: AgentRecord['status']): Promise<AgentRecord> {
    return request(`/agents/${agentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  runCommand(input: string, orgId?: string | null): Promise<CommandResponse> {
    return request('/commands', {
      method: 'POST',
      body: JSON.stringify({ input, org_id: orgId ?? undefined }),
    });
  },

  buildAgentFromPrompt(promptText: string, options?: { persist?: boolean; spawn?: boolean; creator?: string }): Promise<BuildAgentResult> {
    return request('/agent-builder', {
      method: 'POST',
      body: JSON.stringify({ promptText, options }),
    });
  },

  generateAgentConfig(description: string, options?: { preferredTools?: string[]; existingAgents?: string[] }) {
    return request('/agent-config/schema', {
      method: 'POST',
      body: JSON.stringify({ description, ...options }),
    }) as Promise<{
      agentType: string;
      description: string;
      configSchema: AgentConfigField[];
      defaults?: Record<string, unknown>;
    }>;
  },

  fetchAgentConfig(agentId: string) {
    return request(`/agent-config/${agentId}`) as Promise<{
      agentId: string;
      agentType: string;
      description: string;
      configSchema: AgentConfigField[];
      defaults?: Record<string, unknown>;
      values: Record<string, unknown>;
    }>;
  },

  updateAgentConfig(agentId: string, payload: {
    agentType: string;
    summary?: string;
    schema: AgentConfigField[];
    values: Record<string, unknown>;
  }) {
    return request(`/agent-config/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  fetchOverviewInsights(): Promise<OverviewInsights> {
    return request('/insights/overview');
  },

  fetchMemoryGraph(): Promise<GraphDataResponse> {
    return request('/memory/graph');
  },

  runMultiAgentSession(prompt: string): Promise<MultiAgentSession> {
    return request('/multi-agent/sessions', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  },

  fetchMultiAgentMemory(): Promise<MultiAgentSession['memory']> {
    return request('/multi-agent/memory');
  },

  dispatchToolAgentPrompt(prompt: string, options?: { agentId?: string; limit?: number; mode?: 'auto' | 'context' | 'task' }) {
    return request<{
      status: string;
      agent: { id: string; name: string; role: string; agentType: string };
      messageId: string;
      dispatchedAt: string;
      mode: 'context' | 'task';
      limit?: number;
    }>('/multi-agent/tool-agents/run', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        agentId: options?.agentId,
        limit: options?.limit,
        mode: options?.mode ?? 'auto',
      }),
    });
  },

  listAutomations(): Promise<{ items: AutomationRecord[] }> {
    return request('/automations');
  },

  createAutomation(payload: { name: string; automation_type: string; metadata?: Record<string, unknown> }): Promise<AutomationRecord> {
    return request('/automations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAutomation(id: string, payload: { name: string; automation_type: string; metadata?: Record<string, unknown> }): Promise<AutomationRecord> {
    return request(`/automations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  sendAutomationMessage(payload: { sessionId: string; message: string }): Promise<AutomationBuilderResponse> {
    return request('/automation-builder/message', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  provideAutomationKey(payload: { sessionId: string; agent: string; value: string }): Promise<AutomationBuilderResponse> {
    return request('/automation-builder/key', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  endAutomationSession(sessionId: string): Promise<void> {
    return request(`/automation-builder/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  },

  interpretAutomationPrompt(
    prompt: string,
    context?: { pipeline?: AutomationPipeline | null; name?: string; description?: string },
  ): Promise<AutomationInterpretationResponse> {
    return request('/automation-builder/interpret', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        context: context ?? {},
      }),
    });
  },

  fetchSlackIntegrationStatus(orgId?: string): Promise<{ status: string; data: Record<string, unknown> }> {
    const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
    return request(`/connectors/slack/api/status${query}`);
  },

  fetchJiraIntegrationStatus(orgId?: string, accountId?: string): Promise<{ status: string; data: Record<string, unknown> }> {
    const params = new URLSearchParams();
    if (orgId) params.set('org_id', orgId);
    if (accountId) params.set('account_id', accountId);
    const query = params.toString();
    return request(`/connectors/jira/api/status${query ? `?${query}` : ''}`);
  },

  disconnectSlackIntegration(orgId?: string): Promise<{ status: string }> {
    const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
    return request(`/connectors/slack/api/deactivate${query}`, { method: 'POST' });
  },

  disconnectJiraIntegration(orgId?: string, accountId?: string): Promise<{ status: string }> {
    const params = new URLSearchParams();
    if (orgId) params.set('org_id', orgId);
    if (accountId) params.set('account_id', accountId);
    const query = params.toString();
    return request(`/connectors/jira/api/disconnect${query ? `?${query}` : ''}`, { method: 'POST' });
  },

  fetchUsageSummary(orgId: string) {
    return request<{ total_tokens: number; total_cost: number }>(`/usage/summary?org_id=${encodeURIComponent(orgId)}`);
  },

  fetchUsageDaily(orgId: string) {
    return request<Array<{ bucket: string; total_tokens: number; total_cost: number }>>(
      `/usage/daily?org_id=${encodeURIComponent(orgId)}`
    );
  },

  fetchUsageMonthly(orgId: string) {
    return request<Array<{ bucket: string; total_tokens: number; total_cost: number }>>(
      `/usage/monthly?org_id=${encodeURIComponent(orgId)}`
    );
  },

  fetchUsageBreakdown(orgId: string) {
    return request<Array<{ source: string; total_tokens: number; total_cost: number }>>(
      `/usage/breakdown?org_id=${encodeURIComponent(orgId)}`
    );
  },

  fetchUsageModels(orgId: string) {
    return request<Array<{ model_name: string; model_provider: string; total_tokens: number; total_cost: number }>>(
      `/usage/models?org_id=${encodeURIComponent(orgId)}`
    );
  },

  fetchUsageAgents(orgId: string) {
    return request<Array<{ agent_name: string; total_tokens: number; total_cost: number }>>(
      `/usage/agents?org_id=${encodeURIComponent(orgId)}`
    );
  },

  fetchLicenseStatus(orgId: string, licenseKey?: string) {
    const params = new URLSearchParams();
    if (orgId) params.set("org_id", orgId);
    if (licenseKey) params.set("license_key", licenseKey);
    const qs = params.toString();
    return request<{
      license_id: string;
      customer_name: string;
      customer_id: string;
      expires_at: string;
      max_seats: number;
      max_tokens: number;
      license_key: string;
      seats_used: number;
      tokens_used: number;
      valid: boolean;
      reason?: string;
    }>(`/api/license/status${qs ? `?${qs}` : ""}`);
  },

  validateLicense(license_key: string) {
    return request('/api/license/validate', {
      method: 'POST',
      body: JSON.stringify({ license_key }),
    });
  },

  refreshLicense(license_key: string) {
    return request('/api/license/refresh', {
      method: 'POST',
      body: JSON.stringify({ license_key }),
    });
  },

  applyLicense(orgId: string, license_key: string) {
    return request('/api/license/apply', {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId, license_key }),
    });
  },

  searchIngestion(orgId: string, query: string) {
    return request<{ items: Array<{ id: string; source_type: string; source_id: string; content: string; metadata: Record<string, unknown>; created_at: string }> }>(
      `/ingestion/search?org_id=${encodeURIComponent(orgId)}&q=${encodeURIComponent(query)}`
    );
  },

  listImportJobs(orgId: string) {
    return request<Array<{ id: string; org_id: string; source: string; status: string; progress: number; created_at: string }>>(
      `/ingestion/jobs?org_id=${encodeURIComponent(orgId)}`
    );
  },

  createImportJob(orgId: string, source: string) {
    return request(`/ingestion/jobs`, {
      method: "POST",
      body: JSON.stringify({ org_id: orgId, source }),
    });
  },

  deleteImportJob(orgId: string, id: string) {
    return request(`/ingestion/jobs/${encodeURIComponent(id)}?org_id=${encodeURIComponent(orgId)}`, {
      method: "DELETE",
    });
  },

  fetchSamlConfig(orgId: string) {
    return request<{
      org_id: string;
      idp_metadata_url: string | null;
      idp_entity_id: string | null;
      idp_sso_url: string | null;
      idp_certificate: string | null;
      sp_entity_id: string | null;
      sp_acs_url: string | null;
      sp_metadata_url: string | null;
      enforce_sso: boolean;
      domains?: string[];
    }>(`/auth/saml/config/${encodeURIComponent(orgId)}`);
  },

  saveSamlConfig(
    orgId: string,
    payload: Partial<{
      idp_metadata_url: string;
      idp_entity_id: string;
      idp_sso_url: string;
      idp_certificate: string;
      sp_entity_id: string;
      sp_acs_url: string;
      sp_metadata_url: string;
      enforce_sso: boolean;
      domains?: string[];
    }>,
  ) {
    return request(`/auth/saml/config/${encodeURIComponent(orgId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  discoverSaml(email: string) {
    return request<{
      enabled: boolean;
      orgId?: string;
      enforceSso?: boolean;
      idpEntityId?: string;
      idpSsoUrl?: string;
      spEntityId?: string;
      acsUrl?: string;
      metadataUrl?: string;
    }>(`/auth/saml/discover?email=${encodeURIComponent(email)}`);
  },

  startSamlLogin(payload: { email?: string; org_id?: string; redirect?: string; relayState?: string }) {
    return request<{ redirectUrl: string; orgId: string }>('/auth/saml/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  fetchSamlSession() {
    return request<{ user: any; token: string }>('/auth/saml/session');
  },
};

export type ApiClient = typeof api;

export const apiBaseUrl = API_BASE;
