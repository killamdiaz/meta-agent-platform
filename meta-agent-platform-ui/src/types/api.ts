export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'error';
  objectives: string[] | null;
  tools: Record<string, unknown>;
  memory_context: string;
  internet_access_enabled: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskRecord {
  id: string;
  agent_id: string;
  prompt: string;
  status: 'pending' | 'working' | 'completed' | 'error';
  result: unknown;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntry {
  id: string;
  agent_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AgentMemoryResponse {
  items: MemoryEntry[];
  taskCounts: Record<string, number>;
}

export interface OverviewInsights {
  agentCount: number;
  taskCounts: {
    total: number;
    pending: number;
    working: number;
    completed: number;
    error: number;
  };
  memoryCount: number;
  uptimeSeconds: number;
  tasksPerDay: { day: string; count: number }[];
  recentTasks: {
    id: string;
    prompt: string;
    status: TaskRecord['status'];
    createdAt: string;
    updatedAt: string;
    agentName: string;
  }[];
}

export interface CommandResponse {
  message: string;
  agent?: AgentRecord;
  task?: TaskRecord;
  spawnResult?: unknown;
  [key: string]: unknown;
}

export interface BuildAgentResult {
  spec: {
    name: string;
    description: string;
    goals: string[];
    capabilities: {
      tools: string[];
      memory: boolean;
      autonomy_level: 'manual' | 'semi' | 'autonomous';
      execution_interval: string;
    };
    model: string;
    securityProfile: {
      sandbox: boolean;
      network: {
        allowInternet: boolean;
        domainsAllowed: string[];
      };
      filesystem: {
        read: string[];
        write: string[];
      };
      permissions: string[];
      executionTimeout: number;
    };
    creator: string;
    created_at: string;
  };
  savedAgent?: AgentRecord;
  spawnResult?: unknown;
}

export interface GraphDataResponse {
  nodes: import('./graph').GraphNode[];
  links: import('./graph').GraphLink[];
}

