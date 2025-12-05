import { z } from 'zod';
import { routeMessage } from '../llm/router.js';

export type AutomationInstructionAction =
  | {
      type: 'create_node';
      node?: {
        id?: string;
        label?: string;
        agentType?: string;
        type?: 'Trigger' | 'Processor' | 'Action';
        config?: Record<string, unknown>;
        position?: { x: number; y: number };
        metadata?: Record<string, unknown>;
      };
    }
  | {
      type: 'update_node';
      id: string;
      label?: string;
      agentType?: string;
      nodeType?: 'Trigger' | 'Processor' | 'Action';
      config?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      position?: { x: number; y: number };
    }
  | { type: 'delete_node'; id: string }
  | {
      type: 'connect_nodes';
      from: string;
      to: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'disconnect_nodes';
      from: string;
      to: string;
    }
  | {
      type: 'update_metadata';
      name?: string;
      description?: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'set_position';
      id: string;
      position: { x: number; y: number };
    }
  | {
      type: 'set_positions';
      positions: Record<string, { x: number; y: number }>;
    }
  | {
      type: 'create_edge';
      edge: { from: string; to: string; metadata?: Record<string, unknown> };
    }
  | {
      type: 'delete_edge';
      edge: { from: string; to: string };
    }
  | {
      type: 'focus_node';
      id: string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export interface AutomationPromptInterpretationResult {
  success: boolean;
  message?: string;
  actions: AutomationInstructionAction[];
  raw?: string;
}

type NodeTypeLiteral = 'Trigger' | 'Processor' | 'Action';

const POSITION_SCHEMA = z.object({
  x: z.number(),
  y: z.number(),
});

const ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_node'),
    node: z
      .object({
        id: z.string().optional(),
        label: z.string().optional(),
        agentType: z.string().optional(),
        type: z.enum(['Trigger', 'Processor', 'Action']).optional(),
        config: z.record(z.unknown()).optional(),
        position: POSITION_SCHEMA.optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('update_node'),
    id: z.string(),
    label: z.string().optional(),
    agentType: z.string().optional(),
    nodeType: z.enum(['Trigger', 'Processor', 'Action']).optional(),
    config: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    position: POSITION_SCHEMA.optional(),
  }),
  z.object({
    type: z.literal('delete_node'),
    id: z.string(),
  }),
  z.object({
    type: z.literal('connect_nodes'),
    from: z.string(),
    to: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('disconnect_nodes'),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    type: z.literal('update_metadata'),
    name: z.string().optional(),
    description: z.string().optional(),
    data: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('set_position'),
    id: z.string(),
    position: POSITION_SCHEMA,
  }),
  z.object({
    type: z.literal('set_positions'),
    positions: z.record(POSITION_SCHEMA),
  }),
  z.object({
    type: z.literal('create_edge'),
    edge: z.object({
      from: z.string(),
      to: z.string(),
      metadata: z.record(z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal('delete_edge'),
    edge: z.object({
      from: z.string(),
      to: z.string(),
    }),
  }),
  z.object({
    type: z.literal('focus_node'),
    id: z.string(),
  }),
]);

const FALLBACK_ACTION_SCHEMA = z
  .object({
    type: z.string().min(1),
  })
  .passthrough();

type PipelineContext = {
  name?: string | null;
  nodes?: Array<{
    id: string;
    agent?: string | null;
    type?: string | null;
    config?: Record<string, unknown> | null;
  }>;
  edges?: Array<{
    from: string;
    to: string;
    metadata?: Record<string, unknown> | null;
  }>;
};

export interface InterpretationContext {
  pipeline?: PipelineContext | null;
  name?: string | null;
  description?: string | null;
}

type CreateNodeAction = Extract<AutomationInstructionAction, { type: 'create_node' }>;

const KNOWN_ACTION_KEYS = new Set([
  'create_node',
  'update_node',
  'delete_node',
  'connect_nodes',
  'disconnect_nodes',
  'update_metadata',
  'set_position',
  'set_positions',
  'create_edge',
  'delete_edge',
  'focus_node',
  'custom',
]);

const KNOWN_NODE_TYPES = new Set<NodeTypeLiteral>(['Trigger', 'Processor', 'Action']);
const KNOWN_CONTAINER_KEYS = new Set(['actions', 'instructions', 'steps', 'result', 'updates']);

function isNodeType(value: unknown): value is NodeTypeLiteral {
  return typeof value === 'string' && KNOWN_NODE_TYPES.has(value as NodeTypeLiteral);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasCreateNodePayload(
  action: AutomationInstructionAction,
): action is CreateNodeAction & { node: NonNullable<CreateNodeAction['node']> } {
  return action.type === 'create_node' && isRecord(action.node);
}

type NormalizedInterpretation = {
  actions: AutomationInstructionAction[];
  message?: string;
};

function normalizeInterpretationPayload(input: unknown): NormalizedInterpretation | null {
  if (input === null || input === undefined) {
    return null;
  }

  const message = isRecord(input)
    ? typeof input.message === 'string'
      ? input.message
      : typeof input.summary === 'string'
      ? input.summary
      : isRecord(input.status) && typeof input.status.message === 'string'
      ? input.status.message
      : undefined
    : undefined;
  let actions: AutomationInstructionAction[] = [];

  if (isRecord(input) && 'actions' in input) {
    actions = normalizeActionsSource((input as Record<string, unknown>).actions);
  } else if (isRecord(input) && 'instructions' in input) {
    actions = normalizeActionsSource((input as Record<string, unknown>).instructions);
  } else {
    actions = normalizeActionsSource(input);
  }

  if (!actions.length) {
    return null;
  }

  return {
    actions,
    message,
  };
}

function normalizeActionsSource(source: unknown): AutomationInstructionAction[] {
  const actions: AutomationInstructionAction[] = [];

  const processEntry = (entry: unknown) => {
    if (Array.isArray(entry)) {
      entry.forEach((item) => processEntry(item));
      return;
    }
    if (!isRecord(entry)) {
      return;
    }

    const typedAction = normalizeSingleAction(entry);
    if (typedAction) {
      actions.push(typedAction);
      return;
    }

    let matched = false;
    for (const [key, value] of Object.entries(entry)) {
      if (KNOWN_ACTION_KEYS.has(key)) {
        const action = buildActionFromKey(key, value);
        if (action) {
          actions.push(action);
          matched = true;
        }
        continue;
      }
      if (KNOWN_CONTAINER_KEYS.has(key)) {
        processEntry(value);
        matched = true;
      }
    }

    if (!matched) {
      for (const value of Object.values(entry)) {
        processEntry(value);
      }
    }
  };

  processEntry(source);
  return actions;
}

function normalizeSingleAction(entry: Record<string, unknown>): AutomationInstructionAction | null {
  const typeValue = typeof entry.type === 'string' ? entry.type : undefined;
  if (typeValue) {
    const { type, ...rest } = entry;
    const action = buildActionFromKey(typeValue, rest);
    if (action) {
      return action;
    }
  }

  for (const key of Object.keys(entry)) {
    if (!KNOWN_ACTION_KEYS.has(key)) continue;
    const action = buildActionFromKey(key, entry[key]);
    if (action) {
      return action;
    }
  }

  return null;
}

function normalizePosition(value: unknown): { x: number; y: number } | null {
  if (isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number') {
    return { x: value.x, y: value.y };
  }
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return { x: value[0], y: value[1] };
  }
  return null;
}

function getString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function buildActionFromKey(type: string, payload: unknown): AutomationInstructionAction | null {
  switch (type) {
    case 'create_node': {
      if (!isRecord(payload)) {
        return null;
      }
      const nodeCandidate =
        'node' in payload && isRecord(payload.node)
          ? (payload.node as Record<string, unknown>)
          : payload;
      return {
        type: 'create_node',
        node: nodeCandidate as Record<string, unknown>,
      } as AutomationInstructionAction;
    }
    case 'update_node': {
      if (!isRecord(payload)) return null;
      const id = getString(payload, 'id', 'nodeId', 'node_id');
      if (!id) return null;
      const updated: Record<string, unknown> = { type: 'update_node', id };
      const agentType = getString(payload, 'agentType', 'agent_type', 'agent');
      if (agentType) updated.agentType = agentType;
      const nodeTypeCandidate =
        getString(payload, 'nodeType', 'node_type') ??
        getString(payload, 'targetType', 'target_type') ??
        getString(payload, 'type');
      if (isNodeType(nodeTypeCandidate)) {
        updated.nodeType = nodeTypeCandidate;
      }
      if (typeof payload.label === 'string') {
        updated.label = payload.label;
      }
      if (isRecord(payload.config)) {
        updated.config = payload.config as Record<string, unknown>;
      }
      if (isRecord(payload.metadata)) {
        updated.metadata = payload.metadata as Record<string, unknown>;
      }
      const positionCandidate = normalizePosition(
        (payload.position as unknown) ?? payload.pos ?? payload.coordinates,
      );
      if (positionCandidate) {
        updated.position = positionCandidate;
      }
      return updated as AutomationInstructionAction;
    }
    case 'delete_node': {
      if (typeof payload === 'string' && payload.trim().length > 0) {
        return { type: 'delete_node', id: payload.trim() } as AutomationInstructionAction;
      }
      if (isRecord(payload)) {
        const id = getString(payload, 'id', 'nodeId', 'node_id');
        if (id) {
          return { type: 'delete_node', id } as AutomationInstructionAction;
        }
      }
      return null;
    }
    case 'connect_nodes': {
      if (Array.isArray(payload) && payload.length >= 2) {
        const [from, to] = payload;
        if (typeof from === 'string' && typeof to === 'string') {
          return {
            type: 'connect_nodes',
            from: from.trim(),
            to: to.trim(),
          } as AutomationInstructionAction;
        }
      }
      if (isRecord(payload)) {
        const from = getString(payload, 'from', 'source', 'start');
        const to = getString(payload, 'to', 'target', 'end');
        if (from && to) {
          const action: Record<string, unknown> = { type: 'connect_nodes', from, to };
          if (isRecord(payload.metadata)) {
            action.metadata = payload.metadata as Record<string, unknown>;
          }
          return action as AutomationInstructionAction;
        }
      }
      return null;
    }
    case 'disconnect_nodes': {
      if (Array.isArray(payload) && payload.length >= 2) {
        const [from, to] = payload;
        if (typeof from === 'string' && typeof to === 'string') {
          return {
            type: 'disconnect_nodes',
            from: from.trim(),
            to: to.trim(),
          } as AutomationInstructionAction;
        }
      }
      if (isRecord(payload)) {
        const from = getString(payload, 'from', 'source', 'start');
        const to = getString(payload, 'to', 'target', 'end');
        if (from && to) {
          return { type: 'disconnect_nodes', from, to } as AutomationInstructionAction;
        }
      }
      return null;
    }
    case 'update_metadata': {
      if (!isRecord(payload)) return null;
      const action: Record<string, unknown> = { type: 'update_metadata' };
      if (typeof payload.name === 'string') {
        action.name = payload.name;
      }
      if (typeof payload.description === 'string') {
        action.description = payload.description;
      }
      if (isRecord(payload.data)) {
        action.data = payload.data as Record<string, unknown>;
      }
      if (!('name' in action) && !('description' in action) && !('data' in action)) {
        return null;
      }
      return action as AutomationInstructionAction;
    }
    case 'set_position': {
      if (!isRecord(payload)) return null;
      const id = getString(payload, 'id', 'nodeId', 'node_id');
      const position = normalizePosition(payload.position ?? payload);
      if (!id || !position) return null;
      return {
        type: 'set_position',
        id,
        position,
      } as AutomationInstructionAction;
    }
    case 'set_positions': {
      const positions: Record<string, { x: number; y: number }> = {};
      if (isRecord(payload)) {
        for (const [key, value] of Object.entries(payload)) {
          if (key === 'type') continue;
          const position = normalizePosition(value);
          if (position) {
            positions[key] = position;
          }
        }
      } else if (Array.isArray(payload)) {
        payload.forEach((entry) => {
          if (!isRecord(entry)) return;
          const id = getString(entry, 'id', 'nodeId', 'node_id');
          const position = normalizePosition(entry.position ?? entry);
          if (id && position) {
            positions[id] = position;
          }
        });
      }
      if (!Object.keys(positions).length) return null;
      return {
        type: 'set_positions',
        positions,
      } as AutomationInstructionAction;
    }
    case 'create_edge': {
      if (Array.isArray(payload) && payload.length >= 2) {
        const [fromValue, toValue] = payload;
        if (typeof fromValue === 'string' && typeof toValue === 'string') {
          return {
            type: 'create_edge',
            edge: { from: fromValue.trim(), to: toValue.trim() },
          } as AutomationInstructionAction;
        }
      }
      if (isRecord(payload)) {
        const from = getString(payload, 'from', 'source', 'start');
        const to = getString(payload, 'to', 'target', 'end');
        if (!from || !to) return null;
        const edge: Record<string, unknown> = { from, to };
        if (isRecord(payload.metadata)) {
          edge.metadata = payload.metadata as Record<string, unknown>;
        }
        return {
          type: 'create_edge',
          edge,
        } as AutomationInstructionAction;
      }
      return null;
    }
    case 'delete_edge': {
      if (Array.isArray(payload) && payload.length >= 2) {
        const [fromValue, toValue] = payload;
        if (typeof fromValue === 'string' && typeof toValue === 'string') {
          return {
            type: 'delete_edge',
            edge: { from: fromValue.trim(), to: toValue.trim() },
          } as AutomationInstructionAction;
        }
      }
      if (isRecord(payload)) {
        const from = getString(payload, 'from', 'source', 'start');
        const to = getString(payload, 'to', 'target', 'end');
        if (!from || !to) return null;
        return {
          type: 'delete_edge',
          edge: { from, to },
        } as AutomationInstructionAction;
      }
      return null;
    }
    case 'focus_node': {
      if (typeof payload === 'string' && payload.trim().length > 0) {
        return { type: 'focus_node', id: payload.trim() } as AutomationInstructionAction;
      }
      if (isRecord(payload)) {
        const id = getString(payload, 'id', 'nodeId', 'node_id', 'target');
        if (id) {
          return { type: 'focus_node', id } as AutomationInstructionAction;
        }
      }
      return null;
    }
    case 'custom': {
      const data =
        isRecord(payload) && 'payload' in payload && isRecord(payload.payload)
          ? (payload.payload as Record<string, unknown>)
          : isRecord(payload)
          ? (payload as Record<string, unknown>)
          : { value: payload };
      return {
        type: 'custom',
        payload: data,
      } as AutomationInstructionAction;
    }
    default: {
      if (isRecord(payload)) {
        return { type, ...payload } as AutomationInstructionAction;
      }
      if (payload === undefined) {
        return { type } as AutomationInstructionAction;
      }
      return {
        type,
        value: payload,
      } as AutomationInstructionAction;
    }
  }
}

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function safeParseJson<T = unknown>(candidate: string): T | null {
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): unknown {
  const direct = safeParseJson(text);
  if (direct && typeof direct === 'object') {
    return direct;
  }

  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeMatch) {
    const parsed = safeParseJson(codeMatch[1]);
    if (parsed) {
      return parsed;
    }
  }

  const firstBrace = text.indexOf('{');
  if (firstBrace >= 0) {
    let depth = 0;
    for (let index = firstBrace; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(firstBrace, index + 1);
          const parsed = safeParseJson(candidate);
          if (parsed) {
            return parsed;
          }
        }
      }
    }
  }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsed = safeParseJson(arrayMatch[0]);
    if (parsed) {
      return { actions: parsed };
    }
  }

  return null;
}

function summariseActions(actions: AutomationInstructionAction[]): string | null {
  const created: string[] = [];
  const connections: string[] = [];
  const metadataUpdates: string[] = [];

  for (const action of actions) {
    if (hasCreateNodePayload(action)) {
      const { label, agentType, id, metadata } = action.node;
      let metadataName: string | undefined;
      if (metadata && typeof metadata === 'object' && metadata !== null && 'name' in metadata) {
        const nameValue = (metadata as Record<string, unknown>).name;
        if (typeof nameValue === 'string' || typeof nameValue === 'number') {
          metadataName = String(nameValue);
        }
      }
      const displayLabel = label ?? agentType ?? id ?? metadataName ?? 'new node';
      created.push(displayLabel);
    } else if (action.type === 'connect_nodes') {
      connections.push(`${action.from} → ${action.to}`);
    } else if (action.type === 'update_metadata') {
      const updates: string[] = [];
      if (action.name) updates.push(`name → ${action.name}`);
      if (typeof action.description === 'string') updates.push('description');
      if (action.data && Object.keys(action.data).length) {
        updates.push('metadata');
      }
      if (updates.length) {
        metadataUpdates.push(updates.join(', '));
      }
    }
  }

  const parts: string[] = [];
  if (created.length) {
    parts.push(`Created ${formatList(created)}`);
  }
  if (connections.length) {
    parts.push(`Connected ${formatList(connections)}`);
  }
  if (metadataUpdates.length) {
    parts.push(`Updated ${formatList(metadataUpdates)}`);
  }

  if (!parts.length) {
    return null;
  }
  return `${parts.join('. ')}.`;
}

function buildPrompt(userPrompt: string, context: InterpretationContext): string {
  const segments: string[] = [];
  segments.push(
    [
      'You are Atlas Forge, an automation architect. Translate natural language requests into JSON instructions',
      'for updating a directed graph of automation agents. The graph supports these actions:',
      '- create_node: { node: { id?, label?, agentType?, type?, config?, position?, metadata? } }',
      '- update_node: { id, label?, agentType?, type?, config?, metadata?, position? }',
      '- delete_node: { id }',
      '- connect_nodes: { from, to, metadata? }',
      '- disconnect_nodes: { from, to }',
      '- update_metadata: { name?, description?, data? }',
      '- set_position: { id, position }',
      '- set_positions: { positions: { id: { x, y } } }',
      '- create_edge: { edge: { from, to, metadata? } }',
      '- delete_edge: { edge: { from, to } }',
      'Return a JSON object: { "actions": [...], "message"?: string }. Do not include commentary.',
    ].join('\n'),
  );

  const summary: Record<string, unknown> = {};
  if (context.name) summary.name = context.name;
  if (context.description) summary.description = context.description;
  if (context.pipeline) {
    summary.pipeline = {
      name: context.pipeline.name ?? null,
      nodes: context.pipeline.nodes?.map((node) => ({
        id: node.id,
        agent: node.agent,
        type: node.type,
        configKeys: Object.keys(node.config ?? {}),
      })),
      edges: context.pipeline.edges?.map((edge) => ({ from: edge.from, to: edge.to })),
    };
  }

  if (Object.keys(summary).length) {
    segments.push(`Context: ${JSON.stringify(summary)}`);
  }

  segments.push(`User Prompt: ${userPrompt.trim()}`);
  segments.push('Respond with valid JSON only.');
  return segments.join('\n\n');
}

class AutomationPromptInterpreter {
  async interpret(prompt: string, context: InterpretationContext = {}): Promise<AutomationPromptInterpretationResult> {
    const trimmed = prompt?.trim();
    if (!trimmed) {
      throw new Error('Prompt text is required.');
    }

    const systemPrompt = buildPrompt(trimmed, context);
    const raw = await routeMessage({
      prompt: systemPrompt,
      intent: 'automation_graph_instructions',
    });
    const parsed = extractJsonObject(raw ?? '');
    const normalized = normalizeInterpretationPayload(parsed);
    if (!normalized) {
      return {
        success: false,
        message: 'Unable to interpret prompt.',
        actions: [],
        raw,
      };
    }

    const actions: AutomationInstructionAction[] = [];
    for (const candidate of normalized.actions) {
      const parsedAction = ACTION_SCHEMA.safeParse(candidate);
      if (parsedAction.success) {
        actions.push(parsedAction.data);
        continue;
      }
      const fallback = FALLBACK_ACTION_SCHEMA.safeParse(candidate);
      if (fallback.success) {
        actions.push(fallback.data as AutomationInstructionAction);
      } else {
        console.warn('[automation-interpreter] Discarding malformed action', candidate);
      }
    }

    if (!actions.length) {
      return {
        success: false,
        message: 'Unable to interpret prompt.',
        actions: [],
        raw,
      };
    }

    const primaryMessage = typeof normalized.message === 'string' ? normalized.message.trim() : undefined;
    const summary = primaryMessage && primaryMessage.length > 0 ? primaryMessage : summariseActions(actions) ?? undefined;

    return {
      success: true,
      message: summary,
      actions,
      raw,
    };
  }
}

export const automationPromptInterpreter = new AutomationPromptInterpreter();
