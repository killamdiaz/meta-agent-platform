import { useEffect, useMemo } from "react";
import { ArrowUp, Circle, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { AgentRecord } from "@/types/api";
import { formatDistanceToNow } from "date-fns";
import { useTokenStore } from "@/store/tokenStore";

function formatPercent(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function formatRoleDistribution(agents: AgentRecord[]) {
  const counts = agents.reduce<Record<string, number>>((acc, agent) => {
    const role = agent.role || "Generalist";
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([role, count]) => ({ role, count }));
}

export default function Overview() {
  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["insights", "overview"],
    queryFn: () => api.fetchOverviewInsights(),
    refetchInterval: 30_000,
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    select: (response) => response.items,
    refetchInterval: 20_000,
  });

  const { data: workflowsData, isLoading: workflowsLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
    select: (response) => response.items,
    refetchInterval: 30_000,
  });

  const totalTokens = useTokenStore((state) => state.totalTokens);
  const tokensByAgent = useTokenStore((state) => state.tokensByAgent);
  const setTokenUsage = useTokenStore((state) => state.setUsage);

  useEffect(() => {
    if (overview?.tokenUsage) {
      setTokenUsage(overview.tokenUsage);
    }
  }, [overview, setTokenUsage]);

  const topTokenConsumer = useMemo(() => {
    const entries = Object.entries(tokensByAgent ?? {});
    if (entries.length === 0) {
      return null;
    }
    const [agent, tokens] = entries.sort((a, b) => b[1] - a[1])[0];
    return { agent, tokens };
  }, [tokensByAgent]);

  const formattedTokens = totalTokens.toLocaleString();
  const tokenHighlight = topTokenConsumer
    ? `${topTokenConsumer.tokens.toLocaleString()} by ${topTokenConsumer.agent}`
    : "Tracking…";

  const overviewStats = overview
    ? [
        {
          label: "Active Agents",
          value: overview.agentCount,
          change: `${overview.taskCounts.working} running`,
          detail: `${overview.taskCounts.pending} pending tasks`,
        },
        {
          label: "Tasks Completed",
          value: overview.taskCounts.completed,
          change: `${formatPercent(overview.taskCounts.completed, overview.taskCounts.total)} of total`,
          detail: `${overview.taskCounts.total} tracked`,
        },
        {
          label: "Tasks In Flight",
          value: overview.taskCounts.pending + overview.taskCounts.working,
          change: `${overview.taskCounts.pending} pending`,
          detail: `${overview.taskCounts.working} working`,
        },
        {
          label: "Memories Stored",
          value: overview.memoryCount,
          change: `${overview.recentTasks.length} recent tasks`,
          detail: `Uptime ${(overview.uptimeSeconds / 3600).toFixed(1)}h`,
        },
      ]
    : [];

  if (workflowsData) {
    const ready = workflowsData.filter((wf) => (wf.missing_nodes ?? (wf as unknown as { missingNodes?: string[] }).missingNodes ?? []).length === 0).length;
    overviewStats.push({
      label: "Active Automations",
      value: workflowsData.length,
      change: `${ready} ready`,
      detail: workflowsData[0]?.name ?? "Prompt-to-workflow",
    });
  }

  const roleDistribution = agentsData ? formatRoleDistribution(agentsData) : [];

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Overview</h1>
        <p className="text-muted-foreground">Monitor your AI workforce performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="bg-card border-border p-6 hover:border-atlas-glow/50 transition-all duration-300">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Tokens Used</div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground">{formattedTokens}</div>
              <div className="flex items-center text-xs text-atlas-glow gap-1">
                <ArrowUp className="h-3 w-3" />
                {tokenHighlight}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Since runtime start</div>
          </div>
        </Card>
        {overviewLoading && !overview
          ? Array.from({ length: 4 }).map((_, idx) => (
              <Card key={`skeleton-${idx}`} className="bg-card border-border p-6">
                <Skeleton className="h-20 w-full" />
              </Card>
            ))
          : overviewStats.map((stat) => (
              <Card
                key={stat.label}
                className="bg-card border-border p-6 hover:border-atlas-glow/50 transition-all duration-300"
              >
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                    <div className="flex items-center text-xs text-atlas-success gap-1">
                      <ArrowUp className="h-3 w-3" />
                      {stat.change}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{stat.detail}</div>
                </div>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="bg-card border-border p-6 lg:col-span-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Agent Activity</h3>
              <p className="text-sm text-muted-foreground">Tasks processed over the last 7 days</p>
            </div>
            <div className="h-64 flex items-end justify-between gap-2">
              {(overview?.tasksPerDay ?? []).map((entry) => (
                <div key={entry.day} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-atlas-glow rounded-t transition-all hover:bg-atlas-glow/80"
                    style={{ height: `${Math.min(100, entry.count * 4)}%` }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.day).toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                </div>
              ))}
              {!overview && <Skeleton className="h-full w-full" />}
            </div>
          </div>
        </Card>

        <Card className="bg-card border-border p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Agent Roles</h3>
              <p className="text-sm text-muted-foreground">Distribution across your network</p>
            </div>
            <div className="space-y-3">
              {roleDistribution.length === 0 && <Skeleton className="h-40 w-full" />}
              {roleDistribution.map((type) => (
                <div key={type.role} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">{type.role}</span>
                    <span className="text-muted-foreground">{type.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-atlas-glow rounded-full transition-all"
                      style={{
                        width: `${formatPercent(type.count, agentsData?.length ?? 1)}`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="bg-card border-border p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Automations</h3>
              <p className="text-sm text-muted-foreground">Prompt-compiled workflows in Atlas Forge</p>
            </div>
            <div className="space-y-3">
              {workflowsLoading && !workflowsData && <Skeleton className="h-32 w-full" />}
              {(workflowsData ?? []).slice(0, 4).map((workflow) => (
                <div key={workflow.id} className="p-3 rounded-lg bg-muted/30 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{workflow.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(workflow.steps ?? []).length} steps · {(workflow.missing_nodes ?? (workflow as unknown as { missingNodes?: string[] }).missingNodes ?? []).length} missing
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {(workflow as unknown as { trigger?: { type?: string } }).trigger?.type ?? "manual"}
                  </span>
                </div>
              ))}
              {(workflowsData?.length ?? 0) === 0 && !workflowsLoading && (
                <div className="text-sm text-muted-foreground">No automations saved yet.</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="bg-card border-border p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Recent Tasks</h3>
              <p className="text-sm text-muted-foreground">Latest agent activities</p>
            </div>
          </div>
          <div className="space-y-3">
            {!overview && overviewLoading && <Skeleton className="h-24 w-full" />}
            {(overview?.recentTasks ?? []).map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-atlas-success animate-pulse-glow" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{activity.prompt}</div>
                  <div className="text-xs text-muted-foreground">{activity.agentName}</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Circle className="h-2 w-2 fill-current" />
                  <span className="capitalize">{activity.status}</span>
                  <Sparkles className="h-3 w-3 text-atlas-glow" />
                  <span>{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
