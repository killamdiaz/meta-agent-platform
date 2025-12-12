import { MemoryStore } from './MemoryStore.js';
import { routeMessage } from '../llm/router.js';

type AgentPurpose =
  | 'coordination'
  | 'contract-analysis'
  | 'copy-editing'
  | 'reasoning'
  | 'logging'
  | 'research'
  | 'strategy'
  | 'design'
  | 'code'
  | 'memory';

export interface DynamicAgent {
  id: string;
  name: string;
  role: string;
  purpose: AgentPurpose;
}

export interface ConversationMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  reasoning?: string;
  references?: string[];
}

export interface SessionResult {
  sessionId: string;
  userPrompt: string;
  agents: DynamicAgent[];
  messages: ConversationMessage[];
  memory: ReturnType<MemoryStore['getSnapshot']>;
}

interface ConversationContext {
  prompt: string;
  sessionId: string;
  agents: DynamicAgent[];
  memoryStore: MemoryStore;
  messages: ConversationMessage[];
  hooks?: SessionHooks;
  turnStats: Map<string, { count: number; consecutive: number; lastTimestamp: number }>;
  turnSequence: string[];
  shortTermBuffer: Map<string, string[]>;
}

interface AgentLLMResponse {
  to: string;
  content: string;
  reasoning?: string;
  delegate?: string | null;
  references?: string[];
  memory?: {
    shortTerm?: string | string[];
    longTerm?: string | string[];
    shared?: string | string[];
  };
}

interface SessionHooks {
  onAgents?(agents: DynamicAgent[]): void;
  onMessage?(message: ConversationMessage): void;
  onMemory?(memory: ReturnType<MemoryStore['getSnapshot']>): void;
  onComplete?(result: SessionResult): void;
}

const MAX_TURNS = 14;

const agentPrompts: Partial<Record<AgentPurpose, string>> = {
  coordination:
    'You orchestrate collaboration. Delegate tasks, ensure respectful debate, and deliver a polished answer back to the user once consensus is reached.',
  'contract-analysis':
    'You dissect legal agreements, highlight risks, and propose contract language while citing relevant clauses.',
  'copy-editing': 'You refine language for clarity, tone, and accessibility so non-experts can follow along.',
  reasoning:
    'You verify logic, point out contradictions, and keep the discussion grounded in evidence and structured reasoning.',
  logging: 'You maintain an auditable trace of the collaboration and confirm when artefacts are archived.',
  research:
    'You gather supporting evidence, examples, and impact data. Surface multiple viewpoints when the topic is contentious.',
  strategy:
    'You synthesise recommendations, weighing trade-offs and providing actionable next steps based on the debate.',
  design: 'You explore user experience, communication, and presentation angles when relevant.',
  code: 'You translate abstract ideas into technical implementation details and constraints.',
  memory:
    'You decide which insights should become institutional knowledge. Optimise for reusable summaries and references.',
};

const createAgent = (name: string, role: string, purpose: AgentPurpose): DynamicAgent => ({
  id: `${purpose}-${Math.random().toString(36).slice(2, 10)}`,
  name,
  role,
  purpose,
});

const ensureAgent = (agents: DynamicAgent[], purpose: AgentPurpose, name: string, role: string) => {
  const existing = agents.find((agent) => agent.purpose === purpose);
  if (existing) {
    return existing;
  }
  const agent = createAgent(name, role, purpose);
  agents.push(agent);
  return agent;
};

const inferAgentsForPrompt = (prompt: string): DynamicAgent[] => {
  const agents: DynamicAgent[] = [];

  ensureAgent(agents, 'coordination', 'CoordinatorAgent', 'Leads collaboration, assigns tasks, and responds to the user.');
  ensureAgent(agents, 'logging', 'LoggerAgent', 'Maintains persistent audit logs and cross-agent traceability.');
  ensureAgent(agents, 'memory', 'MemoryAgent', 'Curates shared memory so insights persist across sessions.');
  ensureAgent(agents, 'research', 'ResearchAgent', 'Aggregates supporting data, case studies, and counter-arguments.');
  ensureAgent(agents, 'reasoning', 'ReasoningAgent', 'Tests logic, highlights gaps, and keeps discussions rigorous.');
  ensureAgent(agents, 'strategy', 'StrategyAgent', 'Balances viewpoints and crafts actionable recommendations.');
  ensureAgent(agents, 'copy-editing', 'CopyAgent', 'Ensures the communication is clear, accessible, and polished.');

  const lower = prompt.toLowerCase();
  if (/\bcontract\b|\bclause\b|\blegal\b/.test(lower)) {
    ensureAgent(agents, 'contract-analysis', 'ContractAgent', 'Specialist in legal analysis and contract drafting.');
  }
  if (/\bdesign\b|\bux\b|\bui\b|\bbrand\b/.test(lower)) {
    ensureAgent(agents, 'design', 'DesignAgent', 'Considers presentation, storytelling, and experience design.');
  }
  if (/\bcode\b|\bimplement\b|\bbuild\b|\bapi\b/.test(lower)) {
    ensureAgent(agents, 'code', 'CodeAgent', 'Maps solutions to technical and implementation details.');
  }
  return agents;
};

const toArray = (value: string | string[] | undefined): string[] =>
  Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];

const summariseMessages = (messages: ConversationMessage[], limit = 10) =>
  messages
    .slice(-limit)
    .map((message) => {
      const fragments = [`${message.from} → ${message.to}`, message.content.trim()];
      if (message.reasoning) fragments.push(`Reasoning: ${message.reasoning.trim()}`);
      return fragments.join(' | ');
    })
    .join('\n');

const TASK_BUFFER_LIMIT = 8;

const formatAgentMemory = (memoryStore: MemoryStore, agentId: string, taskBuffer: string[]) => {
  const snapshot = memoryStore.getSnapshot();
  const agentMemory = snapshot.agents[agentId] ?? { shortTerm: [], longTerm: [] };
  const shortTerm = agentMemory.shortTerm.slice(-6).join('\n• ');
  const longTerm = agentMemory.longTerm.slice(-4).join('\n• ');
  const shared = snapshot.shared
    .slice(-6)
    .map((entry) => `${entry.content} (agents: ${entry.agentsInvolved.join(', ')})`)
    .join('\n• ');

  const sessionShort = taskBuffer.slice(-TASK_BUFFER_LIMIT).join('\n• ');

  return {
    shortTerm: sessionShort
      ? `• ${sessionShort}`
      : shortTerm
      ? `• ${shortTerm}`
      : '• (none)',
    longTerm: longTerm ? `• ${longTerm}` : '• (none)',
    shared: shared ? `• ${shared}` : '• (none)',
  };
};

const parseJson = (input: string): AgentLLMResponse | null => {
  try {
    const cleaned = input.trim().replace(/```json|```/gi, '');
    return JSON.parse(cleaned) as AgentLLMResponse;
  } catch {
    const firstBrace = input.indexOf('{');
    const lastBrace = input.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(input.slice(firstBrace, lastBrace + 1)) as AgentLLMResponse;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const defaultLLMResponse = (agent: DynamicAgent, context: ConversationContext): AgentLLMResponse => {
  const hasDiscussion = context.messages.length > 0;
  if (agent.purpose === 'coordination' && !hasDiscussion) {
    return {
      to: 'ResearchAgent',
      content:
        'Let us begin by gathering balanced insights. ResearchAgent, could you outline the strongest arguments on each side?',
      reasoning: 'Kick-off delegation to start the collaborative loop.',
      delegate: 'ResearchAgent',
    };
  }
  if (agent.purpose === 'strategy') {
    return {
      to: 'User',
      content:
        'Based on the perspectives gathered, a balanced approach is to invest in poverty reduction programs that tie support to education, workforce development, and entrepreneurship, while tracking clear accountability metrics.',
      reasoning: 'Fallback synthesis generated without LLM.',
      delegate: null,
    };
  }
  return {
    to: 'CoordinatorAgent',
    content: 'Awaiting further instructions from the coordinator.',
    reasoning: 'Fallback response when LLM is unavailable.',
    delegate: 'CoordinatorAgent',
  };
};

const MAX_CONSECUTIVE_TURNS = 3;
const ALTERNATION_WINDOW = 6;

const buildAgentMessages = (agent: DynamicAgent, context: ConversationContext) => {
  const buffer = context.shortTermBuffer.get(agent.id) ?? [];
  const memory = formatAgentMemory(context.memoryStore, agent.id, buffer);
  const conversationSummary = summariseMessages(context.messages, 12);
  const partnerList = context.agents.map((entry) => `${entry.name} (${entry.role})`).join('\n- ');
  const agentInstruction = agentPrompts[agent.purpose] ?? '';

  const systemPrompt = [
    `You are ${agent.name} (${agent.role}).`,
    agentInstruction,
    'Collaborate with the team to solve the user request. Debate respectfully, cross-check reasoning, and either delegate or respond to the user when ready.',
    'If the user is designing automations or workflows, outline Trigger -> Processor -> Action steps, call out credential requirements, and surface save/load intents so the Automation Builder can apply changes instantly.',
    'Always respond in pure JSON with keys: "to", "content", "reasoning", "delegate", "references", "memory".',
    'Valid values for "to" and "delegate" are one of the agent names or "User".',
    'If you decide the answer is ready for the user, set "to" to "User" and "delegate" to null.',
  ].join(' ');

  const userPrompt = [
    `User request: ${context.prompt}`,
    '',
    'Available agents:',
    `- ${partnerList}`,
    '',
    'Recent conversation:',
    conversationSummary || '(no dialogue yet)',
    '',
    'Your short-term memory:',
    memory.shortTerm,
    '',
    'Relevant long-term memory:',
    memory.longTerm,
    '',
    'Shared memory highlights:',
    memory.shared,
    '',
    'Provide your next contribution in JSON.',
  ].join('\n');

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];
};

const invokeAgent = async (agent: DynamicAgent, context: ConversationContext): Promise<AgentLLMResponse> => {
  try {
    const messages = buildAgentMessages(agent, context);
    const systemPrompt = messages[0]?.content ?? '';
    const userPrompt = messages[1]?.content ?? '';
    const content = await routeMessage({
      prompt: userPrompt,
      context: systemPrompt,
      intent: `multi_agent_${agent.purpose}`,
    });
    const parsed = parseJson(content);
    if (parsed) {
      return parsed;
    }
    return defaultLLMResponse(agent, context);
  } catch (error) {
    console.error('[multi-agent] LLM invocation failed', error);
    return defaultLLMResponse(agent, context);
  }
};

const normaliseText = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const filtered = value.filter((entry) => typeof entry === 'string');
    if (filtered.length > 0) return filtered.join('\n');
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
};

const addMessage = async (
  context: ConversationContext,
  from: DynamicAgent | 'User',
  to: DynamicAgent | 'User',
  content: unknown,
  options: { reasoning?: unknown; references?: unknown; promoteMemory?: boolean } = {},
) => {
  const contentText = normaliseText(content);
  const reasoningText = normaliseText(options.reasoning);
  const referencesArray = Array.isArray(options.references)
    ? options.references.filter((entry): entry is string => typeof entry === 'string')
    : typeof options.references === 'string'
    ? [options.references]
    : undefined;

  const entry: ConversationMessage = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    from: typeof from === 'string' ? from : from.name,
    to: typeof to === 'string' ? to : to.name,
    content: contentText.trim(),
    timestamp: new Date().toISOString(),
    reasoning: reasoningText || undefined,
    references: referencesArray,
  };

  context.messages.push(entry);
  context.hooks?.onMessage?.(entry);

  const pushBuffer = (agent: DynamicAgent | 'User', value: string) => {
    if (typeof agent === 'string') return;
    const buffer = context.shortTermBuffer.get(agent.id) ?? [];
    buffer.push(value.trim());
    if (buffer.length > TASK_BUFFER_LIMIT) {
      buffer.splice(0, buffer.length - TASK_BUFFER_LIMIT);
    }
    context.shortTermBuffer.set(agent.id, buffer);
  };

  pushBuffer(from, entry.content);
  if (typeof to !== 'string') {
    pushBuffer(to, `${entry.from}: ${entry.content}`);
  }

  if (typeof from !== 'string') {
    await context.memoryStore.appendAgentMemory(from.id, entry.content, {
      promoteToLongTerm: options.promoteMemory,
    });
  }
  if (typeof to !== 'string') {
    await context.memoryStore.appendAgentMemory(to.id, `${entry.from}: ${entry.content}`);
  }
};

const applyMemoryUpdates = async (
  context: ConversationContext,
  agent: DynamicAgent,
  targetAgent: DynamicAgent | null,
  response: AgentLLMResponse,
) => {
  const { memoryStore } = context;
  const shortTerm = toArray(response.memory?.shortTerm);
  const longTerm = toArray(response.memory?.longTerm);
  const shared = toArray(response.memory?.shared);

  for (const entry of shortTerm) {
    await memoryStore.appendAgentMemory(agent.id, entry);
  }
  for (const entry of longTerm) {
    await memoryStore.appendAgentMemory(agent.id, entry, { promoteToLongTerm: true });
  }
  for (const entry of shared) {
    await memoryStore.appendSharedMemory(entry, [agent.id, targetAgent?.id ?? agent.id, context.sessionId]);
  }
  if (context.hooks?.onMemory) {
    context.hooks.onMemory(memoryStore.getSnapshot());
  }
};

const generateFinalSummary = async (context: ConversationContext, coordinator: DynamicAgent): Promise<AgentLLMResponse> => {
  try {
    const conversation = summariseMessages(context.messages, 18);
    const content = await routeMessage({
      prompt: `User request: ${context.prompt}\n\nConversation transcript:\n${conversation}`,
      context: `You are ${coordinator.name}. Summarise the multi-agent debate and propose a final answer for the user. Provide JSON with keys: to="User", content, reasoning, references.`,
      intent: 'multi_agent_summary',
    });
    return (
      parseJson(content) ?? {
        to: 'User',
        content: content || 'The team agrees the request has been satisfied.',
        reasoning: 'Model response outside JSON; returning raw content.',
      }
    );
  } catch (error) {
    console.error('[multi-agent] final summary failed', error);
    return {
      to: 'User',
      content:
        'The team completed their debate but could not generate a final summary automatically. Please review the transcript.',
      reasoning: 'Encountered an error while generating the final answer.',
    };
  }
};

export class MultiAgentOrchestrator {
  constructor(private readonly memoryStore: MemoryStore) {}

  async runSession(prompt: string, hooks?: SessionHooks): Promise<SessionResult> {
    await this.memoryStore.initialise();

    const sessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const agents = inferAgentsForPrompt(prompt);
    const coordinator = agents.find((agent) => agent.purpose === 'coordination');
    if (!coordinator) {
      throw new Error('Coordinator agent is required to run a collaboration session.');
    }

    const context: ConversationContext = {
      prompt,
      sessionId,
      agents,
      memoryStore: this.memoryStore,
      messages: [],
      hooks,
      turnStats: new Map(),
      turnSequence: [],
      shortTermBuffer: new Map(),
    };

    hooks?.onAgents?.(agents);

    await addMessage(context, 'User', coordinator, prompt);

    let speaker: DynamicAgent = coordinator;
    let turns = 0;
    let finalDelivered = false;
    let finalSummaryText = '';

    while (turns < MAX_TURNS) {
      turns += 1;
      if (!this.guardTurnTaking(context, speaker)) {
        console.warn('[multi-agent] turn-taking governor halted session', { sessionId, speaker: speaker.name });
        break;
      }
      const response = await invokeAgent(speaker, context);
      const targetAgent =
        response.to === 'User' ? null : context.agents.find((agent) => agent.name === response.to) ?? coordinator;

      await addMessage(context, speaker, targetAgent ?? 'User', response.content, {
        reasoning: response.reasoning,
        references: response.references,
        promoteMemory: Boolean(response.memory?.longTerm),
      });

      await applyMemoryUpdates(context, speaker, targetAgent, response);

      if (response.to === 'User') {
        finalSummaryText = response.content;
        finalDelivered = true;
        break;
      }

      const delegatedName = response.delegate ?? (targetAgent ? targetAgent.name : null);
      const nextSpeaker = delegatedName
        ? context.agents.find((agent) => agent.name === delegatedName)
        : null;
      speaker = nextSpeaker ?? coordinator;
    }

    if (!finalDelivered) {
      const summary = await generateFinalSummary(context, coordinator);
      await addMessage(context, coordinator, 'User', summary.content, {
        reasoning: summary.reasoning,
        references: summary.references,
        promoteMemory: true,
      });
      finalSummaryText = summary.content;
      const sharedSummary = `Summary for "${prompt}": ${summary.content}`;
      await context.memoryStore.appendSharedMemory(sharedSummary, [coordinator.id, 'User', sessionId]);
      hooks?.onMemory?.(context.memoryStore.getSnapshot());
    }

    if (finalSummaryText) {
      await storeFinalInsight(context, finalSummaryText, coordinator);
    }

    const memorySnapshot = this.memoryStore.getSnapshot();
    const result: SessionResult = {
      sessionId,
      userPrompt: prompt,
      agents,
      messages: context.messages,
      memory: memorySnapshot,
    };
    hooks?.onComplete?.(result);
    return result;
  }

  private guardTurnTaking(context: ConversationContext, speaker: DynamicAgent): boolean {
    const stats = context.turnStats.get(speaker.id) ?? { count: 0, consecutive: 0, lastTimestamp: 0 };
    const lastMessage = context.messages[context.messages.length - 1];
    stats.count += 1;
    if (lastMessage && lastMessage.from === speaker.name) {
      stats.consecutive += 1;
    } else {
      stats.consecutive = 1;
    }
    stats.lastTimestamp = Date.now();
    context.turnStats.set(speaker.id, stats);

    context.turnSequence.push(speaker.name);
    if (context.turnSequence.length > 12) {
      context.turnSequence.shift();
    }

    const recent = context.turnSequence.slice(-ALTERNATION_WINDOW);
    if (recent.length >= ALTERNATION_WINDOW && isAlternatingSequence(recent)) {
      return false;
    }

    if (stats.consecutive >= MAX_CONSECUTIVE_TURNS) {
      return false;
    }
    return true;
  }
}

function isAlternatingSequence(sequence: string[]): boolean {
  const unique = new Set(sequence);
  if (unique.size !== 2) {
    return false;
  }
  for (let i = 2; i < sequence.length; i += 1) {
    if (sequence[i] !== sequence[i - 2]) {
      return false;
    }
  }
  return true;
}

async function storeFinalInsight(context: ConversationContext, outcome: string, coordinator: DynamicAgent) {
  const agentsInvolvedIds = context.agents.map((agent) => agent.id);
  const agentsInvolvedNames = context.agents.map((agent) => agent.name);
  const content = [
    `Final Outcome for "${context.prompt}"`,
    `Outcome: ${outcome.trim()}`,
    `Agents: ${agentsInvolvedNames.join(', ')}`,
    `Turns: ${context.messages.length}`,
    `Coordinator: ${coordinator.name}`,
  ].join('\n');
  await context.memoryStore.appendSharedMemory(content, agentsInvolvedIds);
}
