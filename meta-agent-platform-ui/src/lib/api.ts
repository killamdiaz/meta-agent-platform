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
} from '@/types/api';

const API_BASE = (() => {
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    ...rest,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
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

  runCommand(input: string): Promise<CommandResponse> {
    return request('/commands', {
      method: 'POST',
      body: JSON.stringify({ input }),
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
};

export type ApiClient = typeof api;

export const apiBaseUrl = API_BASE;
