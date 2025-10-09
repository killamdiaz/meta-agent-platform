import type { BuildAgentResult, CommandResponse, GeneratedAgentSpec } from '../types';

const API_BASE = process.env.VITE_API_BASE || process.env.REACT_APP_API_BASE || 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

export const api = {
  async listAgents() {
    return request<{ items: import('../types').Agent[] }>('/agents');
  },
  async createAgent(payload: {
    name: string;
    role: string;
    tools: Record<string, boolean>;
    objectives: string[];
    internet_access_enabled?: boolean;
  }) {
    return request('/agents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  async enqueueTask(agentId: string, prompt: string) {
    return request(`/agents/${agentId}/task`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
  },
  async listTasks() {
    return request<{ items: import('../types').Task[] }>('/tasks');
  },
  async listMemory(agentId: string) {
    return request<{ items: import('../types').MemoryEntry[] }>(`/agents/${agentId}/memory`);
  },
  async updateAgentStatus(agentId: string, status: 'idle' | 'working' | 'error') {
    return request(`/agents/${agentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },
  async runCommand(input: string) {
    return request<CommandResponse>('/commands', {
      method: 'POST',
      body: JSON.stringify({ input })
    });
  },
  async buildAgentFromPrompt(payload: {
    promptText: string;
    persist?: boolean;
    spawn?: boolean;
    creator?: string;
  }) {
    return request<BuildAgentResult>('/agent-builder', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  async previewAgentSpec(payload: { promptText: string; creator?: string }) {
    return request<{ spec: GeneratedAgentSpec }>('/agent-builder/spec', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};

export default api;
