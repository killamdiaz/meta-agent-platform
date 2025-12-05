import { create } from "zustand";
import type { TokenUsageSnapshot } from "@/types/api";

interface TokenStoreState {
  totalTokens: number;
  tokensByAgent: Record<string, number>;
  lastUpdated: string | null;
  setUsage: (snapshot: TokenUsageSnapshot) => void;
  reset: () => void;
}

export const useTokenStore = create<TokenStoreState>((set) => ({
  totalTokens: 0,
  tokensByAgent: {},
  lastUpdated: null,
  setUsage: (snapshot) =>
    set({
      totalTokens: Math.max(0, Math.floor(snapshot.total)),
      tokensByAgent: { ...snapshot.byAgent },
      lastUpdated: new Date().toISOString(),
    }),
  reset: () =>
    set({
      totalTokens: 0,
      tokensByAgent: {},
      lastUpdated: null,
    }),
}));

