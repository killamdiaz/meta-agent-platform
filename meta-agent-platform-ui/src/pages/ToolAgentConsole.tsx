import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiBaseUrl } from "@/lib/api";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Radio, Terminal, RotateCw, ArrowLeft } from "lucide-react";

interface ToolAgentSnapshot {
  id: string;
  name: string;
  role: string;
  description?: string;
  connections: string[];
  isTalking: boolean;
  agentType: string;
}

interface ToolAgentLogEntry {
  id: string;
  timestamp: string;
  direction: "incoming" | "outgoing";
  counterpart: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

const withLicense = () => {
  const headers: Record<string, string> = {};
  const key = localStorage.getItem("forge_license_key");
  if (key) headers["x-license-key"] = key;
  return headers;
};

const fetchToolAgents = async (): Promise<ToolAgentSnapshot[]> => {
  const response = await fetch(`${apiBaseUrl}/multi-agent/tool-agents`, { headers: withLicense() });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = (await response.json()) as { items: ToolAgentSnapshot[] };
  return payload.items ?? [];
};

const fetchToolAgentLogs = async (agentId: string, limit = 200): Promise<ToolAgentLogEntry[]> => {
  const response = await fetch(`${apiBaseUrl}/multi-agent/tool-agents/${agentId}/logs?limit=${limit}`, {
    headers: withLicense(),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = (await response.json()) as { items: ToolAgentLogEntry[] };
  return payload.items ?? [];
};

export default function ToolAgentConsole() {
  const [agents, setAgents] = useState<ToolAgentSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<ToolAgentSnapshot | null>(null);
  const [logs, setLogs] = useState<ToolAgentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchToolAgents();
      setAgents(snapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load tool agents";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAgents();
  }, []);

  const openLogsDrawer = async (agent: ToolAgentSnapshot) => {
    setSelectedAgent(agent);
    setLogs([]);
    setLogsError(null);
    setLogsLoading(true);
    try {
      const entries = await fetchToolAgentLogs(agent.id);
      setLogs(entries);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Failed to load agent logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const refreshLogs = async () => {
    if (!selectedAgent) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const entries = await fetchToolAgentLogs(selectedAgent.id);
      setLogs(entries);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Failed to load agent logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const closeLogs = () => {
    setSelectedAgent(null);
    setLogs([]);
    setLogsError(null);
  };

  return (
    <div className="flex h-full flex-col bg-[#06070c]">
      <header className="border-b border-border/60 bg-gradient-to-br from-background via-background to-background/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <Radio className="h-3.5 w-3.5" />
              Tool Agent Runtime
            </div>
            <h1 className="text-3xl font-semibold text-foreground">Tool Agents</h1>
            <p className="text-sm text-muted-foreground">
              Monitor connected tool agents, verify their status, and confirm they are registered with the runtime.
            </p>
          </div>
          <Button onClick={loadAgents} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {!loading && agents.length === 0 && !error && (
            <div className="rounded-lg border border-border/60 bg-muted/10 px-6 py-8 text-center text-sm text-muted-foreground">
              No tool agents are currently registered. Configure and save credentials for an agent to see it here.
            </div>
          )}

          {loading && agents.length === 0 && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tool agents…
            </div>
          )}

          {!selectedAgent ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <Card key={agent.id} className="h-full border-border/60 bg-card/70 backdrop-blur">
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-semibold text-foreground">{agent.name}</div>
                        <div className="text-xs text-muted-foreground">{agent.agentType}</div>
                        <div className="text-[10px] uppercase text-muted-foreground/70">#{agent.id.slice(0, 8)}</div>
                      </div>
                      <Badge variant={agent.isTalking ? "default" : "secondary"} className="gap-1">
                        {agent.isTalking ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
                        {agent.isTalking ? "Active" : "Idle"}
                      </Badge>
                    </div>

                    <div className="rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">Role</div>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{agent.role}</p>
                    </div>

                    {agent.description && (
                      <div className="rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">Description</div>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{agent.description}</p>
                      </div>
                    )}

                    <div className="rounded-lg border border-border/50 bg-background/60 p-3 text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">Connections</div>
                      {agent.connections.length === 0 ? (
                        <p className="mt-1">No linked agents.</p>
                      ) : (
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                          {agent.connections.map((connection) => (
                            <li key={connection}>{connection}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-border/60 bg-background/60 text-foreground hover:bg-background"
                      onClick={() => void openLogsDrawer(agent)}
                    >
                      <Terminal className="mr-2 h-4 w-4" />
                      View Logs
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-[#050609]">
              <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-4">
                <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={closeLogs}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to agents
                  </Button>
                  <span>{`${selectedAgent.name} Logs`}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 border border-border/50 bg-background/60 text-foreground hover:bg-background"
                  onClick={() => void refreshLogs()}
                  disabled={logsLoading}
                >
                  {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>

              {logsError && (
                <div className="mx-6 mt-4 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {logsError}
                </div>
              )}

              <ScrollArea className="h-[28rem] px-6 py-4">
                <div className="flex flex-col gap-3 font-mono text-xs">
                  {logsLoading && logs.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 rounded border border-border/50 bg-background/60 p-4 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading logs…
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="rounded border border-border/50 bg-background/60 p-4 text-muted-foreground">
                      No recent messages for this agent.
                    </div>
                  ) : (
                    logs.map((log) => {
                      const timestamp = new Date(log.timestamp);
                      const formatted = Number.isNaN(timestamp.getTime())
                        ? log.timestamp
                        : timestamp.toLocaleTimeString(undefined, { hour12: false });
                      const metadata = Object.keys(log.metadata ?? {}).length ? JSON.stringify(log.metadata, null, 2) : null;

                      return (
                        <div
                          key={`${log.id}-${log.timestamp}`}
                          className="rounded border border-border/30 bg-black/50 px-4 py-3 leading-relaxed text-slate-200"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                            <span className="text-sky-300">{formatted}</span>
                            <span className={log.direction === "outgoing" ? "text-emerald-400" : "text-amber-300"}>
                              {log.direction === "outgoing" ? "OUT" : "IN"}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="text-slate-300">{log.counterpart}</span>
                            <span className="rounded border border-slate-500/60 px-1 py-[1px] text-[10px] text-slate-200">
                              {log.type.toUpperCase()}
                            </span>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-slate-100">{log.content}</pre>
                          {metadata && (
                            <pre className="mt-3 rounded border border-slate-500/30 bg-slate-900/80 p-3 text-[11px] text-slate-300">
                              {metadata}
                            </pre>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
