import { useEffect, useMemo } from "react";
import {
  Network,
  LayoutDashboard,
  MessageSquare,
  Settings,
  HelpCircle,
  Brain,
  Users,
  Radio,
  Boxes,
  Database,
  Coins,
  Activity,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { formatDistanceToNowStrict } from "date-fns";
import { useTokenStore } from "@/store/tokenStore";
import { useBrandStore } from "@/store/brandStore";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const baseNavigation = [
  { name: "Agent Network", href: "/network", icon: Network },
  { name: "Memory Graph", href: "/memory", icon: Brain },
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Exhausts", href: "/exhausts", icon: Activity },
  { name: "Tool Agents", href: "/multi-agent/runtime", icon: Radio },
];

const bottomNav = [
  { name: "Integrations", href: "/integrations", icon: Boxes },
  { name: "Data Sources", href: "/data-sources", icon: Database },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Billing", href: "/billing", icon: Coins },
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
  const brandPrefix = useBrandStore((state) => state.companyName?.trim() || "Atlas");
  const brandLogo = useBrandStore(
    (state) => state.sidebarLogoUrl || state.logoUrl || state.loginLogoUrl || "/icon.png",
  );
  const engineName = `${brandPrefix} Engine`;
  const showSidebarText = useBrandStore((state) => state.showSidebarText ?? true);
  const pilotName = `${brandPrefix} Pilot`;
  const { user, signOut } = useAuth();
  const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? null;

  useEffect(() => {
    if (overview?.tokenUsage) {
      setTokenUsage(overview.tokenUsage);
    }
  }, [overview, setTokenUsage]);

  const { data: usageSummary } = useQuery({
    queryKey: ["usage", "summary", orgId],
    queryFn: () => api.fetchUsageSummary(orgId as string),
    enabled: Boolean(orgId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (usageSummary?.total_tokens !== undefined) {
      setTokenUsage({
        total: Number(usageSummary.total_tokens) || 0,
        byAgent: {},
      });
    }
  }, [usageSummary, setTokenUsage]);

  useEffect(() => {
    if (tokensLastUpdated || !orgId) return;
    void api
      .fetchUsageSummary(orgId)
      .then((data) => {
        if (data?.total_tokens !== undefined) {
          setTokenUsage({ total: Number(data.total_tokens) || 0, byAgent: {} });
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [orgId, setTokenUsage, tokensLastUpdated]);

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
      `${brandPrefix} Operator`;
    const email = user.email ?? "";
    return { name, email };
  }, [brandPrefix, user]);
  const navigate = useNavigate();
  const navigation = useMemo(
    () => [{ name: pilotName, href: "/", icon: MessageSquare }, ...baseNavigation],
    [pilotName],
  );

  const logoOnly = !showSidebarText;

  return (
    <div className="flex h-screen w-64 flex-shrink-0 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <div
          className={cn(
            "flex items-center gap-2",
            logoOnly && "justify-center gap-0 w-full",
          )}
        >
          <img
            src={brandLogo}
            alt={`${engineName} logo`}
            className={cn(
              "rounded-md shadow-sm",
              logoOnly
                ? "h-10 max-h-10 w-auto max-w-[180px] object-contain"
                : "h-8 w-8 object-cover",
            )}
          />
          {showSidebarText ? (
            <span className="text-xl font-semibold text-foreground">{engineName}</span>
          ) : (
            <span className="sr-only">{engineName}</span>
          )}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-4 w-full text-left rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-3 hover:bg-sidebar-accent transition-colors"
              >
                <div className="mt-2 text-sm font-medium text-foreground">{profile.name}</div>
                <div className="text-xs text-muted-foreground">{profile.email}</div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  navigate("/settings");
                }}
              >
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500"
                onClick={async () => {
                  await signOut();
                  navigate("/login");
                }}
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
