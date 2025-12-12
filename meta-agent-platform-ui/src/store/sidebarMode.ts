import { create } from "zustand";

interface SidebarModeState {
  historyMode: boolean;
  conversationToLoad: string | null;
  setHistoryMode: (value: boolean) => void;
  requestConversationLoad: (id: string) => void;
  clearConversationRequest: () => void;
}

export const useSidebarModeStore = create<SidebarModeState>((set) => ({
  historyMode: false,
  conversationToLoad: null,
  setHistoryMode: (value) => set({ historyMode: value }),
  requestConversationLoad: (id) => set({ conversationToLoad: id, historyMode: false }),
  clearConversationRequest: () => set({ conversationToLoad: null }),
}));
