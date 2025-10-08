import React from 'react';
import { Task } from '../types';

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="border border-slate-700 rounded-xl bg-slate-900/60 p-4">
      <>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-300">Agent ID: {task.agent_id}</p>
            <p className="text-base text-white font-medium mt-1">{task.prompt}</p>
          </div>
          <span
            className={`px-2 py-1 rounded-full text-xs border ${statusColors[task.status] || 'bg-slate-700 text-slate-200 border-slate-600'}`}
          >
            {task.status}
          </span>
        </div>
        {task.result && (
          <pre className="mt-3 text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg overflow-x-auto max-h-40">
            {JSON.stringify(task.result, null, 2)}
          </pre>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Updated {new Date(task.updated_at).toLocaleTimeString()} · Created{' '}
          {new Date(task.created_at).toLocaleTimeString()}
        </p>
      </>
    </div>
  );
}

interface TasksPanelProps {
  tasks: Task[];
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-200 border-emerald-400/40',
  working: 'bg-sky-500/10 text-sky-200 border-sky-400/40',
  pending: 'bg-amber-500/10 text-amber-200 border-amber-400/40',
  error: 'bg-red-500/10 text-red-200 border-red-400/40'
};

export function TasksPanel({ tasks }: TasksPanelProps) {
  return (
    <section className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Task Queue</h2>
        <p className="text-sm text-slate-400">Live orchestration history across all agents.</p>
      </div>
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks scheduled yet.</p>
        ) : (
          <>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

export default TasksPanel;
