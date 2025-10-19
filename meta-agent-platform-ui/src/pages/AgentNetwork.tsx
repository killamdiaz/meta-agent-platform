import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Workflow, ChevronDown, Send, Loader2, Pointer, Hand } from "lucide-react";
import { useAgentStore } from "@/store/agentStore";
import { StartNode } from "@/components/AgentNetwork/StartNode";
import { AgentNode } from "@/components/AgentNetwork/AgentNode";
import { ConfigPanel } from "@/components/AgentNetwork/ConfigPanel";
import { api } from "@/lib/api";
import type { AgentRecord, AutomationPipeline, AutomationInstructionAction } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { CreateAgentDrawer } from "@/components/AgentNetwork/CreateAgentDrawer";
import { useAgentGraphStore } from "@/store/agentGraphStore";
import { useAutomationPipelineStore } from "@/store/automationPipelineStore";
import useAgentGraphStream from "@/hooks/useAgentGraphStream";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type SupabaseClientLike = {
  from: (table: string) => any;
};

interface StoredAutomation {
  id: string;
  name: string;
  description?: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface PersistedEdge {
  id: string;
  source: string;
  target: string;
  metadata?: Record<string, unknown>;
}

interface AutomationGraphBlueprint {
  version: number;
  positions: Record<string, { x: number; y: number }>;
  edges: { id: string; source: string; target: string; metadata?: Record<string, unknown> }[];
  metadata?: Record<string, unknown>;
  pipeline?: AutomationPipeline | null;
}

const STORAGE_KEY = "atlas_automations";
const LAST_ACTIVE_AUTOMATION_KEY = "atlas_last_automation_id";
const AUTO_SAVE_DELAY = 2000;

const createAutomationSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `automation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const edgeKey = (source: string, target: string) => `${source}::${target}`;

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `automation-${Math.random().toString(36).slice(2, 10)}`;
};

const isMetaControllerAgent = (agent: AgentRecord): boolean => {
  const id = agent.id.toLowerCase();
  const name = agent.name?.toLowerCase?.() ?? "";
  const role = agent.role?.toLowerCase?.() ?? "";
  return (
    (id.includes("meta") && id.includes("controller")) ||
    name.includes("meta controller") ||
    role.includes("meta controller") ||
    role.includes("meta-controller") ||
    role === "meta"
  );
};

const getSupabaseClient = (): SupabaseClientLike | null => {
  if (typeof window === "undefined") return null;
  const candidate =
    (window as unknown as { supabase?: SupabaseClientLike; __supabase__?: SupabaseClientLike }).supabase ??
    (window as unknown as { supabase?: SupabaseClientLike; __supabase__?: SupabaseClientLike }).__supabase__;
  if (candidate && typeof candidate.from === "function") {
    return candidate;
  }
  return null;
};

const getPersistenceMode = (): "remote" | "local" => {
  if (typeof window === "undefined") return "remote";
  const globalConfig = (window as unknown as { atlasConfig?: { persistenceMode?: string } }).atlasConfig;
  const envMode = import.meta.env.VITE_PERSISTENCE_MODE;
  const mode = globalConfig?.persistenceMode ?? envMode ?? "remote";
  return mode === "local" ? "local" : "remote";
};

const formatList = (items: string[]) => {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const normalizeAutomation = (record: unknown): StoredAutomation | null => {
  if (!isObject(record)) return null;
  const id = typeof record.id === "string" ? record.id : typeof record.uuid === "string" ? record.uuid : generateId();
  const rawName = record.name ?? record.title ?? "Untitled Automation";
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : "Untitled Automation";
  const description =
    typeof record.description === "string"
      ? record.description
      : typeof record.summary === "string"
      ? record.summary
      : undefined;
  const dataField = record.data ?? record.blueprint ?? record.payload ?? {};
  const createdAt =
    typeof record.createdAt === "string"
      ? record.createdAt
      : typeof record.created_at === "string"
      ? record.created_at
      : new Date().toISOString();
  const updatedAt =
    typeof record.updatedAt === "string"
      ? record.updatedAt
      : typeof record.updated_at === "string"
      ? record.updated_at
      : createdAt;

  let data: Record<string, unknown>;
  if (isObject(dataField)) {
    data = dataField;
  } else {
    try {
      data = JSON.parse(String(dataField));
    } catch {
      data = {};
    }
  }

  return {
    id,
    name,
    description,
    data,
    createdAt,
    updatedAt,
  };
};

const readLocalAutomations = (): StoredAutomation[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const automations = parsed
      .map((item) => normalizeAutomation(item))
      .filter((entry): entry is StoredAutomation => entry !== null);
    return automations;
  } catch (error) {
    console.warn("Failed to read automations from localStorage", error);
    return [];
  }
};

const writeLocalAutomations = (automations: StoredAutomation[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(automations));
  } catch (error) {
    console.warn("Failed to write automations to localStorage", error);
  }
};

export async function loadAutomations(): Promise<StoredAutomation[]> {
  if (getPersistenceMode() === "remote") {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const table = supabase.from("automations");
        let query = table.select?.("*");
        if (query && typeof query.order === "function") {
          query = query.order("created_at", { ascending: true });
        }
        const { data, error } = (await query) ?? { data: null, error: null };
        if (error) {
          throw new Error(error.message ?? "Failed to load automations from Supabase");
        }
        if (Array.isArray(data)) {
          return data
            .map((item) => normalizeAutomation(item))
            .filter((entry): entry is StoredAutomation => entry !== null);
        }
        return [];
      } catch (error) {
        console.warn("Supabase automation load failed, falling back to localStorage", error);
        return readLocalAutomations();
      }
    }
  }
  return readLocalAutomations();
}

export async function loadAutomationById(id: string): Promise<StoredAutomation | null> {
  if (getPersistenceMode() === "remote") {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const table = supabase.from("automations");
        const query = table.select?.("*").eq?.("id", id).maybeSingle?.();
        const { data, error } = (await (query ?? table.select?.("*").eq?.("id", id))) ?? {
          data: null,
          error: null,
        };
        if (error) {
          throw new Error(error.message ?? "Failed to load automation");
        }
        return normalizeAutomation(data);
      } catch (error) {
        console.warn("Supabase automation lookup failed, falling back to local cache", error);
      }
    }
  }
  const local = readLocalAutomations();
  return local.find((entry) => entry.id === id) ?? null;
}

export async function createAutomation(
  name: string,
  description: string | undefined,
  data: Record<string, unknown>,
): Promise<StoredAutomation> {
  const now = new Date().toISOString();
  const record: StoredAutomation = {
    id: generateId(),
    name: name.trim().length > 0 ? name : "Untitled Automation",
    description: description?.trim() || undefined,
    data,
    createdAt: now,
    updatedAt: now,
  };

  if (getPersistenceMode() === "remote") {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const table = supabase.from("automations");
        let mutation = table.insert?.([{
          id: record.id,
          name: record.name,
          description: record.description ?? null,
          data: record.data,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        }]);
        if (mutation && typeof mutation.select === "function") {
          mutation = mutation.select("*").maybeSingle?.() ?? mutation.select("*");
        }
        const { data: inserted, error } = (await mutation) ?? { data: null, error: null };
        if (error) {
          throw new Error(error.message ?? "Failed to create automation");
        }
        const normalized = normalizeAutomation(inserted);
        if (normalized) {
          return normalized;
        }
      } catch (error) {
        console.warn("Supabase automation creation failed, falling back to localStorage", error);
      }
    }
  }

  const automations = readLocalAutomations();
  automations.push(record);
  writeLocalAutomations(automations);
  return record;
}

export async function saveAutomation(
  id: string,
  name: string,
  description: string | undefined,
  data: Record<string, unknown>,
): Promise<StoredAutomation> {
  const now = new Date().toISOString();
  const updatePayload = {
    id,
    name: name.trim().length > 0 ? name : "Untitled Automation",
    description: description?.trim() || undefined,
    data,
    updated_at: now,
    updatedAt: now,
  };

  if (getPersistenceMode() === "remote") {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const table = supabase.from("automations");
        let mutation = table.update?.({
          name: updatePayload.name,
          description: updatePayload.description ?? null,
          data: updatePayload.data,
          updated_at: updatePayload.updated_at,
        }).eq?.("id", id);
        if (mutation && typeof mutation.select === "function") {
          mutation = mutation.select("*").maybeSingle?.() ?? mutation.select("*");
        }
        const { data: updated, error } = (await mutation) ?? { data: null, error: null };
        if (error) {
          throw new Error(error.message ?? "Failed to save automation");
        }
        const normalized = normalizeAutomation(updated);
        if (normalized) {
          return normalized;
        }
        return {
          id,
          name: updatePayload.name,
          description: updatePayload.description,
          data: updatePayload.data,
          createdAt: now,
          updatedAt: now,
        };
      } catch (error) {
        console.warn("Supabase automation save failed, falling back to localStorage", error);
      }
    }
  }

  const automations = readLocalAutomations();
  const index = automations.findIndex((entry) => entry.id === id);
  const previous = automations[index];
  const updatedRecord: StoredAutomation = {
    id,
    name: updatePayload.name,
    description: updatePayload.description,
    data,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  if (index >= 0) {
    automations[index] = updatedRecord;
  } else {
    automations.push(updatedRecord);
  }
  writeLocalAutomations(automations);
  return updatedRecord;
}

export async function deleteAutomation(id: string): Promise<void> {
  if (!id) return;
  if (getPersistenceMode() === "remote") {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const table = supabase.from("automations");
        await (table.delete?.().eq?.("id", id) ?? table.delete?.());
      } catch (error) {
        console.warn("Supabase automation delete failed, falling back to localStorage", error);
      }
    }
  }
  const automations = readLocalAutomations().filter((entry) => entry.id !== id);
  writeLocalAutomations(automations);
}

export function getLastActiveAutomation(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ACTIVE_AUTOMATION_KEY);
}

const parseBlueprint = (data: unknown): AutomationGraphBlueprint | null => {
  if (!isObject(data)) return null;
  const version = typeof data.version === "number" ? data.version : 1;

  let positions: Record<string, { x: number; y: number }> = {};
  if (isObject(data.positions)) {
    const next: Record<string, { x: number; y: number }> = {};
    for (const [key, value] of Object.entries(data.positions)) {
      if (isObject(value) && typeof value.x === "number" && typeof value.y === "number") {
        next[key] = { x: value.x, y: value.y };
      }
    }
    positions = next;
  } else if (Array.isArray(data.nodes)) {
    const next: Record<string, { x: number; y: number }> = {};
    for (const node of data.nodes) {
      if (isObject(node) && typeof node.id === "string" && isObject(node.position) && typeof node.position.x === "number" && typeof node.position.y === "number") {
        next[node.id] = { x: node.position.x, y: node.position.y };
      }
    }
    positions = next;
  }

  const edges: { id: string; source: string; target: string; metadata?: Record<string, unknown> }[] = [];
  const edgesSource = Array.isArray(data.edges) ? data.edges : Array.isArray(data.links) ? data.links : [];
  for (const entry of edgesSource) {
    if (!isObject(entry)) continue;
    const source =
      typeof entry.source === "string"
        ? entry.source
        : typeof entry.from === "string"
        ? entry.from
        : undefined;
    const target =
      typeof entry.target === "string"
        ? entry.target
        : typeof entry.to === "string"
        ? entry.to
        : undefined;
    if (!source || !target) continue;
    const id =
      typeof entry.id === "string" && entry.id.length > 0
        ? entry.id
        : typeof entry.key === "string"
        ? entry.key
        : edgeKey(source, target);
    const metadata: Record<string, unknown> | undefined = isObject(entry.metadata) ? entry.metadata : undefined;
    if (!edges.some((edge) => edge.id === id)) {
      edges.push({ id, source, target, metadata });
    }
  }

  const metadata = isObject(data.metadata) ? data.metadata : undefined;
  let pipeline: AutomationPipeline | null = null;
  if (isObject(data.pipeline)) {
    try {
      pipeline = JSON.parse(JSON.stringify(data.pipeline)) as AutomationPipeline;
    } catch {
      pipeline = data.pipeline as AutomationPipeline;
    }
  }

  return {
    version,
    positions,
    edges,
    metadata,
    pipeline,
  };
};

const serializeBlueprint = (
  agents: AgentRecord[],
  positions: Record<string, { x: number; y: number }>,
  edges: PersistedEdge[],
  pipeline: AutomationPipeline | null | undefined,
  extras?: Record<string, unknown>,
): AutomationGraphBlueprint => {
  const positionRecord: Record<string, { x: number; y: number }> = {};
  agents.forEach((agent, index) => {
    const fallback = generatePosition(index, agents.length);
    const position = positions[agent.id] ?? fallback;
    positionRecord[agent.id] = { x: position.x, y: position.y };
  });

  const uniqueEdges: PersistedEdge[] = [];
  const seen = new Set<string>();
  edges.forEach((edge) => {
    const key = edgeKey(edge.source, edge.target);
    if (seen.has(key)) return;
    seen.add(key);
    uniqueEdges.push(edge);
  });

  return {
    version: 1,
    positions: positionRecord,
    edges: uniqueEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      metadata: edge.metadata,
    })),
    metadata: extras,
    pipeline: pipeline ? JSON.parse(JSON.stringify(pipeline)) : null,
  };
};

const nodeTypes = {
  start: StartNode,
  agent: AgentNode,
};

type ModuleProfile = {
  objectives: string[];
  memoryContext: string;
  instructions: string[];
};

const MODULE_PRESETS: Record<string, ModuleProfile> = {
  AtlasContractsAgent: {
    objectives: [
      "Continuously ingest and summarize new contract updates coming from Atlas systems.",
      "Surface risks, key dates, and required actions to the Atlas Meta Controller.",
      "Keep downstream agents informed about contract status changes and approvals.",
    ],
    memoryContext:
      "Maintain a running digest of all contract negotiations, approvals, obligations, and deadlines. Include current owners, counterparties, renewal windows, and signature status for each agreement.",
    instructions: [
      "Poll Atlas Bridge contracts endpoint on the cadence provided by the orchestrator.",
      "Annotate each contract event with risk level, next action, and responsible team.",
      "Publish concise summaries to the routing queue for finance and operations agents.",
    ],
  },
  AtlasTasksAgent: {
    objectives: [
      "Aggregate tasks created across Atlas products and partner systems.",
      "Detect blockers or overdue work and notify the responsible Atlas squad.",
      "Feed prioritized task lists to downstream execution agents.",
    ],
    memoryContext:
      "Track active tasks, owners, dependencies, and due dates. Record context about blockers, escalation status, and linked documents so other agents can execute without re-querying the source.",
    instructions: [
      "Ingest task updates from Atlas Bridge every time the orchestrator signals new activity.",
      "Normalize task metadata (status, owner, effort) and highlight changes since last poll.",
      "Dispatch curated task summaries to the Atlas Meta Controller and subscribers.",
    ],
  },
  AtlasInvoicesAgent: {
    objectives: [
      "Monitor invoices flowing through Atlas finance and flag anomalies.",
      "Coordinate with Atlas Contracts and Accounts Receivable agents to resolve issues.",
      "Provide real-time reporting on invoice status, payments, and delinquencies.",
    ],
    memoryContext:
      "Maintain invoice ledgers with invoice numbers, customers, payment status, and outstanding balances. Include cross-links to underlying contracts and tasks required for resolution.",
    instructions: [
      "Fetch invoice snapshots from Atlas Bridge finance endpoints on each trigger.",
      "Detect discrepancies such as overdue invoices, missing PO numbers, or mismatched totals.",
      "Escalate critical invoice events to the Meta Controller and notify finance stakeholders.",
    ],
  },
  AtlasNotifyAgent: {
    objectives: [
      "Broadcast critical Atlas platform events to subscribed channels.",
      "Route notifications to the correct downstream agents based on severity and topic.",
      "Ensure Meta Controller has concise digests for decision making.",
    ],
    memoryContext:
      "Store notification templates, routing preferences, and recent alerts. Track which squads have acknowledged alerts and outstanding follow-ups.",
    instructions: [
      "Receive upstream events from Atlas agents and format them for the notify pipeline.",
      "Select delivery channels (Slack, email, dashboards) based on routing rules.",
      "Log delivery receipts and escalate if acknowledgements are missing.",
    ],
  },
  AtlasWorkspaceAgent: {
    objectives: [
      "Synthesize Atlas workspace activity into actionable summaries.",
      "Highlight collaboration hotspots, blockers, and opportunities.",
      "Support other agents with contextual workspace intelligence.",
    ],
    memoryContext:
      "Capture workspace artifacts, recent collaboration threads, and project milestones. Maintain snapshots so other agents can reference historical context without re-fetching data.",
    instructions: [
      "Query Atlas workspace APIs on demand from orchestration triggers.",
      "Summarize key updates, tagging the relevant squads and linking follow-up tasks.",
      "Publish structured insights to downstream automation pipelines.",
    ],
  },
  AtlasBridgeAgent: {
    objectives: [
      "Serve as the gateway between Atlas agents and external data sources.",
      "Normalize responses from Atlas Bridge endpoints for downstream consumption.",
      "Enforce rate limiting and authentication policies for bridge traffic.",
    ],
    memoryContext:
      "Retain metadata about recent bridge calls, caching policies, and API schemas. Keep diagnostics for throttling events and upstream errors to assist debugging.",
    instructions: [
      "Handle bridge requests from sibling agents, applying auth credentials securely.",
      "Transform responses into standardized payloads and flag anomalies.",
      "Record usage metrics and surface them to monitoring agents.",
    ],
  },
};

const deriveModuleProfile = (
  agentType: string | undefined,
  fallbackName: string,
  metadata: Record<string, unknown>,
): ModuleProfile => {
  const rawObjectives = metadata.objectives;
  const objectives: string[] =
    Array.isArray(rawObjectives)
      ? rawObjectives.map((value) => String(value).trim()).filter((value) => value.length > 0)
      : typeof rawObjectives === "string"
      ? rawObjectives
          .split(/[\n\r]+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      : [];

  const rawMemory = metadata.memoryContext ?? metadata.memory_context ?? metadata.memory;
  const memoryContext =
    typeof rawMemory === "string" && rawMemory.trim().length > 0 ? rawMemory.trim() : undefined;

  const rawInstructions = metadata.instructions ?? metadata.workplan;
  const instructions =
    Array.isArray(rawInstructions)
      ? rawInstructions.map((value) => String(value).trim()).filter((value) => value.length > 0)
      : typeof rawInstructions === "string"
      ? rawInstructions
          .split(/[\n\r]+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      : [];

  if (objectives.length || instructions.length) {
    const fallback = deriveFallbackProfile(agentType, fallbackName);
    return {
      objectives: objectives.length ? objectives : fallback.objectives,
      memoryContext: memoryContext ?? fallback.memoryContext,
      instructions: instructions.length ? instructions : fallback.instructions,
    };
  }

  const preset = agentType && MODULE_PRESETS[agentType];
  if (preset) {
    return preset;
  }
  return deriveFallbackProfile(agentType, fallbackName);
};

const deriveFallbackProfile = (agentType: string | undefined, fallbackName: string): ModuleProfile => {
  if (agentType && MODULE_PRESETS[agentType]) {
    return MODULE_PRESETS[agentType];
  }
  const normalized = fallbackName.toLowerCase();
  if (normalized.includes("contract")) return MODULE_PRESETS.AtlasContractsAgent;
  if (normalized.includes("invoice") || normalized.includes("bill")) return MODULE_PRESETS.AtlasInvoicesAgent;
  if (normalized.includes("task") || normalized.includes("todo")) return MODULE_PRESETS.AtlasTasksAgent;
  if (normalized.includes("notify") || normalized.includes("alert")) return MODULE_PRESETS.AtlasNotifyAgent;
  if (normalized.includes("workspace")) return MODULE_PRESETS.AtlasWorkspaceAgent;
  if (normalized.includes("bridge")) return MODULE_PRESETS.AtlasBridgeAgent;
  const title = fallbackName.trim().length > 0 ? fallbackName.trim() : "Atlas Agent";
  return {
    objectives: [
      `Execute the "${title}" responsibilities for the Atlas automation network.`,
      "Collaborate with sibling agents by publishing actionable summaries.",
      "Report key outcomes and anomalies back to the Atlas Meta Controller.",
    ],
    memoryContext: `Maintain the working memory for the ${title} agent, capturing inputs, decisions, escalations, and outputs so that sibling agents can pick up work seamlessly.`,
    instructions: [
      `Ingest relevant signals for the "${title}" domain.`,
      "Transform raw data into structured insights and tasks for downstream agents.",
      "Log context-rich updates to the shared memory store for auditability.",
    ],
  };
};

const START_NODE: Node = {
  id: "start",
  type: "start",
  position: { x: 0, y: 0 },
  data: { label: "Start" },
  draggable: false,
};

const normalizePositionKey = (id: string) => (id.startsWith("pipeline:") ? id.slice("pipeline:".length) : id);

const generatePosition = (index: number, total: number): { x: number; y: number } => {
  if (total <= 0) return { x: 0, y: 0 };
  const minRadius = 320;
  const desiredSpacing = 180;
  const radius = Math.max(minRadius, (total * desiredSpacing) / (2 * Math.PI));
  const angle = (index / total) * 2 * Math.PI;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
};

export default function AgentNetwork() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showMinimap, setShowMinimap] = useState(false);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [automationName, setAutomationName] = useState("Untitled Automation");
  const [automationDescription, setAutomationDescription] = useState("");
  const [automationOpen, setAutomationOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("__new");
  const [automations, setAutomations] = useState<StoredAutomation[]>([]);
  const [isAutomationListLoading, setAutomationListLoading] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [persistedEdges, setPersistedEdges] = useState<PersistedEdge[]>([]);
  const [currentAutomation, setCurrentAutomation] = useState<StoredAutomation | null>(null);
  const [isPersistingAutomation, setPersistingAutomation] = useState(false);
  const [isDeletingAutomation, setDeletingAutomation] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoRect, setLassoRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [lassoActive, setLassoActive] = useState(false);
  const [lassoEnabled, setLassoEnabled] = useState(true);
  const [promptInput, setPromptInput] = useState("");
  const [isPromptSubmitting, setPromptSubmitting] = useState(false);
  const [promptStatus, setPromptStatus] = useState<string | null>(null);
  const setSharedPipeline = useAutomationPipelineStore((state) => state.setPipeline);
  const clearSharedPipeline = useAutomationPipelineStore((state) => state.clear);
  const automationPipeline = useAutomationPipelineStore((state) => state.pipeline);
  const [automationDirty, setAutomationDirty] = useState(false);
  const lastPersistedSignatureRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const autoSavePromiseRef = useRef<Promise<void> | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedAgents([]);
    setLassoActive(false);
    setLassoRect(null);
    setLassoStart(null);
  }, []);

  useAgentGraphStream(true);
  const graphAgents = useAgentGraphStore((state) => state.agents);
  const graphLinks = useAgentGraphStore((state) => state.links);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    select: (response) => response.items,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    setPositions((current) => {
      const next = { ...current };
      let changed = false;
      const totalAgents = agents.length;
      agents.forEach((agent, index) => {
        if (!next[agent.id]) {
          next[agent.id] = generatePosition(index, totalAgents);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [agents]);

  const createAgentMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.createAgent>[0]) => api.createAgent(payload),
    onSuccess: (agent) => {
      toast({ title: "Agent created", description: `${agent.name} is now available.` });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create agent", description: error.message, variant: "destructive" });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.deleteAgent(id),
    onSuccess: () => {
      toast({ title: "Agent removed" });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<AgentRecord> & { objectives?: string[] } }) =>
      api.updateAgent(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update agent", description: error.message, variant: "destructive" });
    },
  });

  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedAgentsSet = useMemo(() => new Set(selectedAgents), [selectedAgents]);

  const applyAutomation = useCallback(
    (record: StoredAutomation | null) => {
      clearSelection();
      if (!record) {
        setCurrentAutomation(null);
        setSelectedAutomationId("__new");
        setAutomationName("Untitled Automation");
        setAutomationDescription("");
        setPersistedEdges([]);
        setPositions({});
        setIsEditingName(false);
        clearSharedPipeline();
        selectAgent(null);
        setAutomationDirty(false);
        lastPersistedSignatureRef.current = null;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(LAST_ACTIVE_AUTOMATION_KEY);
        }
        return;
      }

      setCurrentAutomation(record);
      setSelectedAutomationId(record.id);
      setAutomationName(record.name);
      setAutomationDescription(record.description ?? "");
      setIsEditingName(false);

      const blueprint = parseBlueprint(record.data);
      if (blueprint) {
        setPositions(() => {
          const mapped: Record<string, { x: number; y: number }> = {};
          Object.entries(blueprint.positions).forEach(([key, value]) => {
            mapped[normalizePositionKey(key)] = value;
          });
          return mapped;
        });
        setPersistedEdges(
          blueprint.edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            metadata: edge.metadata,
          })),
        );
        if (blueprint.pipeline) {
          setSharedPipeline(blueprint.pipeline, null);
        } else {
          clearSharedPipeline();
        }
        if (blueprint.metadata && typeof blueprint.metadata.selectedAgentId === "string") {
          selectAgent(blueprint.metadata.selectedAgentId);
        } else {
          selectAgent(null);
        }
        const blueprintSignature = (() => {
          try {
            return JSON.stringify({
              pipeline: blueprint.pipeline ?? null,
              positions: blueprint.positions,
              persistedEdges: blueprint.edges,
              name: record.name.trim(),
              description: (record.description ?? "").trim(),
            });
          } catch {
            return `${Date.now()}`;
          }
        })();
        lastPersistedSignatureRef.current = blueprintSignature;
      } else {
        setPositions({});
        setPersistedEdges([]);
        clearSharedPipeline();
        selectAgent(null);
        lastPersistedSignatureRef.current = null;
      }
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setAutomationDirty(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_ACTIVE_AUTOMATION_KEY, record.id);
      }
      console.log(`[automation-persist] Auto-loaded automation "${record.name}"`);
    },
    [
      clearSelection,
      clearSharedPipeline,
      selectAgent,
      setSharedPipeline,
      setAutomationDescription,
      setAutomationName,
    ],
  );

  const applyInstructionActions = useCallback(
    async (actions: AutomationInstructionAction[]) => {
      clearSelection();
      selectAgent(null);
      if (!actions || actions.length === 0) {
        return "No changes detected.";
      }

      const existingPipeline =
        automationPipeline ??
        ({
          name: automationName.trim() || "Untitled Automation",
          nodes: [],
          edges: [],
        } as AutomationPipeline);

      const nextPipeline: AutomationPipeline = JSON.parse(JSON.stringify(existingPipeline));
      const createdLabelSet = new Set<string>();
      const connectionSummaries: string[] = [];
      const metadataSummaries: string[] = [];
      const newNodeIds: string[] = [];
      const persistAdds: PersistedEdge[] = [];
      const persistRemovals = new Set<string>();
      let pipelineChanged = false;
      let metadataChanged = false;
      let positionsChanged = false;
      let persistChanged = false;
      let focusTarget: string | null = null;
      let shouldRefreshAgents = false;

      const ensureUniqueNodeId = (proposed?: string) => {
        const base =
          (proposed && proposed.trim().length > 0 ? proposed.trim() : undefined) ??
          `node-${Math.random().toString(36).slice(2, 8)}`;
        if (!nextPipeline.nodes.some((node) => node.id === base)) {
          return base;
        }
        let index = 2;
        let candidate = `${base}-${index}`;
        while (nextPipeline.nodes.some((node) => node.id === candidate)) {
          index += 1;
          candidate = `${base}-${index}`;
        }
        return candidate;
      };

      const aliasMap = new Map<string, string>();

      const registerAlias = (alias: string | null | undefined, id: string) => {
        if (!alias) return;
        aliasMap.set(alias, id);
      };

      nextPipeline.nodes.forEach((node) => {
        registerAlias(node.id, node.id);
        if (typeof node.agent === "string") {
          registerAlias(node.agent, node.id);
        }
        if (typeof node.config?.label === "string") {
          registerAlias(node.config.label, node.id);
        }
        if (typeof (node.config as Record<string, unknown> | undefined)?.agentId === "string") {
          registerAlias((node.config as { agentId?: string }).agentId, (node.config as { agentId?: string }).agentId!);
        }
      });
      const agentSnapshot = [...agents];

      agentSnapshot.forEach((agent) => {
        registerAlias(agent.id, agent.id);
        registerAlias(agent.name, agent.id);
        registerAlias(agent.role, agent.id);
      });

      const ensurePipelineNode = (id: string) => {
        const existing = nextPipeline.nodes.find((node) => node.id === id);
        if (existing) {
          return existing;
        }
        const uniqueId = ensureUniqueNodeId(id);
        const placeholder = {
          id: uniqueId,
          agent: id,
          type: "Action" as AutomationNodeType,
          config: {},
        };
        nextPipeline.nodes.push(placeholder);
        createdLabelSet.add(id);
        newNodeIds.push(uniqueId);
        pipelineChanged = true;
        return placeholder;
      };

      const resolveNodeId = (id: string) => {
        const mapped = aliasMap.get(id);
        if (mapped) {
          return mapped;
        }
        if (nextPipeline.nodes.some((node) => node.id === id)) {
          return id;
        }
        if (agentSnapshot.some((agent) => agent.id === id)) {
          return id;
        }
        const agentByName = agentSnapshot.find((agent) => agent.name === id || agent.role === id);
        if (agentByName) {
          registerAlias(id, agentByName.id);
          return agentByName.id;
        }
        return ensurePipelineNode(id).id;
      };

      const shouldPersistEdge = (metadata?: Record<string, unknown>) => {
        if (!metadata) return false;
        const candidates = ["persist", "persistent", "save", "persistEdge"];
        return candidates.some((key) => metadata[key] === true || metadata[key] === "true");
      };

      const queuePersistEdge = (source: string, target: string, metadata?: Record<string, unknown>) => {
        const key = edgeKey(source, target);
        persistRemovals.delete(key);
        persistAdds.push({
          id: typeof metadata?.id === "string" && metadata.id.length > 0 ? metadata.id : key,
          source,
          target,
          metadata,
        });
      };

      const queueRemovePersistEdge = (source: string, target: string) => {
        const key = edgeKey(source, target);
        persistRemovals.add(key);
      };

      const markPersistEdgesForNode = (nodeId: string) => {
        persistedEdges.forEach((edge) => {
          if (edge.source === nodeId || edge.target === nodeId) {
            persistRemovals.add(edgeKey(edge.source, edge.target));
          }
        });
      };

      const upsertPosition = (rawId: string, position: { x: number; y: number }) => {
        const targetId = resolveNodeId(rawId);
        const key = normalizePositionKey(targetId);
        setPositions((current) => {
          const next = { ...current };
          const existing = next[key];
          if (existing && existing.x === position.x && existing.y === position.y) {
            return current;
          }
          positionsChanged = true;
          next[key] = { x: position.x, y: position.y };
          return next;
        });
      };

      type CreateNodePayload = NonNullable<Extract<AutomationInstructionAction, { type: "create_node" }>['node']>;

      const ensureAgentMaterialized = async (nodePayload: CreateNodePayload): Promise<{ id: string; profile: ModuleProfile }> => {
        const metadata = isObject(nodePayload.metadata) ? (nodePayload.metadata as Record<string, unknown>) : {};
        const rawAliases = [
          typeof metadata.agentId === "string" ? metadata.agentId : undefined,
          nodePayload.id,
          nodePayload.agentType,
          nodePayload.label,
        ];
        const aliasCandidates = rawAliases
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0);

        let existingId: string | null = null;
        for (const candidate of aliasCandidates) {
          const mapped = aliasMap.get(candidate);
          if (mapped) {
            existingId = mapped;
            break;
          }
        }

        if (!existingId) {
          for (const candidate of aliasCandidates) {
            const candidateLower = candidate.toLowerCase();
            const existingAgent = agentSnapshot.find((agent) => {
              if (agent.id === candidate) return true;
              const agentName = typeof agent.name === "string" ? agent.name.toLowerCase() : "";
              return agentName === candidateLower;
            });
            if (existingAgent) {
              aliasCandidates.forEach((alias) => registerAlias(alias, existingAgent.id));
              existingId = existingAgent.id;
              break;
            }
          }
        }

        const fallbackName =
          (nodePayload.label && nodePayload.label.trim().length > 0
            ? nodePayload.label.trim()
            : nodePayload.agentType && nodePayload.agentType.trim().length > 0
            ? nodePayload.agentType.trim()
            : nodePayload.id && nodePayload.id.trim().length > 0
            ? nodePayload.id.trim()
            : `Agent ${Math.random().toString(36).slice(2, 6)}`).slice(0, 80);

        const metadataRole = typeof metadata.role === "string" ? metadata.role.trim() : "";
        const role = metadataRole.length > 0 ? metadataRole : nodePayload.agentType ?? fallbackName;

        const profile = deriveModuleProfile(nodePayload.agentType, fallbackName, metadata);

        const tools: Record<string, boolean> = {};
        if (isObject(metadata.tools)) {
          Object.entries(metadata.tools as Record<string, unknown>).forEach(([key, value]) => {
            if (key && typeof key === "string") {
              tools[key] = Boolean(value);
            }
          });
        }

        let resolvedId = existingId;

        if (!resolvedId) {
          const createPayload: Parameters<typeof api.createAgent>[0] = {
            name: fallbackName,
            role,
            tools,
            objectives: profile.objectives,
          };

          createPayload.memory_context = profile.memoryContext;
          if (typeof metadata.internet_access_enabled === "boolean") {
            createPayload.internet_access_enabled = metadata.internet_access_enabled;
          }

          try {
            const created = await api.createAgent(createPayload);
            agentSnapshot.push(created);
            queryClient.setQueryData(["agents"], (previous: { items: AgentRecord[] } | undefined) => {
              if (!previous) {
                return { items: [created] };
              }
              if (previous.items.some((agent) => agent.id === created.id)) {
                return previous;
              }
              return { items: [...previous.items, created] };
            });
            aliasCandidates.forEach((alias) => registerAlias(alias, created.id));
            registerAlias(created.name, created.id);
            registerAlias(created.role, created.id);
            registerAlias(created.id, created.id);
            createdLabelSet.add(created.name);
            shouldRefreshAgents = true;
            resolvedId = created.id;
          } catch (error) {
            console.error("[automation-builder] Failed to create agent from prompt", error);
            toast({
              title: "Failed to create agent",
              description: error instanceof Error ? error.message : "Unknown error occurred.",
              variant: "destructive",
            });
            const fallbackId = ensureUniqueNodeId(nodePayload.id ?? nodePayload.label);
            registerAlias(fallbackId, fallbackId);
            createdLabelSet.add(fallbackName);
            resolvedId = fallbackId;
          }
        }

        if (!resolvedId) {
          resolvedId = ensureUniqueNodeId(nodePayload.id ?? nodePayload.label);
        }

        metadata.objectives = profile.objectives;
        metadata.memoryContext = profile.memoryContext;
        metadata.instructions = profile.instructions;

        return { id: resolvedId, profile };
      };

      const createActions = actions.filter((action): action is Extract<AutomationInstructionAction, { type: "create_node" }> => action.type === "create_node");
      for (const action of createActions) {
        const nodePayload = (action.node ?? {}) as CreateNodePayload;
        const { id: resolvedId, profile } = await ensureAgentMaterialized(nodePayload);
        const agentExisted = agentSnapshot.some((agent) => agent.id === resolvedId);
        if (agentExisted && !aliasMap.has(resolvedId)) {
          registerAlias(resolvedId, resolvedId);
        }
        registerAlias(nodePayload.id, resolvedId);
        registerAlias(nodePayload.agentType, resolvedId);
        registerAlias(nodePayload.label, resolvedId);

        const agentType = nodePayload.agentType ?? nodePayload.id ?? resolvedId;
        const nodeType: AutomationNodeType = nodePayload.type ?? "Action";
        const config: Record<string, unknown> = { ...(nodePayload.config ?? {}) };
        if (nodePayload.label) {
          config.label = nodePayload.label;
        }
        const metadataConfig = isObject(nodePayload.metadata) ? { ...nodePayload.metadata } : {};
        metadataConfig.objectives = profile.objectives;
        metadataConfig.memoryContext = profile.memoryContext;
        metadataConfig.instructions = profile.instructions;
        config.metadata = metadataConfig;
        (config as Record<string, unknown>).agentId = resolvedId;

        const existingIndex = nextPipeline.nodes.findIndex((node) => node.id === resolvedId);
        if (existingIndex >= 0) {
          nextPipeline.nodes[existingIndex] = {
            ...nextPipeline.nodes[existingIndex],
            agent: agentType,
            type: nodeType,
            config: { ...nextPipeline.nodes[existingIndex].config, ...config },
          };
        } else {
          nextPipeline.nodes.push({
            id: resolvedId,
            agent: agentType,
            type: nodeType,
            config,
          });
          newNodeIds.push(resolvedId);
        }
        pipelineChanged = true;
        if (!agentExisted) {
          createdLabelSet.add(nodePayload.label ?? agentType ?? resolvedId);
        }

        if (nodePayload.position) {
          upsertPosition(resolvedId, nodePayload.position);
        }
      }

      for (const action of actions.filter((entry) => entry.type !== "create_node")) {
        switch (action.type) {
          case "update_node": {
            const resolvedId = resolveNodeId(action.id);
            const target = nextPipeline.nodes.find((node) => node.id === resolvedId);
            if (!target) {
              console.warn("[automation-builder] update_node target not found", action.id);
              break;
            }
            if (action.agentType) {
              target.agent = action.agentType;
            }
            if (
              action.nodeType &&
              (action.nodeType === "Trigger" || action.nodeType === "Processor" || action.nodeType === "Action")
            ) {
              target.type = action.nodeType;
            }
            if (action.config) {
              target.config = { ...target.config, ...action.config };
            }
            if (action.label) {
              target.config = { ...target.config, label: action.label };
            }
            if (action.metadata) {
              target.config = { ...target.config, metadata: { ...(target.config?.metadata as Record<string, unknown> | undefined), ...action.metadata } };
            }
            if (action.position) {
              upsertPosition(resolvedId, action.position);
            }
            pipelineChanged = true;
            break;
          }
          case "delete_node": {
            const resolvedId = resolveNodeId(action.id);
            const index = nextPipeline.nodes.findIndex((node) => node.id === resolvedId);
            if (index >= 0) {
              nextPipeline.nodes.splice(index, 1);
              nextPipeline.edges = nextPipeline.edges.filter(
                (edge) => edge.from !== resolvedId && edge.to !== resolvedId,
              );
              markPersistEdgesForNode(resolvedId);
              pipelineChanged = true;
            }
            break;
          }
          case "connect_nodes": {
            const fromId = resolveNodeId(action.from);
            const toId = resolveNodeId(action.to);
            const exists = nextPipeline.edges.some((edge) => edge.from === fromId && edge.to === toId);
            if (!exists) {
              nextPipeline.edges.push({ from: fromId, to: toId });
              pipelineChanged = true;
            }
            connectionSummaries.push(`${fromId} → ${toId}`);
            if (shouldPersistEdge(action.metadata)) {
              queuePersistEdge(fromId, toId, action.metadata);
            }
            break;
          }
          case "disconnect_nodes": {
            const fromId = resolveNodeId(action.from);
            const toId = resolveNodeId(action.to);
            const before = nextPipeline.edges.length;
            nextPipeline.edges = nextPipeline.edges.filter((edge) => !(edge.from === fromId && edge.to === toId));
            if (nextPipeline.edges.length !== before) {
              pipelineChanged = true;
            }
            queueRemovePersistEdge(fromId, toId);
            break;
          }
          case "create_edge": {
            const fromId = resolveNodeId(action.edge.from);
            const toId = resolveNodeId(action.edge.to);
            const exists = nextPipeline.edges.some((edge) => edge.from === fromId && edge.to === toId);
            if (!exists) {
              nextPipeline.edges.push({ from: fromId, to: toId });
              pipelineChanged = true;
            }
            connectionSummaries.push(`${fromId} → ${toId}`);
            if (shouldPersistEdge(action.edge.metadata)) {
              queuePersistEdge(fromId, toId, action.edge.metadata);
            }
            break;
          }
          case "delete_edge": {
            const fromId = resolveNodeId(action.edge.from);
            const toId = resolveNodeId(action.edge.to);
            const before = nextPipeline.edges.length;
            nextPipeline.edges = nextPipeline.edges.filter((edge) => !(edge.from === fromId && edge.to === toId));
            if (nextPipeline.edges.length !== before) {
              pipelineChanged = true;
            }
            queueRemovePersistEdge(fromId, toId);
            break;
          }
          case "set_position": {
            upsertPosition(action.id, action.position);
            break;
          }
          case "set_positions": {
            const entries = Object.entries(action.positions ?? {});
            if (entries.length > 0) {
              setPositions((current) => {
                const next = { ...current };
                let changed = false;
                entries.forEach(([rawId, position]) => {
                  const targetId = resolveNodeId(rawId);
                  const key = normalizePositionKey(targetId);
                  const existing = next[key];
                  if (!existing || existing.x !== position.x || existing.y !== position.y) {
                    next[key] = { x: position.x, y: position.y };
                    changed = true;
                  }
                });
                if (!changed) {
                  return current;
                }
                positionsChanged = true;
                return next;
              });
            }
            break;
          }
          case "focus_node": {
            const focusId = resolveNodeId(action.id);
            if (agents.some((agent) => agent.id === focusId) || nextPipeline.nodes.some((node) => node.id === focusId)) {
              focusTarget = focusId;
            }
            break;
          }
          case "update_metadata": {
            if (action.name && action.name.trim().length > 0) {
              nextPipeline.name = action.name.trim();
              setAutomationName(action.name.trim());
              metadataSummaries.push(`name → ${action.name.trim()}`);
              metadataChanged = true;
            }
            if (typeof action.description === "string") {
              setAutomationDescription(action.description);
              metadataSummaries.push("description");
              metadataChanged = true;
            }
            if (action.data && Object.keys(action.data).length > 0) {
              metadataSummaries.push("metadata");
              metadataChanged = true;
            }
            break;
          }
          default: {
            console.warn("[automation-builder] Unhandled instruction action", action);
            break;
          }
        }
      }

      if (newNodeIds.length > 0) {
        setPositions((current) => {
          const next = { ...current };
          let total = Object.keys(next).length + 1;
          let changed = false;
          newNodeIds.forEach((id) => {
            const key = normalizePositionKey(id);
            if (!next[key]) {
              next[key] = generatePosition(total, total + 1);
              total += 1;
              changed = true;
            }
          });
          if (!changed) {
            return current;
          }
          positionsChanged = true;
          return next;
        });
      }

      if (persistAdds.length > 0 || persistRemovals.size > 0) {
        setPersistedEdges((current) => {
          let next = current.filter((edge) => !persistRemovals.has(edgeKey(edge.source, edge.target)));
          let changed = next.length !== current.length;
          persistAdds.forEach((edge) => {
            const key = edgeKey(edge.source, edge.target);
            const existingIndex = next.findIndex((candidate) => edgeKey(candidate.source, candidate.target) === key);
            const metadataString = JSON.stringify(edge.metadata ?? {});
            if (existingIndex >= 0) {
              const existing = next[existingIndex];
              const existingMeta = JSON.stringify(existing.metadata ?? {});
              if (existing.id !== edge.id || existingMeta !== metadataString) {
                next = [...next.slice(0, existingIndex), edge, ...next.slice(existingIndex + 1)];
                changed = true;
              }
            } else {
              next = [...next, edge];
              changed = true;
            }
          });
          if (changed) {
            persistChanged = true;
            return next;
          }
          return current;
        });
      }

      if (pipelineChanged || metadataChanged) {
        setSharedPipeline(nextPipeline, null);
      }

      if (pipelineChanged || metadataChanged || positionsChanged || persistChanged) {
        setAutomationDirty(true);
      }

      if (focusTarget && agents.some((agent) => agent.id === focusTarget)) {
        selectAgent(focusTarget);
      }

      if (shouldRefreshAgents) {
        try {
          await queryClient.invalidateQueries({ queryKey: ["agents"] });
        } catch (error) {
          console.warn("[automation-builder] failed to refresh agents", error);
        }
      }

      const summaryParts: string[] = [];
      const createdLabels = Array.from(createdLabelSet);
      if (createdLabels.length) {
        summaryParts.push(`Created ${formatList(createdLabels)}`);
      }
      if (connectionSummaries.length) {
        summaryParts.push(`Connected ${formatList(connectionSummaries)}`);
      }
      if (metadataSummaries.length) {
        summaryParts.push(`Updated ${formatList(metadataSummaries)}`);
      }
      if (!summaryParts.length && !pipelineChanged && !metadataChanged && !positionsChanged && !persistChanged) {
        summaryParts.push("No changes applied");
      }

      return `${summaryParts.join(". ")}.`;
    },
    [
      agents,
      automationName,
      automationPipeline,
      clearSelection,
      selectAgent,
      setAutomationDescription,
      setAutomationDirty,
      setAutomationName,
      persistedEdges,
      setPersistedEdges,
      setPositions,
      setSharedPipeline,
      queryClient,
      toast,
    ],
  );

  const refreshAutomations = useCallback(async () => {
    setAutomationListLoading(true);
    try {
      const list = await loadAutomations();
      setAutomations(list);
      setAutomationError(null);
      return list;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load automations";
      setAutomationError(message);
      toast({
        title: "Failed to load automations",
        description: message,
        variant: "destructive",
      });
      return [];
    } finally {
      setAutomationListLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await refreshAutomations();
      if (!mounted) return;
      if (list.length > 0) {
        const lastActiveId = typeof window !== "undefined" ? window.localStorage.getItem(LAST_ACTIVE_AUTOMATION_KEY) : null;
        const initial = (lastActiveId ? list.find((item) => item.id === lastActiveId) : undefined) ?? list[0];
        applyAutomation(initial);
      } else {
        applyAutomation(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applyAutomation, refreshAutomations]);

  const nodes: Node[] = useMemo(() => {
    const pipelineNodes =
      automationPipeline?.nodes
        .map((node, index) => {
          const linkedAgentId =
            typeof (node.config as { agentId?: string } | undefined)?.agentId === "string"
              ? (node.config as { agentId?: string }).agentId
              : undefined;
          const linkedAgent = linkedAgentId ? agents.find((agent) => agent.id === linkedAgentId) : undefined;
          const id = `pipeline:${node.id}`;
          if (linkedAgent) {
            return null;
          }
          const displayName =
            linkedAgent?.name ??
            (typeof node.config?.label === "string" && node.config.label.trim().length > 0
              ? node.config.label.trim()
              : node.agent ?? node.id) ?? `Node ${index + 1}`;
        const position =
          positions[node.id] ??
          generatePosition(index, (automationPipeline?.nodes.length ?? 0) + agents.length + 1);
        const sourceId = linkedAgent?.id ?? node.id;
        const isVirtual = !linkedAgent;

        return {
          id,
          type: "agent" as const,
          position,
          data: {
            name: displayName,
            status: linkedAgent?.status ?? "design",
            role: linkedAgent?.role ?? node.type,
            isTalking: linkedAgent ? graphAgents[linkedAgent.id]?.isTalking ?? false : false,
            isVirtual,
            sourceId,
          },
          draggable: true,
          selectable: true,
          selected: selectedAgentsSet.has(id),
        };
        })
        .filter((node): node is Node => node !== null) ?? [];

    const agentNodes = agents.map((agent, index) => ({
      id: agent.id,
      type: "agent" as const,
      position: positions[agent.id] ?? generatePosition(index, agents.length),
      data: {
        name: agent.name,
        status: agent.status,
        role: agent.role,
        isTalking: graphAgents[agent.id]?.isTalking ?? false,
        isVirtual: false,
        sourceId: agent.id,
      },
      selected: selectedAgentId === agent.id || selectedAgentsSet.has(agent.id),
    }));

    return [START_NODE, ...pipelineNodes, ...agentNodes];
  }, [agents, automationPipeline, graphAgents, positions, selectedAgentId, selectedAgents]);

  const dynamicEdges = useMemo(() => {
    const agentIds = new Set(agents.map((agent) => agent.id));
    return Object.values(graphLinks)
      .filter((link) => agentIds.has(link.source) && agentIds.has(link.target))
      .map((link) => ({
        id: link.id,
        source: link.source,
        target: link.target,
        animated: link.isActive,
        style: {
          stroke: link.isActive ? "#facc15" : "#6366f1",
          strokeWidth: link.isActive ? 3 : 1.5,
          opacity: link.isActive ? 1 : 0.8,
        },
        data: { isActive: link.isActive },
      }));
  }, [graphLinks, agents]);

  const savedEdges = useMemo(() => {
    const agentIds = new Set(agents.map((agent) => agent.id));
    return persistedEdges
      .filter((edge) => agentIds.has(edge.source) && agentIds.has(edge.target))
      .map((edge) => ({
        id: `saved-${edge.id}`,
        source: edge.source,
        target: edge.target,
        animated: false,
        style: {
          stroke: "#818cf8",
          strokeWidth: 2,
          opacity: 0.85,
          strokeDasharray: "6 3",
        },
        data: { persisted: true, metadata: edge.metadata },
      }));
  }, [agents, persistedEdges]);

  const pipelineEdges = useMemo(() => {
    if (!automationPipeline) return [];
    const nodeIds = new Set(automationPipeline.nodes.map((node) => node.id));
    const nodeAgentMap = new Map<string, string>();
    automationPipeline.nodes.forEach((node) => {
      const agentId =
        typeof (node.config as { agentId?: string } | undefined)?.agentId === "string"
          ? (node.config as { agentId?: string }).agentId
          : undefined;
      if (agentId && agents.some((agent) => agent.id === agentId)) {
        nodeAgentMap.set(node.id, agentId);
      }
    });
    return automationPipeline.edges.map((edge) => {
      const sourceOverride = nodeAgentMap.get(edge.from);
      const targetOverride = nodeAgentMap.get(edge.to);
      const hasPipelineSource = nodeIds.has(edge.from);
      const hasPipelineTarget = nodeIds.has(edge.to);
      const sourceId = sourceOverride ?? (hasPipelineSource ? `pipeline:${edge.from}` : edge.from);
      const targetId = targetOverride ?? (hasPipelineTarget ? `pipeline:${edge.to}` : edge.to);
      return {
        id: `pipeline-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        animated: true,
        style: {
          stroke: "#a855f7",
          strokeWidth: 2,
          opacity: 0.9,
          strokeDasharray: "4 2",
        },
        data: { pipeline: true },
      };
    });
  }, [agents, automationPipeline]);

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const combined = [] as typeof dynamicEdges;
    const register = (edge: (typeof dynamicEdges)[number]) => {
      const key = edgeKey(edge.source, edge.target);
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(edge);
    };

    savedEdges.forEach(register);
    dynamicEdges.forEach(register);
    pipelineEdges.forEach(register);

    const metaAgent = agents.find(isMetaControllerAgent);
    if (metaAgent) {
      const hasMetaConnection = combined.some(
        (edge) => edge.source === metaAgent.id || edge.target === metaAgent.id
      );
      if (!hasMetaConnection) {
        const metaEdge = {
          id: `meta-anchor-${metaAgent.id}`,
          source: "start",
          target: metaAgent.id,
          animated: true,
          style: { stroke: "#f97316", strokeWidth: 3, opacity: 1 },
          data: { metaController: true },
        };
        register(metaEdge as (typeof dynamicEdges)[number]);
      }
    }

    const connectedTargets = new Set<string>();
    for (const edge of combined) {
      connectedTargets.add(edge.target);
    }

    const pipelineNodeIds = automationPipeline?.nodes.map((node) => `pipeline:${node.id}`) ?? [];

    const baseEdgesAgents = agents
      .filter((agent) => !connectedTargets.has(agent.id))
      .map((agent) => ({
        id: `start-${agent.id}`,
        source: "start",
        target: agent.id,
        animated: false,
        style: { stroke: "#3b82f6", strokeWidth: 1.5, opacity: 0.6 },
      }));
    const baseEdgesPipeline = pipelineNodeIds
      .filter((nodeId) => !connectedTargets.has(nodeId))
      .map((nodeId) => ({
        id: `start-${nodeId}`,
        source: "start",
        target: nodeId,
        animated: false,
        style: { stroke: "#6366f1", strokeWidth: 1.5, opacity: 0.6, strokeDasharray: "2 2" },
      }));
    return [...baseEdgesAgents, ...baseEdgesPipeline, ...combined];
  }, [agents, automationPipeline, dynamicEdges, pipelineEdges, savedEdges]);

  const buildMergedEdges = useCallback((): PersistedEdge[] => {
    const merged = new Map<string, PersistedEdge>();
    persistedEdges.forEach((edge) => {
      merged.set(edgeKey(edge.source, edge.target), edge);
    });
    Object.values(graphLinks).forEach((link) => {
      merged.set(edgeKey(link.source, link.target), {
        id: link.id ?? edgeKey(link.source, link.target),
        source: link.source,
        target: link.target,
        metadata: {
          isActive: link.isActive ?? false,
          lastMessageId: link.lastMessageId ?? null,
        },
      });
    });
    const metaAgent = agents.find(isMetaControllerAgent);
    if (metaAgent) {
      const metaKey = edgeKey("start", metaAgent.id);
      if (!merged.has(metaKey)) {
        merged.set(metaKey, {
          id: `start-${metaAgent.id}-meta`,
          source: "start",
          target: metaAgent.id,
          metadata: { enforced: true, label: "meta-controller-anchor" },
        });
      }
    }
    return Array.from(merged.values());
  }, [agents, graphLinks, persistedEdges]);

  const computeAutomationSignature = useCallback(() => {
    const snapshot = {
      pipeline: automationPipeline ?? null,
      positions,
      persistedEdges,
      name: automationName.trim(),
      description: automationDescription.trim(),
    };
    try {
      return JSON.stringify(snapshot);
    } catch {
      return `${Date.now()}`;
    }
  }, [automationDescription, automationName, automationPipeline, persistedEdges, positions]);

  const persistAutomationState = useCallback(
    async (signature?: string) => {
      const targetId = selectedAutomationId;
      if (!targetId || targetId === "__new") {
        lastPersistedSignatureRef.current = computeAutomationSignature();
        setAutomationDirty(false);
        return;
      }

      if (autoSaveInFlightRef.current && autoSavePromiseRef.current) {
        await autoSavePromiseRef.current;
        return;
      }

      const runSave = async () => {
        const pipelineSnapshot: AutomationPipeline = automationPipeline
          ? JSON.parse(JSON.stringify(automationPipeline))
          : {
              name: automationName.trim() || "Untitled Automation",
              nodes: [],
              edges: [],
            };
        const extras: Record<string, unknown> = {
          selectedAgentId: selectedAgentId ?? null,
          description: automationDescription ?? "",
          updatedAt: new Date().toISOString(),
        };
        const blueprint = serializeBlueprint(
          agents,
          positions,
          buildMergedEdges(),
          pipelineSnapshot,
          extras,
        );
        try {
          console.log(
            `[automation-persist] Saving automation "${automationName.trim() || "Untitled Automation"}"...`,
          );
          const record = await saveAutomation(
            targetId,
            automationName.trim() || "Untitled Automation",
            automationDescription,
            blueprint,
          );
          setCurrentAutomation(record);
          setAutomationName(record.name);
          setAutomationDescription(record.description ?? "");
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LAST_ACTIVE_AUTOMATION_KEY, record.id);
          }
          setAutomations((existing) => {
            const index = existing.findIndex((entry) => entry.id === record.id);
            if (index >= 0) {
              const next = [...existing];
              next[index] = record;
              return next;
            }
            return [...existing, record];
          });
          lastPersistedSignatureRef.current = signature ?? computeAutomationSignature();
          setAutomationDirty(false);
          console.log(
            `[automation-persist] Saved automation "${record.name}" at ${new Date().toISOString()}`,
          );
        } catch (error) {
          console.error("[automation-persist] failed to save automation", error);
          toast({
            title: "Failed to save automation",
            description: error instanceof Error ? error.message : "Unknown error occurred.",
            variant: "destructive",
          });
        }
      };

      autoSaveInFlightRef.current = true;
      const promise = runSave().finally(() => {
        autoSaveInFlightRef.current = false;
        autoSavePromiseRef.current = null;
      });
      autoSavePromiseRef.current = promise;
      await promise;
    },
    [
      agents,
      automationDescription,
      automationName,
      automationPipeline,
      buildMergedEdges,
      computeAutomationSignature,
      positions,
      selectedAutomationId,
      selectedAgentId,
      toast,
    ],
  );

  const flushAutoSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (autoSaveInFlightRef.current || automationDirty) {
      await persistAutomationState();
    }
  }, [automationDirty, persistAutomationState]);

  useEffect(() => {
    return () => {
      void flushAutoSave();
    };
  }, [flushAutoSave]);

  const handleNewAutomation = useCallback(async () => {
    await flushAutoSave();
    setPersistingAutomation(true);
    try {
      clearSelection();
      const blankPipeline: AutomationPipeline = {
        name: "New Automation",
        nodes: [],
        edges: [],
      };
      const blankBlueprint: AutomationGraphBlueprint = {
        version: 1,
        positions: {},
        edges: [],
        metadata: {
          createdAt: new Date().toISOString(),
          createdBy: "Atlas UI",
        },
        pipeline: blankPipeline,
      };
      setSharedPipeline(blankPipeline, null);
      setPositions({});
      setPersistedEdges([]);
      setAutomationName("Untitled Automation");
      setAutomationDescription("");
      setAutomationOpen(true);
      setAutomationDirty(false);
      setCurrentAutomation(null);
      setSelectedAutomationId("__new");
      lastPersistedSignatureRef.current = (() => {
        try {
          return JSON.stringify({
            pipeline: blankPipeline,
            positions: {},
            persistedEdges: [],
            name: "Untitled Automation",
            description: "",
          });
        } catch {
          return `${Date.now()}`;
        }
      })();
      const created = await createAutomation("Untitled Automation", undefined, blankBlueprint);
      setAutomations((existing) => [...existing, created]);
      applyAutomation(created);
      toast({
        title: "New automation ready",
        description: "Customize the network layout and hit save when ready.",
      });
    } catch (error) {
      toast({
        title: "Failed to create automation",
        description: error instanceof Error ? error.message : "Unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setPersistingAutomation(false);
    }
  }, [applyAutomation, clearSelection, flushAutoSave, toast, setSharedPipeline]);

  const handleDeleteAutomation = useCallback(async () => {
    if (!selectedAutomationId || selectedAutomationId === "__new") {
      setAutomationOpen(false);
      setCurrentAutomation(null);
      setAutomationName("Untitled Automation");
      setAutomationDescription("");
      setPersistedEdges([]);
      setPositions({});
      clearSharedPipeline();
      selectAgent(null);
      setAutomations((list) => list.filter((item) => item.id !== "__new"));
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LAST_ACTIVE_AUTOMATION_KEY);
      }
      return;
    }
    const confirmation = window.confirm(
      `Delete automation "${automationName.trim() || "Untitled Automation"}"? This cannot be undone.`,
    );
    if (!confirmation) {
      return;
    }
    setDeletingAutomation(true);
    try {
      await flushAutoSave();
      await deleteAutomation(selectedAutomationId);
      setAutomations((existing) => existing.filter((entry) => entry.id !== selectedAutomationId));
      if (typeof window !== "undefined") {
        const last = window.localStorage.getItem(LAST_ACTIVE_AUTOMATION_KEY);
        if (last === selectedAutomationId) {
          window.localStorage.removeItem(LAST_ACTIVE_AUTOMATION_KEY);
        }
      }
      toast({
        title: "Automation deleted",
        description: `${automationName.trim() || "Untitled Automation"} removed.`,
      });
      clearSelection();
      setAutomationOpen(false);
      const remaining = automations.filter((entry) => entry.id !== selectedAutomationId);
      if (remaining.length > 0) {
        applyAutomation(remaining[0]);
      } else {
        applyAutomation(null);
      }
    } catch (error) {
      console.error("[automation-builder] failed to delete automation", error);
      toast({
        title: "Failed to delete automation",
        description: error instanceof Error ? error.message : "Unknown error occurred.",
        variant: "destructive",
      });
    } finally {
      setDeletingAutomation(false);
    }
  }, [
    applyAutomation,
    automations,
    automationName,
    clearSelection,
    clearSharedPipeline,
    flushAutoSave,
    selectAgent,
    selectedAutomationId,
    toast,
  ]);

  const updateSelectionFromBounds = useCallback(
    (bounds: { x1: number; x2: number; y1: number; y2: number }) => {
      if (!reactFlowInstance) return;
      const metaAgentIds = new Set(
        agents.filter((agent) => isMetaControllerAgent(agent)).map((agent) => agent.id),
      );
      const nextSelected = new Set<string>();
      reactFlowInstance.getNodes().forEach((node) => {
        if (node.type !== "agent" || !node.positionAbsolute) return;
        const data = (node.data ?? {}) as { sourceId?: string };
        const sourceId = data.sourceId ?? (node.id.startsWith("pipeline:") ? node.id.replace(/^pipeline:/, "") : node.id);
        if (sourceId && metaAgentIds.has(sourceId)) {
          return;
        }
        const width = node.width ?? 0;
        const height = node.height ?? 0;
        const centerX = node.positionAbsolute.x + width / 2;
        const centerY = node.positionAbsolute.y + height / 2;
        if (
          centerX >= bounds.x1 &&
          centerX <= bounds.x2 &&
          centerY >= bounds.y1 &&
          centerY <= bounds.y2
        ) {
          nextSelected.add(node.id);
        }
      });

      const nextArray = Array.from(nextSelected);
      setSelectedAgents((prev) => {
        if (prev.length === nextArray.length && prev.every((id) => nextSelected.has(id))) {
          return prev;
        }
        return nextArray;
      });

      if (nextSelected.size === 1) {
        const [singleId] = nextArray;
        let candidateAgentId: string | null = null;
        if (singleId.startsWith("pipeline:")) {
          const pipelineNodeId = singleId.replace(/^pipeline:/, "");
          const pipelineNode = automationPipeline?.nodes.find((node) => node.id === pipelineNodeId);
          const configAgentId = (pipelineNode?.config as { agentId?: string } | undefined)?.agentId ?? null;
          if (configAgentId && !metaAgentIds.has(configAgentId)) {
            candidateAgentId = configAgentId;
          }
        } else if (!metaAgentIds.has(singleId)) {
          candidateAgentId = singleId;
        }
        if (candidateAgentId && agents.some((agent) => agent.id === candidateAgentId)) {
          selectAgent(candidateAgentId);
        } else {
          selectAgent(null);
        }
      } else {
        selectAgent(null);
      }
    },
    [agents, automationPipeline, reactFlowInstance, selectAgent],
  );

  const handleWrapperMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!lassoEnabled || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(".react-flow__node") ||
        target.closest(".react-flow__edge") ||
        target.closest(".react-flow__handle") ||
        target.closest(".react-flow__controls") ||
        target.closest(".react-flow__minimap")
      ) {
        return;
      }
      if (!reactFlowInstance || !flowWrapperRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const { left, top } = flowWrapperRef.current.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY };
      clearSelection();
      selectAgent(null);
      setLassoStart(start);
      setLassoRect({ left: start.x - left, top: start.y - top, width: 0, height: 0 });
      setLassoActive(true);
    },
    [clearSelection, lassoEnabled, reactFlowInstance, selectAgent],
  );

  const handleWrapperMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!lassoActive || !lassoStart || !reactFlowInstance || !flowWrapperRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const { left, top } = flowWrapperRef.current.getBoundingClientRect();
      const current = { x: event.clientX, y: event.clientY };
      const rect = {
        left: Math.min(lassoStart.x, current.x) - left,
        top: Math.min(lassoStart.y, current.y) - top,
        width: Math.abs(current.x - lassoStart.x),
        height: Math.abs(current.y - lassoStart.y),
      };
      setLassoRect(rect);
      const startFlow = reactFlowInstance.project({ x: lassoStart.x - left, y: lassoStart.y - top });
      const currentFlow = reactFlowInstance.project({ x: current.x - left, y: current.y - top });
      const bounds = {
        x1: Math.min(startFlow.x, currentFlow.x),
        x2: Math.max(startFlow.x, currentFlow.x),
        y1: Math.min(startFlow.y, currentFlow.y),
        y2: Math.max(startFlow.y, currentFlow.y),
      };
      updateSelectionFromBounds(bounds);
    },
    [lassoActive, lassoStart, reactFlowInstance, updateSelectionFromBounds],
  );

  const finalizeLasso = useCallback(() => {
    if (!lassoActive) return;
    setLassoActive(false);
    setLassoRect(null);
    setLassoStart(null);
  }, [lassoActive]);

  useEffect(() => {
    if (!lassoEnabled) {
      setLassoActive(false);
      setLassoRect(null);
      setLassoStart(null);
    }
  }, [lassoEnabled]);

  const handleWrapperMouseUp = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!lassoActive) return;
      event.preventDefault();
      event.stopPropagation();
      if (lassoStart && reactFlowInstance && flowWrapperRef.current) {
        const { left, top } = flowWrapperRef.current.getBoundingClientRect();
        const current = { x: event.clientX, y: event.clientY };
        const startFlow = reactFlowInstance.project({ x: lassoStart.x - left, y: lassoStart.y - top });
        const currentFlow = reactFlowInstance.project({ x: current.x - left, y: current.y - top });
        const bounds = {
          x1: Math.min(startFlow.x, currentFlow.x),
          x2: Math.max(startFlow.x, currentFlow.x),
          y1: Math.min(startFlow.y, currentFlow.y),
          y2: Math.max(startFlow.y, currentFlow.y),
        };
        updateSelectionFromBounds(bounds);
      }
      finalizeLasso();
    },
    [finalizeLasso, lassoActive, lassoStart, reactFlowInstance, updateSelectionFromBounds],
  );

  const handleWrapperMouseLeave = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!lassoActive) return;
      event.preventDefault();
      event.stopPropagation();
      if (lassoStart && reactFlowInstance && flowWrapperRef.current) {
        const { left, top } = flowWrapperRef.current.getBoundingClientRect();
        const current = { x: event.clientX, y: event.clientY };
        const startFlow = reactFlowInstance.project({ x: lassoStart.x - left, y: lassoStart.y - top });
        const currentFlow = reactFlowInstance.project({ x: current.x - left, y: current.y - top });
        const bounds = {
          x1: Math.min(startFlow.x, currentFlow.x),
          x2: Math.max(startFlow.x, currentFlow.x),
          y1: Math.min(startFlow.y, currentFlow.y),
          y2: Math.max(startFlow.y, currentFlow.y),
        };
        updateSelectionFromBounds(bounds);
      }
      finalizeLasso();
    },
    [finalizeLasso, lassoActive, lassoStart, reactFlowInstance, updateSelectionFromBounds],
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedAgents.length) return;
    const metaAgentIds = new Set(
      agents.filter((agent) => isMetaControllerAgent(agent)).map((agent) => agent.id),
    );

    const pipelineIdsToRemove = new Set<string>();
    const agentIdsToRemove = new Set<string>();

    selectedAgents.forEach((nodeId) => {
      if (nodeId.startsWith("pipeline:")) {
        pipelineIdsToRemove.add(nodeId.replace(/^pipeline:/, ""));
        return;
      }
      if (!metaAgentIds.has(nodeId) && agents.some((agent) => agent.id === nodeId)) {
        agentIdsToRemove.add(nodeId);
      }
    });

    if (automationPipeline) {
      automationPipeline.nodes.forEach((node) => {
        const agentId = (node.config as { agentId?: string } | undefined)?.agentId;
        if (agentId && agentIdsToRemove.has(agentId)) {
          pipelineIdsToRemove.add(node.id);
        }
      });
    }

    if (automationPipeline && pipelineIdsToRemove.size > 0) {
      const filteredNodes = automationPipeline.nodes.filter((node) => !pipelineIdsToRemove.has(node.id));
      const filteredEdges = automationPipeline.edges.filter(
        (edge) => !pipelineIdsToRemove.has(edge.from) && !pipelineIdsToRemove.has(edge.to),
      );
      setSharedPipeline(
        {
          ...automationPipeline,
          nodes: filteredNodes,
          edges: filteredEdges,
        },
        null,
      );
      setPositions((current) => {
        const next = { ...current };
        pipelineIdsToRemove.forEach((id) => {
          delete next[id];
          delete next[`pipeline:${id}`];
        });
        return next;
      });
      setPersistedEdges((current) =>
        current.filter(
          (edge) => !pipelineIdsToRemove.has(edge.source) && !pipelineIdsToRemove.has(edge.target),
        ),
      );
      setAutomationDirty(true);
    }

    if (agentIdsToRemove.size > 0) {
      for (const agentId of agentIdsToRemove) {
        try {
          await deleteAgentMutation.mutateAsync(agentId);
        } catch (error) {
          console.error("[automation-builder] failed to delete agent", error);
        }
      }
      setPositions((current) => {
        const next = { ...current };
        agentIdsToRemove.forEach((id) => {
          delete next[id];
          delete next[`pipeline:${id}`];
        });
        return next;
      });
      setPersistedEdges((current) =>
        current.filter((edge) => !agentIdsToRemove.has(edge.source) && !agentIdsToRemove.has(edge.target)),
      );
    }

    clearSelection();
    selectAgent(null);
  }, [
    agents,
    automationPipeline,
    clearSelection,
    deleteAgentMutation,
    selectAgent,
    selectedAgents,
    setAutomationDirty,
    setPersistedEdges,
    setPositions,
    setSharedPipeline,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedAgents.length > 0) {
        event.preventDefault();
        void handleDeleteSelected();
      }
      if (event.key === "Escape") {
        if (lassoActive || selectedAgents.length > 0) {
          event.preventDefault();
          clearSelection();
          selectAgent(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, handleDeleteSelected, lassoActive, selectAgent, selectedAgents.length]);

  const handleSelectAutomation = useCallback(
    async (value: string) => {
      await flushAutoSave();
      if (value === "__new") {
        await handleNewAutomation();
        return;
      }
      setAutomationListLoading(true);
      try {
        const automation = await loadAutomationById(value);
        if (automation) {
          setAutomations((existing) => {
            const index = existing.findIndex((entry) => entry.id === automation.id);
            if (index === -1) {
              return [...existing, automation];
            }
            const next = [...existing];
            next[index] = automation;
            return next;
          });
          applyAutomation(automation);
          setAutomationOpen(true);
          toast({ title: "Loaded automation", description: automation.name });
        } else {
          toast({
            title: "Automation not found",
            description: "The selected automation could not be loaded.",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Failed to load automation",
          description: error instanceof Error ? error.message : "Unknown error occurred.",
          variant: "destructive",
        });
      } finally {
        setAutomationListLoading(false);
      }
    },
    [applyAutomation, flushAutoSave, handleNewAutomation, setAutomationOpen, toast],
  );

  useEffect(() => {
    if (!selectedAutomationId || selectedAutomationId === "__new") {
      return;
    }
    if (autoSaveInFlightRef.current) {
      return;
    }
    const signature = computeAutomationSignature();
    if (signature === lastPersistedSignatureRef.current) {
      return;
    }
    setAutomationDirty(true);
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    console.log(`[automation-persist] Change detected — saving in ${AUTO_SAVE_DELAY / 1000}s…`);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      persistAutomationState(signature).catch((error) => {
        console.error("[automation-persist] auto-save failed", error);
      });
    }, AUTO_SAVE_DELAY);
  }, [computeAutomationSignature, persistAutomationState, selectedAutomationId]);

  const handleSaveAutomation = useCallback(async () => {
    await flushAutoSave();
    toast({
      title: "Automation saved",
      description: `${automationName.trim() || "Untitled Automation"} saved successfully.`,
    });
  }, [automationName, flushAutoSave, toast]);

  const updatePosition = useCallback((node: Node) => {
    const key = normalizePositionKey(node.id);
    setPositions((current) => {
      const previous = current[key];
      const nextPosition = { x: node.position.x, y: node.position.y };
      if (previous && previous.x === nextPosition.x && previous.y === nextPosition.y) {
        return current;
      }
      return { ...current, [key]: nextPosition };
    });
  }, []);

  const onNodeDrag = useCallback(
    (_event: any, node: Node) => {
      if (node.id === "start") return;
      updatePosition(node);
    },
    [updatePosition],
  );

  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      if (node.id === "start") return;
      updatePosition(node);
    },
    [updatePosition],
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
    selectAgent(null);
  }, [clearSelection, selectAgent]);

  const onMove = useCallback(() => {
    setShowMinimap(true);
  }, []);

  const blueprintSummary = useMemo(() => {
    const totalAgents = agents.length;
    const savedConnections = persistedEdges.length;
    const liveConnections = Object.values(graphLinks).length;
    return {
      totalAgents,
      savedConnections,
      liveConnections,
    };
  }, [agents.length, graphLinks, persistedEdges.length]);

  const lastSavedAt = useMemo(() => {
    if (!currentAutomation) return null;
    try {
      return new Date(currentAutomation.updatedAt).toLocaleString();
    } catch {
      return currentAutomation.updatedAt;
    }
  }, [currentAutomation]);

  const handleAutomationPromptSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = promptInput.trim();
      if (!text || isPromptSubmitting) {
        return;
      }
      setPromptSubmitting(true);
      setPromptStatus(null);
      try {
        const context: { pipeline?: AutomationPipeline; name?: string; description?: string } = {
          name: automationName,
          description: automationDescription,
        };
        if (automationPipeline) {
          context.pipeline = automationPipeline;
        }
        const response = await api.interpretAutomationPrompt(text, context);
        if (!response?.actions || response.actions.length === 0) {
          throw new Error(response?.message ?? "Could not understand prompt.");
        }
        const summary = await applyInstructionActions(response.actions);
        const interpretationMessage = response.message?.trim() ?? summary ?? "Automation updated.";
        setPromptStatus(interpretationMessage);
        setPromptInput("");
        // Respect the user's current automation drawer state instead of forcing it open.
        const normalizedTitle = interpretationMessage.startsWith("✅")
          ? interpretationMessage
          : `✅ ${interpretationMessage}`;
        const description =
          summary && summary !== interpretationMessage
            ? summary
            : response.message && response.message !== interpretationMessage
            ? response.message
            : undefined;
        toast({
          title: normalizedTitle,
          description,
        });
      } catch (error) {
        console.error("[automation-builder] prompt submission failed", error);
        const description = error instanceof Error ? error.message : "Unknown error occurred.";
        const failureMessage = "Could not understand prompt.";
        setPromptStatus(failureMessage);
        toast({
          title: "❌ Could not understand prompt.",
          description,
          variant: "destructive",
        });
      } finally {
        setPromptSubmitting(false);
      }
    },
    [
      applyInstructionActions,
      automationDescription,
      automationName,
      automationPipeline,
      isPromptSubmitting,
      promptInput,
      setAutomationOpen,
      toast,
    ],
  );

  return (
    <div className="h-screen w-full flex bg-[#0b0b0f]">
      <div
        ref={flowWrapperRef}
        className="flex-1 relative"
        onMouseDown={handleWrapperMouseDown}
        onMouseMove={handleWrapperMouseMove}
        onMouseUp={handleWrapperMouseUp}
        onMouseLeave={handleWrapperMouseLeave}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={onPaneClick}
          onMove={onMove}
      nodeTypes={nodeTypes}
      fitView
      className="bg-[#0b0b0f] dot-grid-background"
      onInit={setReactFlowInstance}
      panOnDrag={!lassoEnabled}
      selectionOnDrag={lassoEnabled}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#222"
            className="opacity-50"
          />
          <Controls className="bg-card/80 backdrop-blur-sm border border-border rounded-lg">
            <button
              type="button"
              title="Lasso select (toggle)"
              className={cn(
                "react-flow__controls-button hover:bg-primary/70",
                lassoEnabled ? "bg-primary text-primary-foreground" : "bg-transparent text-white/80",
              )}
              onClick={() => setLassoEnabled(true)}
            >
              <Pointer className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Pan mode (toggle)"
              className={cn(
                "react-flow__controls-button hover:bg-primary/70",
                !lassoEnabled ? "bg-primary text-primary-foreground" : "bg-transparent text-white/80",
              )}
              onClick={() => setLassoEnabled(false)}
            >
              <Hand className="h-4 w-4" />
            </button>
          </Controls>
          {showMinimap && (
            <MiniMap
              className="!bg-card/60 !backdrop-blur-sm border border-border/50 rounded-lg"
              maskColor="rgba(11, 11, 15, 0.6)"
              nodeColor={(node) => {
                if (node.type === "start") return "#10b981";
                return "#3b82f6";
              }}
            />
          )}
        </ReactFlow>

        {lassoRect ? (
          <div
            className="pointer-events-none absolute rounded-sm border border-sky-400/70 bg-sky-400/20"
            style={{
              left: lassoRect.left,
              top: lassoRect.top,
              width: lassoRect.width,
              height: lassoRect.height,
            }}
          />
        ) : null}

        {isPromptSubmitting && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-xl text-sm text-neutral-400 animate-pulse">
            Interpreting prompt...
          </div>
        )}

        <Card className="absolute left-1/2 top-6 z-30 w-[420px] -translate-x-1/2 bg-black/40 backdrop-blur border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => setAutomationOpen((prev) => !prev)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Workflow className="h-5 w-5 text-white/80" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Automation</Label>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-xs font-semibold text-white/80">
                    <span
                      className={cn(
                        "inline-flex h-2.5 w-2.5 rounded-full shadow-[0_0_8px]",
                        automationDirty
                          ? "bg-amber-400 shadow-amber-400/70"
                          : "bg-emerald-400 shadow-emerald-400/60",
                      )}
                    />
                    {automationDirty ? "Unsaved" : "Saved"}
                  </span>
                </div>
              </div>
              {isEditingName ? (
                <Input
                  autoFocus
                  value={automationName}
                  onChange={(event) => setAutomationName(event.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="Atlas launch playbook"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
              ) : (
                <button
                  type="button"
                  className="w-full text-sm font-medium text-white text-left hover:text-white/80"
                  onClick={() => setIsEditingName(true)}
                >
                  {automationName.trim() || "Name your automation"}
                </button>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-white/70 transition-transform duration-300",
                automationOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
          {automationOpen && (
            <div className="space-y-4 border-t border-white/10 px-5 py-4">
              {automationError ? (
                <div className="rounded-lg border border-red-400/40 bg-red-900/20 px-3 py-2 text-xs text-red-200">
                  {automationError}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Load existing</Label>
                <Select
                  value={selectedAutomationId}
                  onValueChange={handleSelectAutomation}
                  disabled={isAutomationListLoading || isPersistingAutomation}
                >
                  <SelectTrigger className="border-white/10 bg-white/5 text-white">
                    <SelectValue
                      placeholder={automations.length ? "Select automation" : "No automations saved yet"}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-black/80 backdrop-blur border-white/10 text-white">
                    {automations.map((automation) => (
                      <SelectItem key={automation.id} value={automation.id}>
                        {automation.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new">New automation…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Name</Label>
                <Input
                  value={automationName}
                  onChange={(event) => setAutomationName(event.target.value)}
                  placeholder="Atlas launch playbook"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Description</Label>
                <Textarea
                  value={automationDescription}
                  onChange={(event) => setAutomationDescription(event.target.value)}
                  placeholder="High-level goal or context for this automation"
                  className="min-h-[72px] border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Blueprint Snapshot</Label>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Agents mapped</span>
                    <span className="font-semibold text-white">{blueprintSummary.totalAgents}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Saved connections</span>
                    <span className="font-semibold text-white">{blueprintSummary.savedConnections}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Live connections</span>
                    <span className="font-semibold text-white">{blueprintSummary.liveConnections}</span>
                  </div>
                  {lastSavedAt ? (
                    <div className="flex items-center justify-between text-white/60">
                      <span>Last saved</span>
                      <span>{lastSavedAt}</span>
                    </div>
                  ) : (
                    <div className="text-white/60">Not saved yet.</div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  className="text-white/70 hover:bg-white/10"
                  onClick={() => setAutomationOpen(false)}
                >
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    className="text-white"
                    onClick={handleDeleteAutomation}
                    disabled={isPersistingAutomation || isAutomationListLoading || isDeletingAutomation}
                  >
                    {isDeletingAutomation ? "Deleting…" : "Delete"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                    onClick={handleNewAutomation}
                    disabled={isPersistingAutomation || isAutomationListLoading}
                  >
                    {isPersistingAutomation ? "Working…" : "New"}
                  </Button>
                  <Button
                    className="bg-white/10 hover:bg-white/20 text-white"
                    disabled={isPersistingAutomation || isAutomationListLoading}
                    onClick={handleSaveAutomation}
                  >
                    {isPersistingAutomation ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Button
          onClick={() => setCreateOpen(true)}
          disabled={isLoading}
          className="absolute top-6 right-6 rounded-full h-11 px-6 bg-primary/90 hover:bg-primary text-primary-foreground shadow-lg backdrop-blur-sm border border-white/10"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>

        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 justify-center px-6">
          <form
            onSubmit={handleAutomationPromptSubmit}
            className="pointer-events-auto flex w-full min-w-[320px] max-w-[680px] flex-col items-center gap-2"
          >
            <div className="flex w-full items-center gap-3 rounded-full border border-white/20 bg-black/60 px-4 py-2.5 text-sm text-white/80 backdrop-blur-lg shadow-lg">
              <input
                value={promptInput}
                onChange={(event) => setPromptInput(event.target.value)}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                placeholder="Type in a change you’d like to see…"
                disabled={isPromptSubmitting}
              />
              <Button
                type="submit"
                size="icon"
                className="h-9 w-9 rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20"
                disabled={isPromptSubmitting || promptInput.trim().length === 0}
              >
                {isPromptSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            {promptStatus && !promptStatus.toLowerCase().startsWith("awaiting_key") ? (
              <span className="text-xs text-white/60">{promptStatus}</span>
            ) : null}
          </form>
        </div>
      </div>

      <div
        className={cn(
          "relative flex-shrink-0 overflow-hidden transition-all duration-500 ease-out",
          selectedAgent ? "w-[400px] max-w-[400px]" : "w-0 max-w-0 pointer-events-none"
        )}
      >
        <div
          className={cn(
            "h-full transform transition-transform duration-500 ease-out",
            selectedAgent ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
          )}
        >
          {selectedAgent && (
            <ConfigPanel
              agent={selectedAgent}
              onDelete={(id) => deleteAgentMutation.mutateAsync(id)}
              onUpdate={(id, updates) => updateAgentMutation.mutateAsync({ id, updates })}
              isDeleting={deleteAgentMutation.isPending}
              isSaving={updateAgentMutation.isPending}
            />
          )}
        </div>
      </div>

      <CreateAgentDrawer
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreateManual={async (payload) => {
          await createAgentMutation.mutateAsync(payload);
        }}
        onGenerateFromPrompt={async (prompt, options) => {
          const result = await api.buildAgentFromPrompt(prompt, options);
          toast({ title: "Agent generated", description: result.spec.name });
          queryClient.invalidateQueries({ queryKey: ["agents"] });
          return result;
        }}
      />
    </div>
  );
}
