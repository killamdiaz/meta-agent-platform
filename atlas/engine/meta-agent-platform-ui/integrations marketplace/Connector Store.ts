import { create } from 'zustand';

export interface Connector {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  icon: string;
  publisher: string;
  publisherType: 'atlas' | 'community' | 'organization';
  category: 'security' | 'itsm' | 'devops' | 'monitoring' | 'hr' | 'custom';
  version: string;
  verified: boolean;
  installed: boolean;
  isDraft: boolean;
  hasUpdate: boolean;
  downloads: number;
  lastUpdated: string;
  actions: ConnectorAction[];
  triggers: ConnectorTrigger[];
  authType: 'oauth2' | 'api_key' | 'basic' | 'bearer';
  permissions: string[];
  changelog: string[];
  openSource: boolean;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
  sortBy: 'popular' | 'recent' | 'verified' | 'community';
  
  setConnectors: (connectors: Connector[]) => void;
  selectConnector: (connector: Connector | null) => void;
  installConnector: (id: string) => void;
  uninstallConnector: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<ConnectorStore['filters']>) => void;
  setSortBy: (sort: ConnectorStore['sortBy']) => void;
  
  // AI Generator
  setAIStep: (step: number) => void;
  setAIPrompt: (prompt: string) => void;
  setExtractedGoals: (goals: AIGeneratorState['extractedGoals']) => void;
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
  prompt: '',
  extractedGoals: null,
  draftConnector: null,
  testResults: [],
};

export const useConnectorStore = create<ConnectorStore>((set, get) => ({
  connectors: [],
  selectedConnector: null,
  aiGenerator: initialAIState,
  searchQuery: '',
  filters: {
    category: null,
    publisher: null,
    verified: false,
  },
  sortBy: 'popular',

  setConnectors: (connectors) => set({ connectors }),
  
  selectConnector: (connector) => set({ selectedConnector: connector }),
  
  installConnector: (id) => set((state) => ({
    connectors: state.connectors.map((c) =>
      c.id === id ? { ...c, installed: true } : c
    ),
  })),
  
  uninstallConnector: (id) => set((state) => ({
    connectors: state.connectors.map((c) =>
      c.id === id ? { ...c, installed: false } : c
    ),
  })),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters },
  })),
  
  setSortBy: (sortBy) => set({ sortBy }),
  
  setAIStep: (step) => set((state) => ({
    aiGenerator: { ...state.aiGenerator, step },
  })),
  
  setAIPrompt: (prompt) => set((state) => ({
    aiGenerator: { ...state.aiGenerator, prompt },
  })),
  
  setExtractedGoals: (goals) => set((state) => ({
    aiGenerator: { ...state.aiGenerator, extractedGoals: goals },
  })),
  
  setDraftConnector: (connector) => set((state) => ({
    aiGenerator: { ...state.aiGenerator, draftConnector: connector },
  })),
  
  addTestResult: (result) => set((state) => ({
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
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
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
      case 'popular':
        filtered.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'recent':
        filtered.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        break;
      case 'verified':
        filtered.sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));
        break;
      case 'community':
        filtered = filtered.filter((c) => c.publisherType === 'community');
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
