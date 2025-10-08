export type AgentStatus = 'idle' | 'working' | 'error';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  objectives: string[];
  memory_context?: string;
  tools: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  agent_id: string;
  prompt: string;
  status: string;
  result: unknown;
  created_at: string;
  updated_at: string;
}

export interface MemoryNode {
  id: string;
  agent_id: string;
  agent_name: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  embedding: number[];
}

export interface MemoryGraphResponse {
  agents: Agent[];
  memories: MemoryNode[];
}

export interface MemorySearchResult extends MemoryNode {
  similarity: number;
}
