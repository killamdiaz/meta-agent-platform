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
import DataSources from "./pages/DataSources";
import Billing from "./pages/Billing";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useSupabaseTokenSync } from "@/hooks/useSupabaseTokenSync";
import useAgentGraphStream from "@/hooks/useAgentGraphStream";

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

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {!hideSidebar && <AppSidebar />}
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Overview />} />
            <Route path="/network" element={<AgentNetwork />} />
            <Route path="/memory" element={<MemoryGraph />} />
            <Route path="/multi-agent" element={<MultiAgentConsole />} />
            <Route path="/console" element={<CommandConsole />} />
            <Route path="/multi-agent/runtime" element={<ToolAgentConsole />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/data-sources" element={<DataSources />} />
            <Route path="/help" element={<Help />} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
};

const App = () => {
  useSupabaseTokenSync();
  useAgentGraphStream(true);

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
