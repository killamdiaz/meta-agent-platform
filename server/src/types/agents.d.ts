export interface AgentSchema {
  name: string;
  description: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  capabilities: string[];
}

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  schema: AgentSchema;
  created_at: string;
}
