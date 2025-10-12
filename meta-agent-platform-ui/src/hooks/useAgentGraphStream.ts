import { useEffect, useRef } from "react";
import { apiBaseUrl } from "@/lib/api";
import { useAgentGraphStore } from "@/store/agentGraphStore";
import type {
  AgentGraphSnapshot,
  AgentMessageEvent,
  AgentStateChangeEvent,
} from "@/types/api";

export function useAgentGraphStream(enabled: boolean) {
  const updateGraph = useAgentGraphStore((state) => state.updateGraph);
  const updateState = useAgentGraphStore((state) => state.updateState);
  const pushMessage = useAgentGraphStore((state) => state.pushMessage);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const url = `${apiBaseUrl}/multi-agent/events`;
    const source = new EventSource(url);
    eventSourceRef.current = source;

    const handleGraph = (event: MessageEvent) => {
      try {
        const snapshot = JSON.parse(event.data) as AgentGraphSnapshot;
        updateGraph(snapshot);
      } catch (error) {
        console.error("[agent-graph] failed to parse graph", error);
      }
    };

    const handleState = (event: MessageEvent) => {
      try {
        const update = JSON.parse(event.data) as AgentStateChangeEvent;
        updateState(update);
      } catch (error) {
        console.error("[agent-graph] failed to parse state", error);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as AgentMessageEvent;
        pushMessage(message);
      } catch (error) {
        console.error("[agent-graph] failed to parse message", error);
      }
    };

    source.addEventListener("graph", handleGraph);
    source.addEventListener("state", handleState);
    source.addEventListener("message", handleMessage);

    source.onerror = (error) => {
      console.error("[agent-graph] stream error", error);
      source.close();
      eventSourceRef.current = null;
    };

    return () => {
      source.removeEventListener("graph", handleGraph as EventListener);
      source.removeEventListener("state", handleState as EventListener);
      source.removeEventListener("message", handleMessage as EventListener);
      source.close();
      eventSourceRef.current = null;
    };
  }, [enabled, pushMessage, updateGraph, updateState]);
}

export default useAgentGraphStream;

