import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Activity, BarChart3, Gauge, Coins, PieChart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { useTokenStore } from "@/store/tokenStore";

type BreakdownRow = { source?: string; agent_name?: string; total_tokens: number; total_cost: number };
type ModelRow = { model_name: string; model_provider: string; total_tokens: number; total_cost: number };
type SeriesPoint = { bucket: string; total_tokens: number; total_cost: number };

const FILTERS = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function Billing() {
  const { user, loading: authLoading } = useAuth();
  const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? "";

  const [summary, setSummary] = useState<{ total_tokens: number; total_cost: number } | null>(null);
  const [daily, setDaily] = useState<SeriesPoint[] | null>(null);
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [sources, setSources] = useState<BreakdownRow[] | null>(null);
  const [agents, setAgents] = useState<BreakdownRow[] | null>(null);
  const [filter, setFilter] = useState<string>("30d");
  const [loading, setLoading] = useState(true);
  const setTokenUsage = useTokenStore((state) => state.setUsage);

  useEffect(() => {
    if (!orgId || authLoading) return;
    const load = async () => {
      setLoading(true);
      try {
        const [s, d, b, m, a] = await Promise.all([
          api.fetchUsageSummary(orgId),
          api.fetchUsageDaily(orgId),
          api.fetchUsageBreakdown(orgId),
          api.fetchUsageModels(orgId),
          api.fetchUsageAgents(orgId),
        ]);
        setSummary(s);
        setDaily(d);
        setSources(b);
        setModels(m);
        setAgents(a);
        if (s?.total_tokens !== undefined) {
          setTokenUsage({
            total: Number(s.total_tokens) || 0,
            byAgent: {}, // Billing summary is aggregate; agent-level handled elsewhere
          });
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orgId, authLoading]);

  const providerBreakdown = useMemo(() => {
    if (!models) return [];
    const map = new Map<string, { tokens: number; cost: number }>();
    models.forEach((m) => {
      const entry = map.get(m.model_provider) ?? { tokens: 0, cost: 0 };
      entry.tokens += Number(m.total_tokens ?? 0);
      entry.cost += Number(m.total_cost ?? 0);
      map.set(m.model_provider, entry);
    });
    return Array.from(map.entries()).map(([provider, totals]) => ({ provider, ...totals }));
  }, [models]);

  const filteredDaily = useMemo(() => {
    if (!daily) return [];
    if (filter === "all") return daily;
    const now = new Date();
    const days = filter === "24h" ? 1 : filter === "7d" ? 7 : 30;
    return daily.filter((row) => {
      const bucket = new Date(row.bucket);
      const diff = (now.getTime() - bucket.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= days;
    });
  }, [daily, filter]);

  const renderSkeletonCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, idx) => (
        <Card key={idx}>
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Billing & Usage</h1>
          <p className="text-muted-foreground">See tokens, cost, and breakdowns across all models.</p>
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={f.value === filter ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" /> Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Manage your plan and payment method.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">View Plans</Button>
            <Button>Upgrade</Button>
          </div>
        </CardContent>
      </Card>

      {loading || !summary ? (
        renderSkeletonCards()
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Activity className="h-4 w-4" /> Today&apos;s Tokens
              </div>
              <div className="text-3xl font-bold">{formatNumber(filteredDaily[0]?.total_tokens ?? 0)}</div>
              <p className="text-xs text-muted-foreground">Rolling window based on filter.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="h-4 w-4" /> This Month
              </div>
              <div className="text-3xl font-bold">
                {formatNumber(
                  filteredDaily.reduce((sum, row) => sum + Number(row.total_tokens ?? 0), 0)
                )}
              </div>
              <p className="text-xs text-muted-foreground">Total tokens for selected window.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Coins className="h-4 w-4" /> Total Cost
              </div>
              <div className="text-3xl font-bold">{formatCurrency(Number(summary.total_cost ?? 0))}</div>
              <p className="text-xs text-muted-foreground">Includes OpenAI costs; local models are $0.</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Daily Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !daily ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="space-y-2">
                {filteredDaily.map((row) => (
                  <div key={row.bucket} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{new Date(row.bucket).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 bg-primary/10 rounded-full overflow-hidden">
                        <div
                          className="h-2 bg-primary rounded-full"
                          style={{
                            width: `${Math.min(100, (Number(row.total_tokens ?? 0) / (filteredDaily[0]?.total_tokens || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-medium">{formatNumber(Number(row.total_tokens ?? 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Provider Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading || !providerBreakdown.length ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              providerBreakdown.map((provider) => (
                <div key={provider.provider} className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">{provider.provider}</span>
                  <div className="text-right">
                    <div>{formatNumber(provider.tokens)} tokens</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(provider.cost)}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Connector Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading || !sources ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              sources.map((row) => (
                <div key={row.source ?? 'unknown'} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{row.source ?? "unknown"}</span>
                  <div className="text-right">
                    <div>{formatNumber(Number(row.total_tokens ?? 0))} tokens</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(Number(row.total_cost ?? 0))}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" /> Top Agents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading || !agents ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              agents.map((row) => (
                <div key={row.agent_name ?? 'unknown'} className="flex items-center justify-between text-sm">
                  <span>{row.agent_name ?? "unknown"}</span>
                  <div className="text-right">
                    <div>{formatNumber(Number(row.total_tokens ?? 0))} tokens</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(Number(row.total_cost ?? 0))}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
