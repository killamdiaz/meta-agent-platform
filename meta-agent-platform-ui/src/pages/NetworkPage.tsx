import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createAgent,
  deleteAgent,
  enqueueTask,
  listAgents,
  listTasks,
  updateAgent,
  updateAgentStatus
} from '../api/client';
import type { Agent, AgentStatus, TaskRecord } from '../api/types';

interface AgentFormState {
  id?: string;
  name: string;
  role: string;
  objectives: string;
  tools: string;
  memoryContext: string;
}

const emptyForm: AgentFormState = {
  name: '',
  role: '',
  objectives: '',
  tools: '',
  memoryContext: ''
};

function deriveForm(agent?: Agent): AgentFormState {
  if (!agent) {
    return emptyForm;
  }
  const objectives = Array.isArray(agent.objectives)
    ? (agent.objectives as string[]).join('\n')
    : typeof agent.objectives === 'string'
      ? agent.objectives
      : '';
  const toolKeys = Object.keys(agent.tools ?? {});
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    objectives,
    tools: toolKeys.join(', '),
    memoryContext: agent.memory_context ?? ''
  };
}

function NetworkPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => listAgents(), refetchInterval: 8000 });
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks(), refetchInterval: 8000 });

  const [form, setForm] = useState<AgentFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setForm(emptyForm);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateAgent>[1] }) =>
      updateAgent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setEditingId(null);
      setForm(emptyForm);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    }
  });

  const startMutation = useMutation({
    mutationFn: ({ agentId, prompt }: { agentId: string; prompt: string }) => enqueueTask(agentId, prompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ agentId, status }: { agentId: string; status: AgentStatus }) => updateAgentStatus(agentId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    }
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      objectives: form.objectives
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
      tools: Object.fromEntries(
        form.tools
          .split(/[,\n]+/)
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => [name, true])
      ),
      memory_context: form.memoryContext.trim()
    };
    if (!payload.name || !payload.role) {
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const activeTasks = useMemo(() => {
    const records = tasksQuery.data ?? [];
    return records.slice(0, 6);
  }, [tasksQuery.data]);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
      <section className="panel">
        <div className="section-header">
          <h2>Agent Network</h2>
          <span className="badge">{agentsQuery.data?.length ?? 0} agents</span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {(agentsQuery.data ?? []).map((agent) => (
            <article key={agent.id} className="panel" style={{ padding: '1.25rem' }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{agent.name}</h3>
                <span className={`badge status-${agent.status}`}>{agent.status}</span>
              </header>
              <p style={{ color: 'rgba(148, 163, 184, 0.8)', marginTop: '0.35rem' }}>{agent.role}</p>
              {agent.objectives && Array.isArray(agent.objectives) && (agent.objectives as string[]).length > 0 && (
                <div className="memory-node-meta">
                  <strong>Objectives</strong>
                  <div className="tag-list">
                    {(agent.objectives as string[]).map((objective) => (
                      <span key={objective} className="badge">
                        {objective}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="card-actions" style={{ marginTop: '1rem' }}>
                <button
                  className="button"
                  onClick={() =>
                    startMutation.mutate({
                      agentId: agent.id,
                      prompt: `Start orchestration cycle for ${agent.name}`
                    })
                  }
                  disabled={startMutation.isPending}
                >
                  Start
                </button>
                <button
                  className="button secondary"
                  onClick={() => statusMutation.mutate({ agentId: agent.id, status: 'idle' })}
                  disabled={statusMutation.isPending}
                >
                  Pause
                </button>
                <button className="button secondary" onClick={() => navigate(`/memory?agentId=${agent.id}`)}>
                  Memory
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditingId(agent.id);
                    setForm(deriveForm(agent));
                  }}
                >
                  Edit
                </button>
                <button
                  className="button danger"
                  onClick={() => deleteMutation.mutate(agent.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {(agentsQuery.data ?? []).length === 0 && <div className="empty-state">No agents yet. Create one to begin.</div>}
      </section>
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <h2>{editingId ? 'Edit Agent' : 'Create Agent'}</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Atlas"
                required
              />
            </div>
            <div>
              <label htmlFor="role">Role</label>
              <input
                id="role"
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                placeholder="Research Coordinator"
                required
              />
            </div>
            <div>
              <label htmlFor="objectives">Objectives (one per line)</label>
              <textarea
                id="objectives"
                value={form.objectives}
                onChange={(event) => setForm((prev) => ({ ...prev, objectives: event.target.value }))}
                placeholder={'Synthesize reports\nMonitor blockers'}
              />
            </div>
            <div>
              <label htmlFor="tools">Tools (comma separated)</label>
              <input
                id="tools"
                value={form.tools}
                onChange={(event) => setForm((prev) => ({ ...prev, tools: event.target.value }))}
                placeholder="slack, notion"
              />
            </div>
            <div>
              <label htmlFor="memory">Memory context</label>
              <textarea
                id="memory"
                value={form.memoryContext}
                onChange={(event) => setForm((prev) => ({ ...prev, memoryContext: event.target.value }))}
                placeholder="Key context that the agent should remember"
              />
            </div>
            <div className="card-actions">
              <button className="button" type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? 'Save changes' : 'Create agent'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
        <div>
          <h2>Recent Tasks</h2>
          <div className="grid" style={{ gap: '0.75rem' }}>
            {activeTasks.map((task: TaskRecord) => (
              <article key={task.id} className="console-entry">
                <header>
                  <span>{new Date(task.created_at).toLocaleString()}</span>
                  <span className={`badge status-${task.status}`}>{task.status}</span>
                </header>
                <h3>{task.prompt}</h3>
                {task.result != null && (
                  <pre style={{ fontSize: '0.8rem' }}>{JSON.stringify(task.result, null, 2)}</pre>
                )}
              </article>
            ))}
            {activeTasks.length === 0 && <div className="empty-state">No tasks queued yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

export default NetworkPage;
