export type NodeType = "document" | "memory" | "agent";
export type NodeStatus = "active" | "new" | "older" | "forgotten" | "expiring";
export type RelationType = "derived" | "updated" | "referenced" | "similar" | "extends";

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
