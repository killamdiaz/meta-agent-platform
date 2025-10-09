import { ForceGraph2DComponent } from "@/components/MemoryGraph/ForceGraph2D";
import { Legend } from "@/components/MemoryGraph/Legend";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBaseUrl } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function MemoryGraph() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["memory", "graph"],
    queryFn: () => api.fetchMemoryGraph(),
    refetchInterval: 60_000,
  });

  const graphData = data ?? { nodes: [], links: [] };

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      return;
    }
    const path = "/memory/stream";
    const url = apiBaseUrl ? `${apiBaseUrl}${path}` : path;
    const source = new window.EventSource(url);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "memory.created") {
          queryClient.invalidateQueries({ queryKey: ["memory", "graph"] });
        }
      } catch (error) {
        console.error("Failed to parse memory stream payload", error);
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [queryClient]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex gap-2">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Overview
              </Button>
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Requests
              </Button>
              <Button variant="ghost" className="bg-muted text-foreground">
                Memory Graph
              </Button>
            </div>
            <Button variant="outline" className="border-border hover:border-atlas-glow/50 gap-2">
              <span className="text-sm">Latest</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-4 pb-4">
          <div className="h-full w-full rounded-3xl border border-border/60 bg-muted/10 relative overflow-hidden">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Skeleton className="h-32 w-32 rounded-full" />
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <p className="text-sm">No memory nodes available yet.</p>
                <p className="text-xs">Run agents to populate the knowledge graph.</p>
              </div>
            ) : (
              <ForceGraph2DComponent data={graphData} />
            )}
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 border-l border-border bg-background">
        <Legend data={graphData} />
      </aside>
    </div>
  );
}
