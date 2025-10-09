import { useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from 'react-query';
import AgentsPanel from './components/AgentsPanel';
import TasksPanel from './components/TasksPanel';
import MemoryPanel from './components/MemoryPanel';
import CreateAgentModal from './components/CreateAgentModal';
import CommandConsole from './components/CommandConsole';
import api from './api/client';
import { Agent, BuildAgentResult, CommandResponse, MemoryEntry } from './types';

const queryClient = new QueryClient();

function Dashboard() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [memoryAgent, setMemoryAgent] = useState<Agent | null>(null);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);

  const agentsQuery = useQuery(['agents'], async () => {
    const response = await api.listAgents();
    return response.items;
  }, {
    refetchInterval: 5000
  });

  const tasksQuery = useQuery(['tasks'], async () => {
    const response = await api.listTasks();
    return response.items;
  }, {
    refetchInterval: 5000
  });

  const createAgentMutation = useMutation(
    (payload: {
      name: string;
      role: string;
      tools: Record<string, boolean>;
      objectives: string[];
      internet_access_enabled?: boolean;
    }) => api.createAgent(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['agents']);
      }
    }
  );

  const buildAgentMutation = useMutation(
    (payload: { promptText: string; persist?: boolean; spawn?: boolean }) =>
      api.buildAgentFromPrompt({ creator: 'dashboard-ui', ...payload }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['agents']);
      }
    }
  );

  const enqueueTaskMutation = useMutation(
    ({ agentId, prompt }: { agentId: string; prompt: string }) => api.enqueueTask(agentId, prompt),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['tasks']);
        queryClient.invalidateQueries(['agents']);
      }
    }
  );

  const updateStatusMutation = useMutation(
    ({ agentId, status }: { agentId: string; status: Agent['status'] }) => api.updateAgentStatus(agentId, status),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['agents']);
      }
    }
  );

  const runCommandMutation = useMutation<CommandResponse, Error, string>((input) => api.runCommand(input), {
    onSuccess: () => {
      queryClient.invalidateQueries(['agents']);
      queryClient.invalidateQueries(['tasks']);
    }
  });

  const handleCreateAgent = async (payload: {
    name: string;
    role: string;
    tools: Record<string, boolean>;
    objectives: string[];
    internet_access_enabled?: boolean;
  }) => {
    await createAgentMutation.mutateAsync(payload);
  };

  const handleGenerateAgent = async (
    payload: { promptText: string; persist?: boolean; spawn?: boolean }
  ): Promise<BuildAgentResult> => {
    const result = await buildAgentMutation.mutateAsync(payload);
    return result;
  };

  const handleStartAgent = (agent: Agent) => {
    enqueueTaskMutation.mutate({ agentId: agent.id, prompt: `Kick off orchestration for ${agent.name}` });
  };

  const handlePauseAgent = (agent: Agent) => {
    updateStatusMutation.mutate({ agentId: agent.id, status: 'idle' });
  };

  const handleViewMemory = async (agent: Agent) => {
    setMemoryAgent(agent);
    const response = await api.listMemory(agent.id);
    setMemoryEntries(response.items);
  };

  const handleRunCommand = async (command: string): Promise<CommandResponse> => {
    const result = await runCommandMutation.mutateAsync(command);
    return result;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Cortex Agent Runtime</h1>
            <p className="text-slate-400">Create, orchestrate, and monitor thousands of modular agents.</p>
          </div>
          <div className="flex gap-3 text-sm text-slate-300">
            <span className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/70">
              Agents: {agentsQuery.data?.length ?? 0}
            </span>
            <span className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-900/70">
              Tasks: {tasksQuery.data?.length ?? 0}
            </span>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <AgentsPanel
              agents={agentsQuery.data ?? []}
              onStart={handleStartAgent}
              onPause={handlePauseAgent}
              onViewMemory={handleViewMemory}
              onCreate={() => setCreateModalOpen(true)}
            />
            <TasksPanel tasks={tasksQuery.data ?? []} />
          </div>
          <div className="space-y-6">
            <MemoryPanel agentName={memoryAgent?.name} memories={memoryEntries} />
            <CommandConsole onSubmit={handleRunCommand} />
          </div>
        </div>
      </div>

      <CreateAgentModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreateManual={handleCreateAgent}
        onGenerateFromPrompt={handleGenerateAgent}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
