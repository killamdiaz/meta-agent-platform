const DEFAULT_LOOP_WINDOW = 3;
const DEFAULT_CYCLE_MS = 5 * 60 * 1000; // 5 minutes
const NOISE_DECAY_FACTOR = 0.2;
function normaliseContent(content) {
    return content.toLowerCase().replace(/[\W_]+/g, ' ').trim();
}
function tokenize(content) {
    return normaliseContent(content)
        .split(/\s+/)
        .filter(Boolean);
}
export function computeSimilarity(a, b) {
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
    constructor(policy) {
        this.agentStates = new Map();
        this.tokenWindows = new Map();
        this.conversationStates = new Map();
        this.noiseScores = new Map();
        this.policy = this.applyPlanAdjustments(policy);
    }
    async shouldAllow(agentId, message) {
        const now = Date.now();
        const state = this.ensureAgentState(agentId);
        this.updateAgentState(agentId, state, message, now);
        await this.recordTokens(agentId, message.tokens ?? 0);
        this.recordConversation(agentId, message);
        this.decayNoise(agentId);
        return true;
    }
    async recordTokens(agentId, tokenCount) {
        if (tokenCount <= 0) {
            return;
        }
        const now = Date.now();
        const window = this.ensureTokenWindow(agentId, now);
        window.used += tokenCount;
    }
    async summarizeIfNeeded(conversationId) {
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
    penalize(agentId, reason, amount = 1) {
        const current = this.noiseScores.get(agentId) ?? 0;
        const increment = Math.max(amount, 0.5);
        const next = current + increment;
        this.noiseScores.set(agentId, next);
        console.warn('[conversation-governor] noise penalty', { agentId, reason, score: next });
    }
    getNoiseScore(agentId) {
        return this.noiseScores.get(agentId) ?? 0;
    }
    getPriority(agentId) {
        const score = this.getNoiseScore(agentId);
        return 1 / (1 + score);
    }
    logBlock(agentId, message, reason) {
        // Temporarily suppress block logging while communication is unrestricted.
    }
    ensureAgentState(agentId) {
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
    ensureTokenWindow(agentId, now) {
        let window = this.tokenWindows.get(agentId);
        const duration = this.policy.cycleDurationMs ?? DEFAULT_CYCLE_MS;
        if (!window || now - window.windowStart >= duration) {
            window = { used: 0, windowStart: now };
            this.tokenWindows.set(agentId, window);
        }
        return window;
    }
    inCooldown(state, now) {
        if (state.lastTimestamp === 0) {
            return false;
        }
        return now - state.lastTimestamp < this.policy.cooldownMs;
    }
    hasTokenBudget(agentId, tokens, now) {
        if (tokens <= 0) {
            return true;
        }
        const window = this.ensureTokenWindow(agentId, now);
        return window.used + tokens <= this.policy.maxTokensPerCycle;
    }
    exceedsTurnLimit(agentId, message) {
        const conversationKey = this.getConversationKey(agentId, message);
        const state = this.conversationStates.get(conversationKey);
        if (!state) {
            return false;
        }
        return state.turns >= this.policy.maxTurns;
    }
    meetsConfidence(message) {
        if (typeof message.confidence !== 'number') {
            return true;
        }
        return message.confidence >= this.policy.confidenceThreshold;
    }
    isRedundant(state, message) {
        if (!state.lastContent) {
            return false;
        }
        const score = computeSimilarity(state.lastContent, message.content);
        return score >= this.policy.similarityThreshold;
    }
    detectsLoop(state, message) {
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
    updateAgentState(agentId, state, message, timestamp) {
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
    recordConversation(agentId, message) {
        const conversationKey = this.getConversationKey(agentId, message);
        let state = this.conversationStates.get(conversationKey);
        if (!state) {
            state = { turns: 0, tokens: 0 };
            this.conversationStates.set(conversationKey, state);
        }
        state.turns += 1;
        state.tokens += message.tokens ?? 0;
    }
    getConversationKey(agentId, message) {
        if (message.conversationId) {
            return message.conversationId;
        }
        const participants = [agentId, message.to].filter(Boolean).sort();
        return participants.join(':');
    }
    decayNoise(agentId) {
        const current = this.noiseScores.get(agentId);
        if (current === undefined) {
            return;
        }
        const next = current * (1 - NOISE_DECAY_FACTOR);
        if (next <= 0.1) {
            this.noiseScores.delete(agentId);
        }
        else {
            this.noiseScores.set(agentId, next);
        }
    }
    applyPlanAdjustments(policy) {
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
