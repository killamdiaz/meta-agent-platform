import type {
  AgentRecord,
  AgentMemoryResponse,
  BuildAgentResult,
  CommandResponse,
  GraphDataResponse,
  OverviewInsights,
  TaskRecord,
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

  fetchOverviewInsights(): Promise<OverviewInsights> {
    return request('/insights/overview');
  },

  fetchMemoryGraph(): Promise<GraphDataResponse> {
    return request('/memory/graph');
  },
};

export type ApiClient = typeof api;
