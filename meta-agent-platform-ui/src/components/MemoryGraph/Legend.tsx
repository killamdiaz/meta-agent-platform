import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { GraphData } from "@/types/graph";

interface LegendProps {
  data: GraphData;
}

export function Legend({ data }: LegendProps) {
  const stats = {
    memories: data.nodes.filter(n => n.type === "memory").length,
    documents: data.nodes.filter(n => n.type === "document").length,
    connections: data.links.length,
  };

  return (
    <Card className="bg-card border-border w-80 h-full overflow-y-auto">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Legend</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="p-4 space-y-6">
        {/* Statistics */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Statistics
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-atlas-glow" />
              <span className="text-foreground">{stats.memories} memories</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <span className="text-foreground">{stats.documents} documents</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-foreground">{data.nodes.filter(n => n.type === "agent").length} agents</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 bg-atlas-glow/30 rounded" />
              <span className="text-foreground">{stats.connections} connections</span>
            </div>
          </div>
        </div>

        {/* Nodes */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Nodes
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded bg-purple-500/80" />
              <span className="text-foreground">Document</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-atlas-glow" />
              <span className="text-foreground">Memory (latest)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-foreground">Memory (older)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rotate-45 bg-green-500" />
              <span className="text-foreground">Agent</span>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Status
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-foreground">Forgotten</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-foreground">Expiring soon</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-atlas-glow animate-pulse-glow" />
              <span className="text-foreground">New memory</span>
            </div>
          </div>
        </div>

        {/* Connections */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Connections
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-8 h-0.5 bg-atlas-glow" />
              <span className="text-foreground">Doc → Memory</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-8 h-0.5 bg-atlas-glow/50" style={{ borderTop: "1px dashed" }} />
              <span className="text-foreground">Doc similarity</span>
            </div>
          </div>
        </div>

        {/* Relations */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Relations
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-8 h-0.5 bg-blue-400" />
              <span className="text-foreground">Updates</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-8 h-0.5 bg-purple-400" />
              <span className="text-foreground">Extends</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-8 h-0.5 bg-green-400" />
              <span className="text-foreground">Derives</span>
            </div>
          </div>
        </div>

        {/* Similarity */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Similarity
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-atlas-glow/30" />
              <span className="text-foreground">Weak</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-atlas-glow" />
              <span className="text-foreground">Strong</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
