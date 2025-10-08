import { Agent } from '../types';
import AgentCard from './AgentCard';

interface AgentsPanelProps {
  agents: Agent[];
  onStart: (agent: Agent) => void;
  onPause: (agent: Agent) => void;
  onViewMemory: (agent: Agent) => void;
  onCreate: () => void;
}

export function AgentsPanel({ agents, onStart, onPause, onViewMemory, onCreate }: AgentsPanelProps) {
  return (
    <section className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Agents</h2>
          <p className="text-sm text-slate-400">Monitor, orchestrate, and connect your crew.</p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-sm font-medium hover:bg-emerald-500/30"
        >
          + Create Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="text-sm text-slate-400">No agents yet. Use the button above to create one.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={onStart}
              onPause={onPause}
              onViewMemory={onViewMemory}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default AgentsPanel;
