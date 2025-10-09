export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'error';
  objectives: string[];
  memory_context: string;
  tools: Record<string, boolean>;
  internet_access_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SandboxLaunchLog {
  timestamp: string;
  message: string;
}

export interface SpawnResult {
  sandboxId: string;
  logs: SandboxLaunchLog[];
}

export interface SecurityProfile {
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
}

export interface GeneratedAgentSpec {
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
  securityProfile: SecurityProfile;
  creator: string;
  created_at: string;
}

export interface BuildAgentResult {
  spec: GeneratedAgentSpec;
  savedAgent?: Agent;
  spawnResult?: SpawnResult | null;
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
