import { useCallback, useEffect, useMemo, useState } from "react";

type HistoryRole = "user" | "assistant" | "system";

export interface HistoryMessage {
  messageId: string;
  role: HistoryRole;
  content: string;
  agentId?: string | null;
  agentName?: string | null;
  status?: string | null;
  taskId?: string | null;
  createdAt?: string;
}

export interface HistorySession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: HistoryMessage[];
}

interface CommandHistoryState {
  sessions: HistorySession[];
  currentSessionId: string | null;
}

const STORAGE_KEY = "atlas:command-console:sessions";
const CURRENT_SESSION_KEY = "atlas:command-console:current-session";

const isBrowser = typeof window !== "undefined";

const createSessionTitle = () => {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Conversation ${time}`;
};

const createEmptySession = (): HistorySession => {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: createSessionTitle(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
};

const deriveTitleFromMessages = (messages: HistoryMessage[], fallback: string) => {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim().length > 0);
  if (!firstUserMessage) {
    return fallback;
  }
  const text = firstUserMessage.content.trim();
  if (text.length <= 60) {
    return text;
  }
  return `${text.slice(0, 57)}…`;
};

export function useCommandHistory() {
  const [state, setState] = useState<CommandHistoryState>(() => {
    if (!isBrowser) {
      const session = createEmptySession();
      return { sessions: [session], currentSessionId: session.id };
    }

    try {
      const storedSessions = window.localStorage.getItem(STORAGE_KEY);
      const storedCurrent = window.localStorage.getItem(CURRENT_SESSION_KEY);
      if (storedSessions) {
        const parsed = JSON.parse(storedSessions) as HistorySession[];
        const normalised = Array.isArray(parsed) && parsed.length > 0 ? parsed : [createEmptySession()];
        const currentCandidate =
          normalised.find((session) => session.id === storedCurrent)?.id ?? normalised[0]?.id ?? null;
        return { sessions: normalised, currentSessionId: currentCandidate };
      }
    } catch (error) {
      console.warn("[command-history] failed to hydrate history", error);
    }

    const session = createEmptySession();
    return { sessions: [session], currentSessionId: session.id };
  });

  const { sessions, currentSessionId } = state;

  useEffect(() => {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.warn("[command-history] failed to persist sessions", error);
    }
  }, [sessions]);

  useEffect(() => {
    if (!isBrowser) return;
    try {
      if (currentSessionId) {
        window.localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
      } else {
        window.localStorage.removeItem(CURRENT_SESSION_KEY);
      }
    } catch (error) {
      console.warn("[command-history] failed to persist current session id", error);
    }
  }, [currentSessionId]);

  const createSession = useCallback(() => {
    const session = createEmptySession();
    setState((previous) => ({
      sessions: [...previous.sessions, session],
      currentSessionId: session.id,
    }));
    return session.id;
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    setState((previous) => {
      if (previous.currentSessionId === sessionId) {
        return previous;
      }
      const exists = previous.sessions.some((session) => session.id === sessionId);
      if (!exists) {
        return previous;
      }
      return { ...previous, currentSessionId: sessionId };
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setState((previous) => {
      const remaining = previous.sessions.filter((session) => session.id !== sessionId);
      if (remaining.length === 0) {
        const replacement = createEmptySession();
        return { sessions: [replacement], currentSessionId: replacement.id };
      }
      const nextCurrent =
        previous.currentSessionId === sessionId ? remaining[remaining.length - 1].id : previous.currentSessionId;
      return { sessions: remaining, currentSessionId: nextCurrent };
    });
  }, []);

  const updateSessionMessages = useCallback((sessionId: string, messages: HistoryMessage[]) => {
    setState((previous) => {
      const updatedSessions = previous.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const now = new Date().toISOString();
        return {
          ...session,
          messages,
          updatedAt: now,
          title: deriveTitleFromMessages(messages, session.title ?? createSessionTitle()),
        };
      });
      return { sessions: updatedSessions, currentSessionId: previous.currentSessionId };
    });
  }, []);

  const value = useMemo(
    () => ({
      sessions,
      currentSessionId,
      createSession,
      selectSession,
      deleteSession,
      updateSessionMessages,
    }),
    [sessions, currentSessionId, createSession, selectSession, deleteSession, updateSessionMessages],
  );

  return value;
}

export default useCommandHistory;
