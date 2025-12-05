import { create } from "zustand";
import type { AutomationPipeline } from "@/types/api";

interface AutomationPipelineState {
  pipeline: AutomationPipeline | null;
  sessionId: string | null;
  setPipeline: (pipeline: AutomationPipeline, sessionId?: string | null) => void;
  clear: () => void;
}

function clonePipeline(pipeline: AutomationPipeline): AutomationPipeline {
  return JSON.parse(JSON.stringify(pipeline)) as AutomationPipeline;
}

export const useAutomationPipelineStore = create<AutomationPipelineState>((set) => ({
  pipeline: null,
  sessionId: null,
  setPipeline: (pipeline, sessionId) =>
    set({
      pipeline: clonePipeline(pipeline),
      sessionId: sessionId ?? null,
    }),
  clear: () =>
    set({
      pipeline: null,
      sessionId: null,
    }),
}));
