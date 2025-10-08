import axios from 'axios';
import { API_BASE_URL } from '../config';
import type { Agent, MemoryGraphResponse, MemorySearchResult, TaskRecord } from './types';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export interface CreateAgentPayload {
  name: string;
  role: string;
  objectives: string[];
  tools: Record<string, unknown>;
  memory_context?: string;
}

export interface UpdateAgentPayload extends Partial<CreateAgentPayload> {
  status?: string;
}

export async function listAgents() {
  const response = await client.get<{ items: Agent[] }>('/agents');
  return response.data.items;
}

export async function createAgent(payload: CreateAgentPayload) {
  const response = await client.post<Agent>('/agents', payload);
  return response.data;
}

export async function updateAgent(id: string, payload: UpdateAgentPayload) {
  const response = await client.put<Agent>(`/agents/${id}`, payload);
  return response.data;
}

export async function deleteAgent(id: string) {
  await client.delete(`/agents/${id}`);
}

export async function updateAgentStatus(id: string, status: string) {
  const response = await client.patch<Agent>(`/agents/${id}/status`, { status });
  return response.data;
}

export async function enqueueTask(agentId: string, prompt: string) {
  const response = await client.post<TaskRecord>('/tasks', { agentId, prompt });
  return response.data;
}

export async function listTasks() {
  const response = await client.get<{ items: TaskRecord[] }>('/tasks');
  return response.data.items;
}

export async function fetchMemoryGraph(agentId?: string, limit?: number) {
  const response = await client.get<MemoryGraphResponse>('/memory', {
    params: {
      agentId,
      limit
    }
  });
  return response.data;
}

export async function searchMemory(agentId: string, query: string, limit = 5) {
  const response = await client.post<{ items: MemorySearchResult[] }>('/memory/search', {
    agentId,
    query,
    limit
  });
  return response.data.items;
}

export default client;
