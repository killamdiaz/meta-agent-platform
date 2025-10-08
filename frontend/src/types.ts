export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'error';
  objectives: string[];
  memory_context: string;
  tools: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  agent_id: string;
  prompt: string;
  status: string;
  result?: unknown;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  similarity?: number;
}

export interface CommandResponse {
  message: string;
  [key: string]: unknown;
}
