import { create } from "zustand";
import { api } from "@/lib/api";
import type { AtlasConnectorRecord, MarketplaceConnectorRecord } from "@/types/api";

export interface Connector {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  icon: string;
  publisher: string;
  publisherType: string;
  category: string;
  version: string;
  verified: boolean;
  installed: boolean;
  isDraft: boolean;
  hasUpdate: boolean;
  downloads: number;
  lastUpdated: string;
  actions: ConnectorAction[];
  triggers: ConnectorTrigger[];
  authType: "oauth2" | "api_key" | "basic" | "bearer";
  permissions: string[];
  changelog: string[];
  openSource: boolean;
  status?: "draft" | "installed" | "published" | "marketplace";
  backendId?: string;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  fields: ConnectorField[];
}

export interface ConnectorTrigger {
  id: string;
  name: string;
  description: string;
  event: string;
}

export interface ConnectorField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface AIGeneratorState {
  step: number;
  prompt: string;
  extractedGoals: {
    platform: string;
    actions: string[];
    fields: string[];
    authType: string;
  } | null;
  draftConnector: Partial<Connector> | null;
  testResults: any[];
}

interface ConnectorStore {
  connectors: Connector[];
  selectedConnector: Connector | null;
  aiGenerator: AIGeneratorState;
  searchQuery: string;
  filters: {
    category: string | null;
    publisher: string | null;
    verified: boolean;
  };
  sortBy: "popular" | "recent" | "verified" | "community";

  setConnectors: (connectors: Connector[]) => void;
  selectConnector: (connector: Connector | null) => void;
  installConnector: (id: string) => Promise<void>;
  uninstallConnector: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<ConnectorStore["filters"]>) => void;
  setSortBy: (sort: ConnectorStore["sortBy"]) => void;
  loadConnectors: () => Promise<void>;

  // AI Generator
  setAIStep: (step: number) => void;
  setAIPrompt: (prompt: string) => void;
  setExtractedGoals: (goals: AIGeneratorState["extractedGoals"]) => void;
  setDraftConnector: (connector: Partial<Connector> | null) => void;
  addTestResult: (result: any) => void;
  resetAIGenerator: () => void;

  getFilteredConnectors: () => Connector[];
  getInstalledConnectors: () => Connector[];
  getDraftConnectors: () => Connector[];
  getConnectorsWithUpdates: () => Connector[];
}

const initialAIState: AIGeneratorState = {
  step: 1,
  prompt: "",
  extractedGoals: null,
  draftConnector: null,
  testResults: [],
};

function mapAction(id: string, action: any): ConnectorAction {
  return {
    id,
    name: action?.name || id,
    description: action?.description || action?.path || "",
    endpoint: action?.path || "",
    method: (action?.method as ConnectorAction["method"]) || "GET",
    fields: Object.entries((action?.body as Record<string, any>) || {}).map(([name, value]) => ({
      name,
      type: typeof value,
      required: true,
      description: "",
    })),
  };
}

function mapTrigger(id: string, trigger: any): ConnectorTrigger {
  return {
    id,
    name: trigger?.name || id,
    description: trigger?.description || "",
    event: trigger?.type || "event",
  };
}

function mapPackageToConnector(pkg: AtlasConnectorRecord, status?: Connector["status"]): Connector {
  const lastUpdated = pkg.updatedAt ? new Date(pkg.updatedAt).toISOString().split("T")[0] : "";
  const actions = Object.entries(pkg.actions || {}).map(([id, action]) => mapAction(id, action));
  const triggers = Object.entries(pkg.triggers || {}).map(([id, trigger]) => mapTrigger(id, trigger));

  return {
    id: pkg.id,
    backendId: pkg.id,
    name: pkg.manifest?.name || pkg.id,
    description: pkg.manifest?.description || "",
    shortDescription: pkg.manifest?.description || "",
    icon: pkg.manifest?.icon || "🧩",
    publisher: pkg.manifest?.publisher || "atlas",
    publisherType: "atlas",
    category: pkg.manifest?.category || "custom",
    version: pkg.manifest?.version || "0.0.0",
    verified: Boolean(pkg.verified),
    installed: status === "installed",
    isDraft: status === "draft",
    hasUpdate: false,
    downloads: pkg.downloadCount ?? 0,
    lastUpdated,
    actions,
    triggers,
    authType: (pkg.manifest?.auth?.type as Connector["authType"]) || "oauth2",
    permissions: [],
    changelog: [],
    openSource: false,
    status: status ?? pkg.status,
  };
}

function mapMarketplaceConnector(
  connector: MarketplaceConnectorRecord,
  installedLookup: Map<string, Connector>,
): Connector {
  const key = connector.name.toLowerCase();
  const existing = installedLookup.get(key);
  if (existing) {
    return { ...existing, downloads: connector.downloadCount ?? existing.downloads };
  }

  return {
    id: connector.id,
    backendId: connector.id,
    name: connector.name,
    description: connector.description || "",
    shortDescription: connector.description || "",
    icon: connector.icon || "🧩",
    publisher: connector.publisher || "community",
    publisherType: "community",
    category: connector.category || "custom",
    version: connector.version || "0.0.0",
    verified: Boolean(connector.verified),
    installed: false,
    isDraft: false,
    hasUpdate: false,
    downloads: connector.downloadCount ?? 0,
    lastUpdated: "",
    actions: [],
    triggers: [],
    authType: "oauth2",
    permissions: [],
    changelog: [],
    openSource: false,
    status: "marketplace",
  };
}

export const useConnectorStore = create<ConnectorStore>((set, get) => ({
  connectors: [],
  selectedConnector: null,
  aiGenerator: initialAIState,
  searchQuery: "",
  filters: {
    category: null,
    publisher: null,
    verified: false,
  },
  sortBy: "popular",

  setConnectors: (connectors) => set({ connectors }),

  selectConnector: (connector) => set({ selectedConnector: connector }),

  installConnector: async (id) => {
    try {
      const installed = await api.installConnector(id);
      const mapped = mapPackageToConnector(installed, "installed");
      set((state) => {
        const existing = state.connectors.filter((c) => c.name.toLowerCase() !== mapped.name.toLowerCase());
        return { connectors: [...existing, mapped] };
      });
    } catch (error) {
      console.error("Failed to install connector", error);
    }
  },

  uninstallConnector: (id) =>
    set((state) => ({
      connectors: state.connectors.map((c) => (c.id === id ? { ...c, installed: false } : c)),
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  setSortBy: (sortBy) => set({ sortBy }),

  loadConnectors: async () => {
    try {
      const [installed, drafts, marketplace] = await Promise.all([
        api.listInstalledConnectors(),
        api.listDraftConnectors(),
        api.listMarketplaceConnectors(),
      ]);

      const installedMapped = installed.map((pkg) => mapPackageToConnector(pkg, "installed"));
      const draftsMapped = drafts.map((pkg) => mapPackageToConnector(pkg, "draft"));

      const lookup = new Map<string, Connector>();
      [...installedMapped, ...draftsMapped].forEach((c) => lookup.set(c.name.toLowerCase(), c));

      const marketplaceMapped = marketplace.map((m) => mapMarketplaceConnector(m, lookup));
      const combined = [...lookup.values()];

      marketplaceMapped.forEach((c) => {
        const key = c.name.toLowerCase();
        if (!lookup.has(key)) {
          combined.push(c);
        }
      });

      set({ connectors: combined });
    } catch (error) {
      console.error("Failed to load connectors", error);
      set({ connectors: [] });
    }
  },

  setAIStep: (step) =>
    set((state) => ({
      aiGenerator: { ...state.aiGenerator, step },
    })),

  setAIPrompt: (prompt) =>
    set((state) => ({
      aiGenerator: { ...state.aiGenerator, prompt },
    })),

  setExtractedGoals: (goals) =>
    set((state) => ({
      aiGenerator: { ...state.aiGenerator, extractedGoals: goals },
    })),

  setDraftConnector: (connector) =>
    set((state) => ({
      aiGenerator: { ...state.aiGenerator, draftConnector: connector },
    })),

  addTestResult: (result) =>
    set((state) => ({
      aiGenerator: {
        ...state.aiGenerator,
        testResults: [...state.aiGenerator.testResults, result],
      },
    })),

  resetAIGenerator: () => set({ aiGenerator: initialAIState }),

  getFilteredConnectors: () => {
    const { connectors, searchQuery, filters, sortBy } = get();
    let filtered = connectors.filter((c) => !c.isDraft);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    }

    if (filters.category) {
      filtered = filtered.filter((c) => c.category === filters.category);
    }

    if (filters.publisher) {
      filtered = filtered.filter((c) => c.publisherType === filters.publisher);
    }

    if (filters.verified) {
      filtered = filtered.filter((c) => c.verified);
    }

    switch (sortBy) {
      case "popular":
        filtered.sort((a, b) => b.downloads - a.downloads);
        break;
      case "recent":
        filtered.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        break;
      case "verified":
        filtered.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));
        break;
      case "community":
        filtered = filtered.filter((c) => c.publisherType === "community");
        break;
    }

    return filtered;
  },

  getInstalledConnectors: () => {
    return get().connectors.filter((c) => c.installed && !c.isDraft);
  },

  getDraftConnectors: () => {
    return get().connectors.filter((c) => c.isDraft);
  },

  getConnectorsWithUpdates: () => {
    return get().connectors.filter((c) => c.installed && c.hasUpdate);
  },
}));
