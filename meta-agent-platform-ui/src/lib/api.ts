import type {
  AgentRecord,
  AgentMemoryResponse,
  BuildAgentResult,
  CommandResponse,
  GraphDataResponse,
  OverviewInsights,
  TaskRecord,
} from '@/types/api';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    ...options,
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
