import { ForceGraph2DComponent } from "@/components/MemoryGraph/ForceGraph2D";
import { Legend } from "@/components/MemoryGraph/Legend";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

export default function MemoryGraph() {
  const { data, isLoading } = useQuery({
    queryKey: ["memory", "graph"],
    queryFn: () => api.fetchMemoryGraph(),
    refetchInterval: 60_000,
  });

  const graphData = data ?? { nodes: [], links: [] };

  return (
    <div className="relative h-screen flex">
      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between p-4">
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

        <div className="h-full pt-16">
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Skeleton className="h-40 w-40 rounded-full" />
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

      <div className="w-80 border-l border-border">
        <Legend data={graphData} />
      </div>
    </div>
  );
}
