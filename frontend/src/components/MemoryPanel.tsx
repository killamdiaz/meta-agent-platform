import { MemoryEntry } from '../types';

interface MemoryPanelProps {
  agentName?: string;
  memories: MemoryEntry[];
}

export function MemoryPanel({ agentName, memories }: MemoryPanelProps) {
  return (
    <section className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Memory Graph</h2>
        <p className="text-sm text-slate-400">Recent context nodes persisted after task runs.</p>
      </div>
      {agentName ? (
        <p className="text-sm text-slate-300">Showing last updates for <span className="text-emerald-200 font-medium">{agentName}</span>.</p>
      ) : (
        <p className="text-sm text-slate-500">Select an agent to inspect memory.</p>
      )}
      <div className="space-y-3">
        {memories.length === 0 ? (
          <p className="text-sm text-slate-500">No memory chunks yet.</p>
        ) : (
          memories.map((memory) => (
            <div key={memory.id} className="border border-slate-700 rounded-lg bg-slate-900/60 p-4">
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{memory.content}</p>
              <p className="text-xs text-slate-500 mt-2">
                {new Date(memory.created_at).toLocaleString()} · Similarity:{' '}
                {typeof memory.similarity === 'number'
                  ? memory.similarity.toFixed(2)
                  : memory.similarity
                  ? Number(memory.similarity).toFixed(2)
                  : '—'}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default MemoryPanel;
