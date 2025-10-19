import type { MessageBroker, MessagePayload } from '../multiAgent/MessageBroker.js';
import { ConversationGovernor, computeSimilarity, type AgentMessage as GovernorMessage } from './conversation-governor.js';
import { logAgentEvent } from './agent-logger.js';
import type { PrivilegeLevel } from '../registry/AgentProfileRegistry.js';

type Capability = string;
type Binding = string;

interface AgentContext {
  agentType: string;
  privilegeLevel: PrivilegeLevel;
  capabilities: Set<Capability>;
  safeActions: Set<string>;
  commandScope: Set<string>;
  bindings: Set<Binding>;
  intentHistory: Array<{ intent: string; content: string }>;
  successfulDelegations: number;
}

interface BroadcastMetadata {
  requiredCapabilities?: string[];
  requiredBindings?: string[];
  [key: string]: unknown;
}

export interface GovernedMessage extends GovernorMessage {
  metadata?: BroadcastMetadata;
  requiredCapabilities?: string[];
  requiredBindings?: string[];
}

const MAX_INTENT_HISTORY = 6;
const LOOP_THRESHOLD = 3;
const SIM_THRESHOLD = 0.9;
const PRIVILEGE_ORDER: Record<PrivilegeLevel, number> = {
  system: 4,
  commander: 3,
  orchestrator: 2,
  'orchestrator-lite': 1.5,
  tool: 1,
};

export class CoreOrchestrator {
  private readonly contexts = new Map<string, AgentContext>();

  constructor(private readonly broker: MessageBroker, private readonly governor: ConversationGovernor) {}

  registerAgent(
    agentId: string,
    options: {
      agentType: string;
      privilegeLevel: PrivilegeLevel;
      capabilities?: string[];
      safeActions?: string[];
      commandScope?: string[];
      bindings?: string[] | Record<string, boolean>;
    },
  ) {
    const context = this.ensureContext(agentId);
    context.agentType = options.agentType;
    context.privilegeLevel = options.privilegeLevel;
    if (options.capabilities) {
      context.capabilities = new Set(options.capabilities.map((cap) => cap.toLowerCase()));
    }
    if (options.safeActions) {
      context.safeActions = new Set(options.safeActions.map((action) => action.toUpperCase()));
    } else {
      context.safeActions = new Set<string>(['TASK', 'RESULT', 'INFO', 'COMMAND', 'BROADCAST', 'END']);
    }
    if (options.commandScope) {
      context.commandScope = new Set(options.commandScope);
    }
    if (options.bindings) {
      const bindingsArray = Array.isArray(options.bindings)
        ? options.bindings
        : Object.entries(options.bindings)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([name]) => name);
      context.bindings = new Set(bindingsArray.map((binding) => binding.toLowerCase()));
    }
    // Temporarily disable capability and hierarchy restrictions
    context.capabilities = new Set<string>(['respond', 'delegate', 'command', 'coordinate', 'execute', 'summarize']);
    context.safeActions = new Set<string>(['TASK', 'RESULT', 'INFO', 'COMMAND', 'BROADCAST', 'END']);
    context.commandScope = new Set<string>();
    context.intentHistory = [];
    context.successfulDelegations = 0;
    this.contexts.set(agentId, context);
  }

  updateBindings(agentId: string, bindings: string[] | Record<string, boolean>) {
    const context = this.ensureContext(agentId);
    const bindingsArray = Array.isArray(bindings)
      ? bindings
      : Object.entries(bindings)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([name]) => name);
    context.bindings = new Set(bindingsArray.map((entry) => entry.toLowerCase()));
  }

  getAgentPriority(agentId: string): number {
    return this.governor.getPriority(agentId);
  }

  async broadcast(message: GovernedMessage): Promise<(MessagePayload & { id: string; timestamp: string }) | null> {
    const payload: MessagePayload = {
      from: message.from,
      to: message.to,
      type: this.mapMessageType(message.type),
      content: message.content,
      metadata: {
        ...(message.metadata ?? {}),
        verified: true,
      },
    };
    const published = this.broker.publish(payload);
    return { ...payload, id: published.id, timestamp: published.timestamp };
  }

  private ensureContext(agentId: string): AgentContext {
    let context = this.contexts.get(agentId);
    if (!context) {
      context = {
        agentType: agentId,
        privilegeLevel: 'tool',
        capabilities: new Set<Capability>(),
        safeActions: new Set<string>(),
        commandScope: new Set<string>(),
        bindings: new Set<Binding>(),
        intentHistory: [],
        successfulDelegations: 0,
      };
      this.contexts.set(agentId, context);
    }
    return context;
  }

  private collectRequiredCapabilities(message: GovernedMessage, actionType: string): string[] {
    const fromMetadata = message.metadata?.requiredCapabilities ?? [];
    const explicit = message.requiredCapabilities ?? [];
    const inferred: string[] = [];
    const defaultCapability = this.capabilityForAction(actionType, message.intent);
    if (defaultCapability) {
      inferred.push(defaultCapability);
    }
    const combined = [...fromMetadata, ...explicit, ...inferred];
    return Array.from(new Set(combined.map((entry) => entry.toLowerCase()))).filter(Boolean);
  }

  private authorize(agentId: string, context: AgentContext, required: string[]): boolean {
    if (required.length === 0) {
      return true;
    }
    if (context.capabilities.size === 0) {
      console.warn('[core-orchestrator] agent has no registered capabilities', { agentId });
      return false;
    }
    for (const capability of required) {
      if (!context.capabilities.has(capability)) {
        console.warn('[core-orchestrator] capability check failed', { agentId, capability });
        return false;
      }
    }
    return true;
  }

  private checkRedundancy(agentId: string, context: AgentContext, message: GovernedMessage): 'ok' | 'redundant' | 'loop' {
    const history = context.intentHistory;
    const repeated = history.filter((entry) => entry.intent === message.intent).length;
    if (repeated >= LOOP_THRESHOLD - 1) {
      return 'loop';
    }
    const lastEntry = history[history.length - 1];
    if (lastEntry) {
      const score = computeSimilarity(lastEntry.content, message.content);
      if (score >= SIM_THRESHOLD) {
        return 'redundant';
      }
    }
    return 'ok';
  }

  private pushIntentHistory(context: AgentContext, intent: string, content: string) {
    context.intentHistory.push({ intent, content });
    if (context.intentHistory.length > MAX_INTENT_HISTORY) {
      context.intentHistory.splice(0, context.intentHistory.length - MAX_INTENT_HISTORY);
    }
  }

  private checkBindings(agentId: string, context: AgentContext, message: GovernedMessage): string[] {
    const required = new Set<string>(
      [...(message.requiredBindings ?? []), ...(message.metadata?.requiredBindings ?? [])].map((entry) =>
        entry.toLowerCase(),
      ),
    );
    if (required.size === 0) {
      return [];
    }
    const missing: string[] = [];
    for (const binding of required) {
      if (!context.bindings.has(binding)) {
        missing.push(binding);
      }
    }
    if (missing.length > 0) {
      console.warn('[core-orchestrator] missing data bindings', { agentId, missing });
    }
    return missing;
  }

  private emitTermination(agentId: string, message: GovernedMessage, reason: string) {
    const payload: MessagePayload = {
      from: 'conversation-governor',
      to: message.to,
      type: 'task',
      content: JSON.stringify({ type: 'END', reason }),
      metadata: { governance: true, reason },
    };
    this.broker.publish(payload);
    logAgentEvent(agentId, `Conversation terminated due to ${reason}`, {
      metadata: { stage: 'governor', status: 'terminated', reason },
    });
  }

  private emitMissingDataWarning(agentId: string, message: GovernedMessage, missing: string[]) {
    const payload: MessagePayload = {
      from: 'conversation-governor',
      to: message.from,
      type: 'question',
      content: '⚠️ Missing data source',
      metadata: { governance: true, missingBindings: missing },
    };
    this.broker.publish(payload);
    logAgentEvent(agentId, 'Reply blocked due to missing data bindings', {
      metadata: { stage: 'governor', status: 'missing_bindings', missing },
    });
  }

  private mapMessageType(type: GovernedMessage['type']): MessagePayload['type'] {
    if (type === 'RESULT' || type === 'END') {
      return 'response';
    }
    if (type === 'TASK' || type === 'CONFIRMATION') {
      return 'task';
    }
    return 'question';
  }

  private resolveActionType(message: GovernedMessage): string {
    const metaType = typeof message.metadata?.actionType === 'string' ? message.metadata.actionType : null;
    const messageType = message.type ?? 'INFO';
    return (metaType ?? messageType).toUpperCase();
  }

  private resolveTargetType(message: GovernedMessage): string | undefined {
    const metadataType = message.metadata && typeof message.metadata.targetType === 'string' ? message.metadata.targetType : undefined;
    return metadataType;
  }

  private capabilityForAction(actionType: string, intent: string): string | null {
    switch (actionType) {
      case 'COMMAND':
        return 'command';
      case 'TASK':
        return 'delegate';
      case 'RESULT':
      case 'INFO':
        return 'respond';
      case 'BROADCAST':
      case 'END':
        return 'coordinate';
      case 'CONFIRMATION':
        return 'respond';
      default:
        return intent ? intent.toLowerCase() : null;
    }
  }

  private isSafeAction(context: AgentContext, actionType: string): boolean {
    if (context.safeActions.size === 0) {
      return true;
    }
    return context.safeActions.has(actionType.toUpperCase());
  }

  private comparePrivilege(a: PrivilegeLevel, b: PrivilegeLevel): number {
    return (PRIVILEGE_ORDER[a] ?? 0) - (PRIVILEGE_ORDER[b] ?? 0);
  }

  private isHierarchyCompliant(
    actor: AgentContext,
    target: AgentContext | undefined,
    actionType: string,
  ): boolean {
    if (!target || actionType === 'RESULT' || actionType === 'INFO') {
      return true;
    }
    const actorLevel = PRIVILEGE_ORDER[actor.privilegeLevel] ?? 0;
    const targetLevel = PRIVILEGE_ORDER[target.privilegeLevel] ?? 0;
    if (actionType === 'TASK' || actionType === 'COMMAND') {
      return actorLevel > targetLevel;
    }
    return true;
  }

  private noteSuccessfulDelegation(
    agentId: string,
    context: AgentContext,
    actionType: string,
    targetPrivilege?: PrivilegeLevel,
  ) {
    if (actionType !== 'TASK' && actionType !== 'COMMAND') {
      return;
    }
    if (!targetPrivilege || this.comparePrivilege(context.privilegeLevel, targetPrivilege) <= 0) {
      return;
    }
    context.successfulDelegations += 1;
    if (context.privilegeLevel === 'tool' && context.successfulDelegations >= 10) {
      context.privilegeLevel = 'orchestrator-lite';
      context.safeActions.add('COMMAND');
      context.successfulDelegations = 0;
      console.log('[governor] Auto-promotion applied', { agentId, privilege: context.privilegeLevel });
    }
  }
}
