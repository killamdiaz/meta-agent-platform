import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { enqueueTask, listAgents } from '../api/client';
import type { Agent } from '../api/types';
import { useWebSocket } from '../hooks/useWebSocket';

function formatEvent(event: ReturnType<typeof useWebSocket>['events'][number], agents: Agent[]) {
  const agent = agents.find((a) => a.id === ('agentId' in event ? (event as any).agentId : undefined));
  const agentName = agent?.name ?? (event as any).agentId ?? 'Unknown agent';
  switch (event.event) {
    case 'task:queued':
      return `${agentName} queued: ${event.prompt}`;
    case 'task:start':
      return `${agentName} started task: ${event.prompt}`;
    case 'task:thought':
      return `${agentName} thought:\n${event.thought}`;
    case 'task:action':
      return `${agentName} action:\n${JSON.stringify(event.action, null, 2)}`;
    case 'task:completed':
      return `${agentName} completed:\n${JSON.stringify(event.result, null, 2)}`;
    case 'task:error':
      return `${agentName} error:\n${JSON.stringify(event.error, null, 2)}`;
    case 'socket:error':
      return `Socket error: ${event.message}`;
    default:
      return 'Unknown event';
  }
}

function ConsolePage() {
  const { events, status, send } = useWebSocket();
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => listAgents(),
    staleTime: 10000
  });
  const [agentId, setAgentId] = useState('');
  const [prompt, setPrompt] = useState('');

  const enqueueTaskMutation = useMutation({
    mutationFn: (payload: { agentId: string; prompt: string }) => enqueueTask(payload.agentId, payload.prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const sortedEvents = useMemo(() => [...events].reverse(), [events]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agentId || !prompt.trim()) {
      return;
    }
    send({ agent_id: agentId, prompt: prompt.trim() });
    enqueueTaskMutation.mutate({ agentId, prompt: prompt.trim() });
    setPrompt('');
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
      <section className="panel" style={{ minHeight: 0 }}>
        <div className="section-header">
          <div>
            <h2>Live Console</h2>
            <p style={{ color: 'rgba(148, 163, 184, 0.75)', margin: 0 }}>
              WebSocket status: <strong>{status}</strong>
            </p>
          </div>
        </div>
        <div className="console-log">
          {sortedEvents.map((event) => (
            <article key={`${event.event}-${'taskId' in event ? event.taskId : Math.random()}`} className="console-entry">
              <header>
                <span>{'timestamp' in event ? new Date(event.timestamp).toLocaleString() : '—'}</span>
                {'agentId' in event && event.agentId && <span className="badge">{event.agentId.slice(0, 8)}…</span>}
              </header>
              <pre>{formatEvent(event, agentsQuery.data ?? [])}</pre>
            </article>
          ))}
          {sortedEvents.length === 0 && <div className="empty-state">No console events yet.</div>}
        </div>
      </section>
      <section className="panel">
        <h2>Send Prompt</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="agent">Agent</label>
            <select
              id="agent"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              required
            >
              <option value="">Select an agent</option>
              {(agentsQuery.data ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the task for the selected agent"
              required
            />
          </div>
          <button className="button" type="submit" disabled={!agentId || !prompt.trim() || enqueueTaskMutation.isPending}>
            {enqueueTaskMutation.isPending ? 'Sending…' : 'Send command'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default ConsolePage;
