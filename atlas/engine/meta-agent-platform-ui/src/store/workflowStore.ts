import { create } from 'zustand';
import type { WorkflowPlan, WorkflowRecord } from '@/types/api';

interface WorkflowStore {
  lastPrompt: string | null;
  draftPlan: WorkflowPlan | null;
  selectedWorkflow: WorkflowRecord | null;
  setPrompt: (prompt: string | null) => void;
  setPlan: (plan: WorkflowPlan | null) => void;
  setSelectedWorkflow: (workflow: WorkflowRecord | null) => void;
}

// Holds the latest compiled workflow plan and selection state for the Agent Network page.
export const useWorkflowStore = create<WorkflowStore>((set) => ({
  lastPrompt: null,
  draftPlan: null,
  selectedWorkflow: null,
  setPrompt: (prompt) => set({ lastPrompt: prompt }),
  setPlan: (plan) => set({ draftPlan: plan }),
  setSelectedWorkflow: (workflow) => set({ selectedWorkflow: workflow }),
}));
