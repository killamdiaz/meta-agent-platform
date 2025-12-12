export interface GovernorPolicy {
  cooldownMs: number;
  maxTokensPerCycle: number;
  similarityThreshold: number;
  confidenceThreshold: number;
  maxTurns: number;
  plan?: 'free' | 'pro' | 'enterprise';
  loopDetectionWindow?: number;
  cycleDurationMs?: number;
}

export interface AgentMessage {
  from: string;
  to: string;
  intent: string;
  content: string;
  confidence?: number;
  tokens?: number;
  type?: 'INFO' | 'TASK' | 'RESULT' | 'CONFIRMATION' | 'END';
  conversationId?: string;
}

type AgentState = {
  lastTimestamp: number;
  lastContent: string;
  lastIntent: string;
  recentIntents: string[];
};

type TokenWindow = {
  used: number;
  windowStart: number;
};

type ConversationState = {
  turns: number;
  tokens: number;
};

const DEFAULT_LOOP_WINDOW = 3;
const DEFAULT_CYCLE_MS = 5 * 60 * 1000; // 5 minutes
const NOISE_DECAY_FACTOR = 0.2;

function normaliseContent(content: string): string {
  return content.toLowerCase().replace(/[\W_]+/g, ' ').trim();
}

function tokenize(content: string): string[] {
  return normaliseContent(content)
    .split(/\s+/)
    .filter(Boolean);
}

export function computeSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      overlap += 1;
    }
  }
  const union = setA.size + setB.size - overlap;
  if (union === 0) {
    return 0;
  }
  return overlap / union;
}

export class ConversationGovernor {
  private readonly agentStates = new Map<string, AgentState>();
  private readonly tokenWindows = new Map<string, TokenWindow>();
  private readonly conversationStates = new Map<string, ConversationState>();
  private readonly noiseScores = new Map<string, number>();
  private readonly policy: GovernorPolicy;

  constructor(policy: GovernorPolicy) {
    this.policy = this.applyPlanAdjustments(policy);
  }

  async shouldAllow(agentId: string, message: AgentMessage): Promise<boolean> {
    const now = Date.now();
    const state = this.ensureAgentState(agentId);

    this.updateAgentState(agentId, state, message, now);
    await this.recordTokens(agentId, message.tokens ?? 0);
    this.recordConversation(agentId, message);
    this.decayNoise(agentId);
    return true;
  }

  async recordTokens(agentId: string, tokenCount: number): Promise<void> {
    if (tokenCount <= 0) {
      return;
    }
    const now = Date.now();
    const window = this.ensureTokenWindow(agentId, now);
    window.used += tokenCount;
  }

  async summarizeIfNeeded(conversationId: string): Promise<void> {
    const state = this.conversationStates.get(conversationId);
    if (!state) {
      return;
    }
    if (state.turns >= this.policy.maxTurns || state.tokens >= this.policy.maxTokensPerCycle) {
      console.log('[conversation-governor] Summarization suggested', {
        conversationId,
        turns: state.turns,
        tokens: state.tokens,
      });
      state.turns = 0;
      state.tokens = 0;
    }
  }

  penalize(agentId: string, reason: 'redundant' | 'loop' | 'ungrounded' | 'unauthorized', amount = 1) {
    const current = this.noiseScores.get(agentId) ?? 0;
    const increment = Math.max(amount, 0.5);
    const next = current + increment;
    this.noiseScores.set(agentId, next);
    console.warn('[conversation-governor] noise penalty', { agentId, reason, score: next });
  }

  getNoiseScore(agentId: string): number {
    return this.noiseScores.get(agentId) ?? 0;
  }

  getPriority(agentId: string): number {
    const score = this.getNoiseScore(agentId);
    return 1 / (1 + score);
  }

  private logBlock(agentId: string, message: AgentMessage, reason: string) {
    // Temporarily suppress block logging while communication is unrestricted.
  }

  private ensureAgentState(agentId: string): AgentState {
    let state = this.agentStates.get(agentId);
    if (!state) {
      state = {
        lastTimestamp: 0,
        lastContent: '',
        lastIntent: '',
        recentIntents: [],
      };
      this.agentStates.set(agentId, state);
    }
    return state;
  }

  private ensureTokenWindow(agentId: string, now: number): TokenWindow {
    let window = this.tokenWindows.get(agentId);
    const duration = this.policy.cycleDurationMs ?? DEFAULT_CYCLE_MS;
    if (!window || now - window.windowStart >= duration) {
      window = { used: 0, windowStart: now };
      this.tokenWindows.set(agentId, window);
    }
    return window;
  }

  private inCooldown(state: AgentState, now: number): boolean {
    if (state.lastTimestamp === 0) {
      return false;
    }
    return now - state.lastTimestamp < this.policy.cooldownMs;
  }

  private hasTokenBudget(agentId: string, tokens: number, now: number): boolean {
    if (tokens <= 0) {
      return true;
    }
    const window = this.ensureTokenWindow(agentId, now);
    return window.used + tokens <= this.policy.maxTokensPerCycle;
  }

  private exceedsTurnLimit(agentId: string, message: AgentMessage): boolean {
    const conversationKey = this.getConversationKey(agentId, message);
    const state = this.conversationStates.get(conversationKey);
    if (!state) {
      return false;
    }
    return state.turns >= this.policy.maxTurns;
  }

  private meetsConfidence(message: AgentMessage): boolean {
    if (typeof message.confidence !== 'number') {
      return true;
    }
    return message.confidence >= this.policy.confidenceThreshold;
  }

  private isRedundant(state: AgentState, message: AgentMessage): boolean {
    if (!state.lastContent) {
      return false;
    }
    const score = computeSimilarity(state.lastContent, message.content);
    return score >= this.policy.similarityThreshold;
  }

  private detectsLoop(state: AgentState, message: AgentMessage): boolean {
    const window = this.policy.loopDetectionWindow ?? DEFAULT_LOOP_WINDOW;
    if (window <= 1) {
      return false;
    }
    const intents = [...state.recentIntents.slice(-(window - 1)), message.intent];
    if (intents.length < window) {
      return false;
    }
    return intents.every((intent) => intent === intents[0]);
  }

  private updateAgentState(agentId: string, state: AgentState, message: AgentMessage, timestamp: number) {
    state.lastTimestamp = timestamp;
    state.lastContent = message.content;
    state.lastIntent = message.intent;
    state.recentIntents.push(message.intent);
    const window = this.policy.loopDetectionWindow ?? DEFAULT_LOOP_WINDOW;
    if (state.recentIntents.length > window) {
      state.recentIntents.splice(0, state.recentIntents.length - window);
    }
    this.agentStates.set(agentId, state);
  }

  private recordConversation(agentId: string, message: AgentMessage) {
    const conversationKey = this.getConversationKey(agentId, message);
    let state = this.conversationStates.get(conversationKey);
    if (!state) {
      state = { turns: 0, tokens: 0 };
      this.conversationStates.set(conversationKey, state);
    }
    state.turns += 1;
    state.tokens += message.tokens ?? 0;
  }

  private getConversationKey(agentId: string, message: AgentMessage): string {
    if (message.conversationId) {
      return message.conversationId;
    }
    const participants = [agentId, message.to].filter(Boolean).sort();
    return participants.join(':');
  }

  private decayNoise(agentId: string) {
    const current = this.noiseScores.get(agentId);
    if (current === undefined) {
      return;
    }
    const next = current * (1 - NOISE_DECAY_FACTOR);
    if (next <= 0.1) {
      this.noiseScores.delete(agentId);
    } else {
      this.noiseScores.set(agentId, next);
    }
  }

  private applyPlanAdjustments(policy: GovernorPolicy): GovernorPolicy {
    const adjusted = { ...policy };
    switch (policy.plan) {
      case 'free':
        adjusted.cooldownMs = Math.max(policy.cooldownMs, 2000);
        adjusted.maxTokensPerCycle = Math.min(policy.maxTokensPerCycle, 2000);
        adjusted.maxTurns = Math.min(policy.maxTurns, 8);
        break;
      case 'pro':
        adjusted.cooldownMs = Math.max(policy.cooldownMs, 1000);
        adjusted.maxTokensPerCycle = Math.min(policy.maxTokensPerCycle, 8000);
        adjusted.maxTurns = Math.min(policy.maxTurns, 20);
        break;
      case 'enterprise':
        adjusted.cooldownMs = Math.max(policy.cooldownMs, 500);
        adjusted.maxTokensPerCycle = policy.maxTokensPerCycle;
        adjusted.maxTurns = policy.maxTurns;
        break;
      default:
        break;
    }
    if (!adjusted.loopDetectionWindow || adjusted.loopDetectionWindow < 2) {
      adjusted.loopDetectionWindow = DEFAULT_LOOP_WINDOW;
    }
    if (!adjusted.cycleDurationMs || adjusted.cycleDurationMs <= 0) {
      adjusted.cycleDurationMs = DEFAULT_CYCLE_MS;
    }
    return adjusted;
  }
}
