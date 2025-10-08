import { FormEvent, useState } from 'react';
import { CommandResponse } from '../types';

interface CommandConsoleProps {
  onSubmit: (command: string) => Promise<CommandResponse>;
}

export function CommandConsole({ onSubmit }: CommandConsoleProps) {
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<CommandResponse[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!command.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await onSubmit(command);
      setHistory((prev) => [response, ...prev].slice(0, 8));
      setCommand('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run command');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-slate-900/80 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Command Console</h2>
        <p className="text-sm text-slate-400">Drive agents via slash commands and orchestrate runs.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="/create FinanceAgent with tools: Gmail, Notion"
          className="w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-white"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-200 text-sm hover:bg-sky-500/30 disabled:opacity-50"
        >
          {submitting ? 'Running…' : 'Send Command'}
        </button>
      </form>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="space-y-2">
        {history.map((entry, index) => (
          <div key={index} className="border border-slate-700 rounded-lg p-3 bg-slate-900/60 text-sm text-slate-200">
            <p className="font-semibold text-emerald-200">{entry.message}</p>
            <pre className="mt-2 text-xs text-slate-400 whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

export default CommandConsole;
