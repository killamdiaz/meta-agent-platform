export type AutomationNodeType = 'Trigger' | 'Processor' | 'Action';

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  agent: AutomationAgentName;
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

export type AutomationAgentName =
  | 'SlackTrigger'
  | 'GmailTrigger'
  | 'CronTrigger'
  | 'SummarizerAgent'
  | 'SlackAgent'
  | 'JiraAgent'
  | 'JiraTrigger'
  | 'NotionAgent'
  | 'DiscordAgent'
  | 'EmailSenderAgent'
  | 'AtlasBridgeAgent'
  | 'AtlasContractsAgent'
  | 'AtlasInvoicesAgent'
  | 'AtlasTasksAgent'
  | 'AtlasNotifyAgent'
  | 'AtlasWorkspaceAgent';

export interface AutomationBuilderResponse {
  status: 'success' | 'awaiting_key' | 'saved' | 'loaded';
  pipeline?: AutomationPipeline;
  name?: string;
  agent?: AutomationAgentName;
  prompt?: string;
}

export interface AutomationSessionState {
  sessionId: string;
  pipeline: AutomationPipeline | null;
  lastUpdated: number;
  pendingKeyFor?: AutomationAgentName;
  providedKeys: Set<AutomationAgentName>;
  drawerOpened: boolean;
  graphNodeIds: Set<string>;
  currentAutomationName?: string;
}

export interface AutomationParserResult {
  pipeline: AutomationPipeline;
  requiresKeys: AutomationAgentName[];
}

export interface AutomationSaveOptions {
  sessionId: string;
  name: string;
}

export interface AutomationLoadResult {
  status: 'loaded';
  pipeline: AutomationPipeline;
}

export type DrawerEventPayload = {
  sessionId: string;
  isOpen: boolean;
};

export function clonePipeline(pipeline: AutomationPipeline | null): AutomationPipeline | null {
  if (!pipeline) return null;
  return {
    name: pipeline.name,
    nodes: pipeline.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      agent: node.agent,
      config: { ...node.config },
    })),
    edges: pipeline.edges.map((edge) => ({ from: edge.from, to: edge.to })),
  };
}
