export type NodeType = "document" | "memory" | "agent" | "integration";
export type NodeStatus = "active" | "new" | "older" | "forgotten" | "expiring";
export type RelationType = "derived" | "updated" | "referenced" | "similar" | "extends" | "shared";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  status: NodeStatus;
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    tokens?: number;
    similarity?: number;
    createdBy?: string;
    memoryType?: 'short_term' | 'long_term';
    expiresAt?: string | null;
  };
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: RelationType;
  strength: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
