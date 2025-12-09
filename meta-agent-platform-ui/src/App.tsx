import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppSidebar } from "./components/AppSidebar";
import Overview from "./pages/Overview";
import AgentNetwork from "./pages/AgentNetwork";
import CommandConsole from "./pages/CommandConsole";
import MemoryGraph from "./pages/MemoryGraph";
import MultiAgentConsole from "./pages/MultiAgentConsole";
import ToolAgentConsole from "./pages/ToolAgentConsole";
import Settings from "./pages/Settings";
import Integrations from "./pages/Integrations";
import Exhausts from "./pages/Exhausts";
import DataSources from "./pages/DataSources";
import Billing from "./pages/Billing";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useSupabaseTokenSync } from "@/hooks/useSupabaseTokenSync";
import useAgentGraphStream from "@/hooks/useAgentGraphStream";
import { LicenseBanner } from "@/components/LicenseBanner";
import { useLicenseStatus } from "@/hooks/useLicenseStatus";
import { useBrandStore } from "@/store/brandStore";
import { api } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AppRoutes = () => {
  const location = useLocation();
  const hideSidebar = location.pathname.startsWith("/login") || location.pathname.startsWith("/auth");
  const { data: license, isExpired, isWarning } = useLicenseStatus();
  const engineName = useBrandStore(
    (state) => `${state.companyName?.trim() || "Atlas"} Engine`,
  );
  const banner = isExpired
    ? { kind: "expired" as const, message: "Important: Licence expired" }
    : isWarning
      ? { kind: "warning" as const, message: "Important: Licence usage almost full" }
      : null;

  const content = (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<CommandConsole />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/network" element={<AgentNetwork />} />
        <Route path="/memory" element={<MemoryGraph />} />
        <Route path="/multi-agent" element={<MultiAgentConsole />} />
        <Route path="/console" element={<CommandConsole />} />
        <Route path="/multi-agent/runtime" element={<ToolAgentConsole />} />
            <Route path="/exhausts" element={<Exhausts />} />
            <Route path="/exhausts/:streamId" element={<Exhausts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/data-sources" element={<DataSources />} />
        <Route path="/help" element={<Help />} />
      </Route>

      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  return (
    <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
      {banner && <LicenseBanner kind={banner.kind} message={banner.message} />}
      <div className="flex flex-1 min-h-0">
        {!hideSidebar && <AppSidebar />}
        <div className="flex-1 overflow-y-auto relative">
          {isExpired && (
            <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-lg font-semibold">Important: Liscence expired</p>
              <p className="text-sm text-muted-foreground">
                Your token allowance has been exhausted or the license is invalid. Please renew your license to continue using {engineName}.
              </p>
              <a
                href="/settings"
                className="text-primary underline font-medium"
              >
                Go to Settings
              </a>
            </div>
          )}
          <div className={isExpired ? "pointer-events-none opacity-60" : ""}>{content}</div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  useSupabaseTokenSync();
  useAgentGraphStream(true);
  const setBranding = useBrandStore((state) => state.setBranding);

  useEffect(() => {
    api
      .fetchBranding()
      .then((data) => {
        setBranding({
          companyName: data.companyName,
          shortName: data.shortName,
          logoUrl: data.logoData || undefined,
          sidebarLogoUrl: data.sidebarLogoData || undefined,
          faviconUrl: data.faviconData || undefined,
          loginLogoUrl: data.loginLogoData || undefined,
          showSidebarText: data.showSidebarText ?? true,
        });
      })
      .catch((err) => console.warn("[branding] hydrate failed", err));
  }, [setBranding]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
