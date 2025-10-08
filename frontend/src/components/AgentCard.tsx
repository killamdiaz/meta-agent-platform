import { Fragment } from 'react';
import { Agent } from '../types';
import { clsx } from 'clsx';
import { BoltIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/outline';

interface AgentCardProps {
  agent: Agent;
  onStart?: (agent: Agent) => void;
  onPause?: (agent: Agent) => void;
  onViewMemory?: (agent: Agent) => void;
}

const statusClasses: Record<Agent['status'], string> = {
  idle: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/40',
  working: 'bg-sky-500/10 text-sky-200 border-sky-400/40 animate-pulse',
  error: 'bg-red-500/10 text-red-200 border-red-400/40'
};

export function AgentCard({ agent, onStart, onPause, onViewMemory }: AgentCardProps) {
  const activeTools = Object.keys(agent.tools || {}).filter((tool) => agent.tools[tool]);

  return (
    <div className="border border-slate-700 rounded-xl bg-slate-900/60 p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-400/40 flex items-center justify-center text-emerald-300 uppercase font-semibold">
              {agent.name.slice(0, 2)}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
              <p className="text-sm text-slate-400">{agent.role}</p>
            </div>
          </div>
        </div>
        <span className={clsx('px-2 py-1 rounded-full text-xs border font-medium', statusClasses[agent.status])}>
          {agent.status}
        </span>
      </div>

      <div>
        <p className="text-sm text-slate-300">
          Objectives:
          {agent.objectives?.length ? (
            <Fragment>
              <br />
              {agent.objectives.map((objective, index) => (
                <span key={objective} className="block text-xs text-slate-400">
                  {index + 1}. {objective}
                </span>
              ))}
            </Fragment>
          ) : (
            <span className="text-slate-500"> No objectives assigned.</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-300">
        {activeTools.length ? (
          activeTools.map((tool) => (
            <span key={tool} className="px-2 py-1 rounded-full border border-slate-600 bg-slate-800/60">
              {tool}
            </span>
          ))
        ) : (
          <span className="text-slate-500">No tools connected</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onStart?.(agent)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30"
        >
          <PlayIcon className="h-4 w-4" /> Start
        </button>
        <button
          type="button"
          onClick={() => onPause?.(agent)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-amber-500/10 text-amber-200 border border-amber-400/40 hover:bg-amber-500/20"
        >
          <PauseIcon className="h-4 w-4" /> Pause
        </button>
        <button
          type="button"
          onClick={() => onViewMemory?.(agent)}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-slate-700/60 text-slate-200 border border-slate-500/40 hover:bg-slate-600/60"
        >
          <BoltIcon className="h-4 w-4" /> Memory
        </button>
      </div>
    </div>
  );
}

export default AgentCard;
