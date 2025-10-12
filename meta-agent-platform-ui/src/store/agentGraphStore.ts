import { create } from "zustand";
import type {
  AgentGraphLinkSnapshot,
  AgentGraphNodeSnapshot,
  AgentGraphSnapshot,
  AgentMessageEvent,
  AgentStateChangeEvent,
} from "@/types/api";

interface GraphAgent extends AgentGraphNodeSnapshot {}
interface GraphLink extends AgentGraphLinkSnapshot {}

interface AgentGraphState {
  agents: Record<string, GraphAgent>;
  links: Record<string, GraphLink>;
  lastMessage?: AgentMessageEvent;
  updateGraph: (snapshot: AgentGraphSnapshot) => void;
  updateState: (update: AgentStateChangeEvent) => void;
  pushMessage: (message: AgentMessageEvent) => void;
  clear: () => void;
}

export const useAgentGraphStore = create<AgentGraphState>((set) => ({
  agents: {},
  links: {},
  lastMessage: undefined,
  updateGraph: (snapshot) =>
    set(() => ({
      agents: Object.fromEntries(snapshot.agents.map((agent) => [agent.id, agent])),
      links: Object.fromEntries(snapshot.links.map((link) => [link.id, link])),
    })),
  updateState: (update) =>
    set((state) => {
      const currentAgent = state.agents[update.agentId];
      const nextAgents = { ...state.agents };
      if (currentAgent && typeof update.isTalking === "boolean") {
        nextAgents[update.agentId] = { ...currentAgent, isTalking: update.isTalking };
      }

      const nextLinks = { ...state.links };
      if (update.linkActivity) {
        const linkId = `${update.agentId}::${update.linkActivity.targetId}`;
        const existing = nextLinks[linkId] ?? {
          id: linkId,
          source: update.agentId,
          target: update.linkActivity.targetId,
          isActive: false,
        };
        nextLinks[linkId] = {
          ...existing,
          isActive: update.linkActivity.isActive,
          lastMessageId: update.linkActivity.messageId ?? existing.lastMessageId,
        };
      }

      return {
        agents: nextAgents,
        links: nextLinks,
        lastMessage: update.message ?? state.lastMessage,
      };
    }),
  pushMessage: (message) => set(() => ({ lastMessage: message })),
  clear: () => set({ agents: {}, links: {}, lastMessage: undefined }),
}));

