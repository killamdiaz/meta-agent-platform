import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiBaseUrl } from "@/lib/api";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Radio } from "lucide-react";

interface ToolAgentSnapshot {
  id: string;
  name: string;
  role: string;
  description?: string;
  connections: string[];
  isTalking: boolean;
  agentType: string;
}

const fetchToolAgents = async (): Promise<ToolAgentSnapshot[]> => {
  const response = await fetch(`${apiBaseUrl}/multi-agent/tool-agents`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const payload = (await response.json()) as { items: ToolAgentSnapshot[] };
  return payload.items ?? [];
};

export default function ToolAgentConsole() {
  const [agents, setAgents] = useState<ToolAgentSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <Card key={agent.id} className="h-full border-border/60 bg-card/70 backdrop-blur">
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{agent.name}</div>
                      <div className="text-xs text-muted-foreground">{agent.agentType}</div>
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
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

