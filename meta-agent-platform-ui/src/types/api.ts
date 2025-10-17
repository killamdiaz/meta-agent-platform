export type AgentConfigFieldType = 'string' | 'number' | 'boolean' | 'password' | 'textarea' | 'select';

export interface AgentConfigField {
  key: string;
  label: string;
  type: AgentConfigFieldType;
  required?: boolean;
  secure?: boolean;
  options?: string[];
  description?: string;
  placeholder?: string;
  tooltip?: string;
  defaultValue?: unknown;
}

export interface AgentConfig {
  agentType: string;
  summary?: string;
  schema: AgentConfigField[];
  values: Record<string, unknown>;
}

export interface AgentGraphNodeSnapshot {
  id: string;
  name: string;
  role: string;
  connections: string[];
  isTalking: boolean;
}

export interface AgentGraphLinkSnapshot {
  id: string;
  source: string;
  target: string;
  isActive: boolean;
  lastMessageId?: string;
  activeUntil?: number;
}

export interface AgentGraphSnapshot {
  agents: AgentGraphNodeSnapshot[];
  links: AgentGraphLinkSnapshot[];
}

export interface AgentMessageEvent {
  id: string;
  from: string;
  to: string;
  type: 'question' | 'response' | 'task';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentStateChangeEvent {
  agentId: string;
  isTalking?: boolean;
  message?: AgentMessageEvent;
  direction?: 'incoming' | 'outgoing';
  linkActivity?: {
    targetId: string;
    direction: 'incoming' | 'outgoing';
    isActive: boolean;
    messageId?: string;
    timestamp: string;
  };
}

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
  agent_type?: string | null;
  config_summary?: string | null;
  config?: AgentConfig;
  created_at: string;
  updated_at: string;
}

export interface AutomationRecord {
  id: string;
  name: string;
  automation_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type AutomationNodeType = "Trigger" | "Processor" | "Action";

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  agent: string;
  config: Record<string, unknown>;
}

export interface AutomationEdge {
  from: string;
  to: string;
}

export interface AutomationPipeline {
  name?: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

export type AutomationBuilderStatus = "success" | "awaiting_key" | "saved" | "loaded";

export interface AutomationBuilderResponse {
  status: AutomationBuilderStatus;
  pipeline?: AutomationPipeline;
  agent?: string;
  prompt?: string;
  name?: string;
}

export interface AutomationDrawerEvent {
  isOpen: boolean;
}

export interface AutomationStatusEvent {
  status: string;
  detail?: Record<string, unknown>;
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
  memory_type: 'short_term' | 'long_term';
  expires_at: string | null;
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

export interface MultiAgent {
  id: string;
  name: string;
  role: string;
  purpose: string;
}

export interface MultiAgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  reasoning?: string;
  references?: string[];
}

export interface MultiAgentSession {
  sessionId: string;
  userPrompt: string;
  agents: MultiAgent[];
  messages: MultiAgentMessage[];
  memory: {
    agents: Record<
      string,
      {
        shortTerm: string[];
        longTerm: string[];
      }
    >;
    shared: {
      id: string;
      content: string;
      agentsInvolved: string[];
      timestamp: string;
    }[];
  };
}
