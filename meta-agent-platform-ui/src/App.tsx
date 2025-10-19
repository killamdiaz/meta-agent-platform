import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppSidebar } from "./components/AppSidebar";
import Overview from "./pages/Overview";
import AgentNetwork from "./pages/AgentNetwork";
import CommandConsole from "./pages/CommandConsole";
import MemoryGraph from "./pages/MemoryGraph";
import MultiAgentConsole from "./pages/MultiAgentConsole";
import ToolAgentConsole from "./pages/ToolAgentConsole";
import Settings from "./pages/Settings";
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

const App = () => {
  useSupabaseTokenSync();
  useAgentGraphStream(true);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex min-h-screen w-full bg-background">
            <AppSidebar />
            <div className="flex-1">
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
                  <Route path="/help" element={<Help />} />
                </Route>

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
