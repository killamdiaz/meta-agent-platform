import { useEffect, useMemo } from "react";
import { Network, LayoutDashboard, MessageSquare, Settings, HelpCircle, Brain, Users, Radio } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatDistanceToNowStrict } from "date-fns";
import { useTokenStore } from "@/store/tokenStore";
import { useAuth } from "@/context/AuthContext";

const navigation = [
  { name: "Agent Network", href: "/network", icon: Network },
  { name: "Memory Graph", href: "/memory", icon: Brain },
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Collaboration Lab", href: "/multi-agent", icon: Users },
  { name: "Command Console", href: "/console", icon: MessageSquare },
  { name: "Tool Agents", href: "/multi-agent/runtime", icon: Radio },
];

const bottomNav = [
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help", href: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const { data: overview } = useQuery({
    queryKey: ["insights", "overview"],
    queryFn: () => api.fetchOverviewInsights(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const totalTokens = useTokenStore((state) => state.totalTokens);
  const tokensLastUpdated = useTokenStore((state) => state.lastUpdated);
  const setTokenUsage = useTokenStore((state) => state.setUsage);
  const { user } = useAuth();

  useEffect(() => {
    if (overview?.tokenUsage) {
      setTokenUsage(overview.tokenUsage);
    }
  }, [overview, setTokenUsage]);

  const usage = useMemo(() => {
    if (!overview) {
      return {
        agents: "–",
        tasks: "–",
        tokens: totalTokens.toLocaleString(),
        uptime: "",
      };
    }

    const uptime = overview.uptimeSeconds
      ? formatDistanceToNowStrict(Date.now() - overview.uptimeSeconds * 1000, { addSuffix: false })
      : "";

    return {
      agents: `${overview.agentCount}`,
      tasks: `${overview.taskCounts.total}`,
      tokens: totalTokens.toLocaleString(),
      uptime,
    };
  }, [overview, totalTokens]);

  const profile = useMemo(() => {
    if (!user) {
      return null;
    }
    const name =
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      user.email ||
      "Atlas Operator";
    const email = user.email ?? "";
    return { name, email };
  }, [user]);

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded flex items-center justify-center">
            <div className="w-6 h-6 rounded bg-foreground" />
          </div>
          <span className="text-xl font-semibold text-foreground">Atlas Forge</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm font-normal transition-colors",
                isActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-3 space-y-0.5">
        {bottomNav.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm font-normal transition-colors",
                isActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </NavLink>
        ))}
      </div>

      {/* Usage Stats */}
      <div className="border-t border-sidebar-border p-4 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground">Usage</div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Agents</span>
            <span className="text-foreground">{usage.agents}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tasks</span>
            <span className="text-foreground">{usage.tasks}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tokens</span>
            <span className="text-foreground">
              {tokensLastUpdated ? usage.tokens : "Tracking…"}
            </span>
          </div>
        </div>
        {usage.uptime && (
          <div className="text-xs text-muted-foreground">Uptime {usage.uptime}</div>
        )}
        {profile && (
          <div className="mt-4 rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-3">
            <div className="mt-2 text-sm font-medium text-foreground">{profile.name}</div>
            <div className="text-xs text-muted-foreground">{profile.email}</div>
          </div>
        )}
      </div>
    </div>
  );
}
