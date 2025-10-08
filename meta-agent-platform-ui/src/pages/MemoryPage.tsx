import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchMemoryGraph, listAgents, searchMemory } from '../api/client';
import type { Agent, MemoryGraphResponse, MemoryNode, MemorySearchResult } from '../api/types';

interface GraphNode {
  id: string;
  type: 'agent' | 'memory';
  label: string;
  agentId: string;
  x: number;
  y: number;
  source?: MemoryNode;
}

interface GraphLink {
  source: string;
  target: string;
}

function hashToUnit(value: string, offset = 0) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i) + offset) % 1000000;
  }
  return hash / 500000 - 1; // -> [-1, 1]
}

function computeGraph(data: MemoryGraphResponse) {
  const agents = data.agents;
  const agentNodes: GraphNode[] = agents.map((agent, index) => {
    const angle = (index / Math.max(agents.length, 1)) * Math.PI * 2;
    return {
      id: `agent-${agent.id}`,
      type: 'agent',
      label: agent.name,
      agentId: agent.id,
      x: Math.cos(angle) * 200,
      y: Math.sin(angle) * 200
    };
  });

  const memoryNodes: GraphNode[] = data.memories.map((memory) => {
    const [ex, ey] = memory.embedding;
    const x = Number.isFinite(ex) ? ex : hashToUnit(memory.id);
    const y = Number.isFinite(ey) ? ey : hashToUnit(memory.id, 17);
    return {
      id: memory.id,
      type: 'memory',
      label: memory.content.slice(0, 60) + (memory.content.length > 60 ? '…' : ''),
      agentId: memory.agent_id,
      x: x * 220,
      y: y * 220,
      source: memory
    };
  });

  const links: GraphLink[] = [];
  for (const memory of memoryNodes) {
    links.push({ source: `agent-${memory.agentId}`, target: memory.id });
  }
  const byAgent = new Map<string, GraphNode[]>();
  for (const node of memoryNodes) {
    const list = byAgent.get(node.agentId) ?? [];
    list.push(node);
    byAgent.set(node.agentId, list);
  }
  for (const [, nodes] of byAgent) {
    const sorted = [...nodes].sort((a, b) => {
      const aTime = new Date(a.source?.created_at ?? 0).getTime();
      const bTime = new Date(b.source?.created_at ?? 0).getTime();
      return aTime - bTime;
    });
    for (let i = 1; i < sorted.length; i += 1) {
      links.push({ source: sorted[i - 1].id, target: sorted[i].id });
    }
  }

  return { nodes: [...agentNodes, ...memoryNodes], links };
}

function MemoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const agentFilter = searchParams.get('agentId') ?? undefined;
  const memoryQuery = useQuery({
    queryKey: ['memory', agentFilter],
    queryFn: () => fetchMemoryGraph(agentFilter || undefined, 150),
    refetchInterval: 10000
  });
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => listAgents(), staleTime: 10000 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);

  const searchMutation = useMutation({
    mutationFn: ({ agentId, query }: { agentId: string; query: string }) => searchMemory(agentId, query),
    onSuccess: (items) => {
      setSearchResults(items);
    }
  });

  const graph = useMemo(() => (memoryQuery.data ? computeGraph(memoryQuery.data) : { nodes: [], links: [] }), [
    memoryQuery.data
  ]);

  const handleAgentFilterChange = (agentId: string) => {
    const params = new URLSearchParams(searchParams);
    if (agentId) {
      params.set('agentId', agentId);
    } else {
      params.delete('agentId');
    }
    setSearchParams(params, { replace: true });
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agentFilter || !searchInput.trim()) {
      return;
    }
    searchMutation.mutate({ agentId: agentFilter, query: searchInput.trim() });
  };

  return (
    <div className="memory-layout">
      <section className="panel" style={{ overflow: 'hidden' }}>
        <div className="section-header">
          <div>
            <h2>Memory Graph</h2>
            <p style={{ margin: 0, color: 'rgba(148, 163, 184, 0.75)' }}>
              {memoryQuery.isFetching ? 'Refreshing…' : 'Live view of agent memories'}
            </p>
          </div>
          <div className="actions">
            <select
              value={agentFilter ?? ''}
              onChange={(event) => handleAgentFilterChange(event.target.value)}
            >
              <option value="">All agents</option>
              {(agentsQuery.data ?? []).map((agent: Agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <svg className="memory-graph" viewBox="-320 -260 640 520">
          <defs>
            <radialGradient id="agentGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.4" />
            </radialGradient>
            <radialGradient id="memoryGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.35" />
            </radialGradient>
          </defs>
          {graph.links.map((link) => (
            <line
              key={`${link.source}-${link.target}`}
              x1={graph.nodes.find((node) => node.id === link.source)?.x ?? 0}
              y1={graph.nodes.find((node) => node.id === link.source)?.y ?? 0}
              x2={graph.nodes.find((node) => node.id === link.target)?.x ?? 0}
              y2={graph.nodes.find((node) => node.id === link.target)?.y ?? 0}
              stroke="rgba(148, 163, 184, 0.3)"
              strokeWidth={1}
            />
          ))}
          {graph.nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <circle
                r={node.type === 'agent' ? 18 : 12}
                fill={node.type === 'agent' ? 'url(#agentGradient)' : 'url(#memoryGradient)'}
                stroke={selectedNode?.id === node.id ? '#f97316' : 'rgba(148, 163, 184, 0.4)'}
                strokeWidth={selectedNode?.id === node.id ? 3 : 1.5}
                onClick={() => setSelectedNode(node)}
                style={{ cursor: 'pointer' }}
              />
              <text
                y={node.type === 'agent' ? -26 : -20}
                textAnchor="middle"
                fontSize={node.type === 'agent' ? 12 : 10}
                fill="rgba(226, 232, 240, 0.9)"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </section>
      <section className="panel memory-details">
        <div>
          <h2>Details</h2>
          {selectedNode ? (
            <div>
              <p>
                <strong>Type:</strong> {selectedNode.type === 'agent' ? 'Agent' : 'Memory chunk'}
              </p>
              {selectedNode.type === 'agent' && (
                <AgentDetails agentId={selectedNode.agentId} agents={agentsQuery.data ?? []} />
              )}
              {selectedNode.type === 'memory' && selectedNode.source && <MemoryDetails memory={selectedNode.source} />}
            </div>
          ) : (
            <div className="empty-state">Select a node to view metadata.</div>
          )}
        </div>
        <div>
          <h2>Semantic Search</h2>
          <form className="form-grid" onSubmit={handleSearch}>
            <div>
              <label htmlFor="search-query">Query</label>
              <textarea
                id="search-query"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="What insight are you looking for?"
                disabled={!agentFilter}
              />
            </div>
            <button className="button" type="submit" disabled={!agentFilter || searchMutation.isPending}>
              {searchMutation.isPending ? 'Searching…' : 'Search selected agent'}
            </button>
          </form>
          <div className="grid" style={{ gap: '0.75rem' }}>
            {searchResults.map((result) => (
              <article key={result.id} className="console-entry" onClick={() => setSelectedNode({
                id: result.id,
                type: 'memory',
                label: result.content.slice(0, 60) + (result.content.length > 60 ? '…' : ''),
                agentId: result.agent_id,
                x: 0,
                y: 0,
                source: result
              })}>
                <header>
                  <span>{new Date(result.created_at).toLocaleString()}</span>
                  <span className="badge">{result.similarity.toFixed(2)}</span>
                </header>
                <p style={{ marginTop: '0.5rem' }}>{result.content}</p>
              </article>
            ))}
            {searchResults.length === 0 && (
              <div className="empty-state">Enter a query after selecting an agent to run semantic search.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentDetails({ agentId, agents }: { agentId: string; agents: Agent[] }) {
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) {
    return <p>Agent not found.</p>;
  }
  return (
    <div className="memory-node-meta">
      <p>
        <strong>Name:</strong> {agent.name}
      </p>
      <p>
        <strong>Role:</strong> {agent.role}
      </p>
      <p>
        <strong>Status:</strong> {agent.status}
      </p>
      {Array.isArray(agent.objectives) && agent.objectives.length > 0 && (
        <div>
          <strong>Objectives</strong>
          <div className="tag-list">
            {agent.objectives.map((objective) => (
              <span key={objective} className="badge">
                {objective}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryDetails({ memory }: { memory: MemoryNode | MemorySearchResult }) {
  return (
    <div className="memory-node-meta">
      <p>
        <strong>Captured:</strong> {new Date(memory.created_at).toLocaleString()}
      </p>
      <p>
        <strong>Content</strong>
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{memory.content}</pre>
      {memory.metadata && Object.keys(memory.metadata).length > 0 && (
        <div>
          <strong>Metadata</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{JSON.stringify(memory.metadata, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default MemoryPage;
