import { create } from "zustand";
import type { TokenUsageSnapshot } from "@/types/api";

const STORAGE_KEY = "atlas-token-usage";

const loadSnapshot = (): TokenUsageSnapshot & { lastUpdated: string | null } => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { total: 0, byAgent: {}, lastUpdated: null };
    const parsed = JSON.parse(raw);
    return {
      total: Number(parsed.total) || 0,
      byAgent: parsed.byAgent || {},
      lastUpdated: typeof parsed.lastUpdated === "string" ? parsed.lastUpdated : null,
    };
  } catch {
    return { total: 0, byAgent: {}, lastUpdated: null };
  }
};

const persistSnapshot = (snapshot: TokenUsageSnapshot & { lastUpdated: string | null }) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
};

interface TokenStoreState {
  totalTokens: number;
  tokensByAgent: Record<string, number>;
  lastUpdated: string | null;
  setUsage: (snapshot: TokenUsageSnapshot) => void;
  reset: () => void;
}

export const useTokenStore = create<TokenStoreState>((set) => {
  const cached = loadSnapshot();
  return {
    totalTokens: Math.max(0, Math.floor(cached.total)),
    tokensByAgent: { ...cached.byAgent },
    lastUpdated: cached.lastUpdated,
    setUsage: (snapshot) =>
      set(() => {
        const next = {
          totalTokens: Math.max(0, Math.floor(snapshot.total)),
          tokensByAgent: { ...snapshot.byAgent },
          lastUpdated: new Date().toISOString(),
        };
        persistSnapshot({ total: next.totalTokens, byAgent: next.tokensByAgent, lastUpdated: next.lastUpdated });
        return next;
      }),
    reset: () =>
      set(() => {
        persistSnapshot({ total: 0, byAgent: {}, lastUpdated: null });
        return {
          totalTokens: 0,
          tokensByAgent: {},
          lastUpdated: null,
        };
      }),
  };
});
