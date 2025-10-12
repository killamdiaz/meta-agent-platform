import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useAgentStore } from "@/store/agentStore";
import { StartNode } from "@/components/AgentNetwork/StartNode";
import { AgentNode } from "@/components/AgentNetwork/AgentNode";
import { ConfigPanel } from "@/components/AgentNetwork/ConfigPanel";
import { api } from "@/lib/api";
import type { AgentRecord } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { CreateAgentDrawer } from "@/components/AgentNetwork/CreateAgentDrawer";
import { useAgentGraphStore } from "@/store/agentGraphStore";
import useAgentGraphStream from "@/hooks/useAgentGraphStream";
import { cn } from "@/lib/utils";

const nodeTypes = {
  start: StartNode,
  agent: AgentNode,
};

const START_NODE: Node = {
  id: "start",
  type: "start",
  position: { x: 120, y: 200 },
  data: { label: "Start" },
  draggable: false,
};

const generatePosition = (index: number): { x: number; y: number } => {
  const spacingX = 260;
  const spacingY = 160;
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 360 + col * spacingX,
    y: 120 + row * spacingY,
  };
};

export default function AgentNetwork() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showMinimap, setShowMinimap] = useState(false);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useAgentGraphStream(true);
  const graphAgents = useAgentGraphStore((state) => state.agents);
  const graphLinks = useAgentGraphStore((state) => state.links);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    select: (response) => response.items,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    setPositions((current) => {
      const next = { ...current };
      let changed = false;
      agents.forEach((agent, index) => {
        if (!next[agent.id]) {
          next[agent.id] = generatePosition(index);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [agents]);

  const createAgentMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.createAgent>[0]) => api.createAgent(payload),
    onSuccess: (agent) => {
      toast({ title: "Agent created", description: `${agent.name} is now available.` });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create agent", description: error.message, variant: "destructive" });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.deleteAgent(id),
    onSuccess: () => {
      toast({ title: "Agent removed" });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete agent", description: error.message, variant: "destructive" });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<AgentRecord> & { objectives?: string[] } }) =>
      api.updateAgent(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update agent", description: error.message, variant: "destructive" });
    },
  });

  const selectedAgentId = useAgentStore((state) => state.selectedAgentId);
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const nodes: Node[] = useMemo(() => {
    return [
      START_NODE,
      ...agents.map((agent, index) => ({
        id: agent.id,
        type: "agent" as const,
        position: positions[agent.id] ?? generatePosition(index),
        data: {
          name: agent.name,
          status: agent.status,
          role: agent.role,
          isTalking: graphAgents[agent.id]?.isTalking ?? false,
        },
        selected: selectedAgentId === agent.id,
      })),
    ];
  }, [agents, positions, selectedAgentId, graphAgents]);

  const dynamicEdges = useMemo(() => {
    const agentIds = new Set(agents.map((agent) => agent.id));
    return Object.values(graphLinks)
      .filter((link) => agentIds.has(link.source) && agentIds.has(link.target))
      .map((link) => ({
        id: link.id,
        source: link.source,
        target: link.target,
        animated: link.isActive,
        style: {
          stroke: link.isActive ? "#facc15" : "#6366f1",
          strokeWidth: link.isActive ? 3 : 1.5,
          opacity: link.isActive ? 1 : 0.8,
        },
        data: { isActive: link.isActive },
      }));
  }, [graphLinks, agents]);

  const edges = useMemo(() => {
    const connectedTargets = new Set<string>();
    for (const edge of dynamicEdges) {
      connectedTargets.add(edge.target);
    }

    const baseEdges = agents
      .filter((agent) => !connectedTargets.has(agent.id))
      .map((agent) => ({
        id: `start-${agent.id}`,
        source: "start",
        target: agent.id,
        animated: false,
        style: { stroke: "#3b82f6", strokeWidth: 1.5, opacity: 0.6 },
      }));
    return [...baseEdges, ...dynamicEdges];
  }, [agents, dynamicEdges]);

  const updatePosition = useCallback((node: Node) => {
    setPositions((current) => {
      const previous = current[node.id];
      const nextPosition = { x: node.position.x, y: node.position.y };
      if (previous && previous.x === nextPosition.x && previous.y === nextPosition.y) {
        return current;
      }
      return { ...current, [node.id]: nextPosition };
    });
  }, []);

  const onNodeDrag = useCallback(
    (_event: any, node: Node) => {
      if (node.id === "start") return;
      updatePosition(node);
    },
    [updatePosition],
  );

  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      if (node.id === "start") return;
      updatePosition(node);
    },
    [updatePosition],
  );

  const onPaneClick = useCallback(() => {
    selectAgent(null);
  }, [selectAgent]);

  const onMove = useCallback(() => {
    setShowMinimap(true);
  }, []);

  return (
    <div className="h-screen w-full flex bg-[#0b0b0f]">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={onPaneClick}
          onMove={onMove}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0b0b0f] dot-grid-background"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#222"
            className="opacity-50"
          />
          <Controls className="bg-card/80 backdrop-blur-sm border border-border rounded-lg" />
          {showMinimap && (
            <MiniMap
              className="!bg-card/60 !backdrop-blur-sm border border-border/50 rounded-lg"
              maskColor="rgba(11, 11, 15, 0.6)"
              nodeColor={(node) => {
                if (node.type === "start") return "#10b981";
                return "#3b82f6";
              }}
            />
          )}
        </ReactFlow>

        <Button
          onClick={() => setCreateOpen(true)}
          disabled={isLoading}
          className="absolute bottom-6 right-6 rounded-full h-12 px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Agent
        </Button>
      </div>

      <div
        className={cn(
          "relative flex-shrink-0 overflow-hidden transition-all duration-500 ease-out",
          selectedAgent ? "w-[400px] max-w-[400px]" : "w-0 max-w-0 pointer-events-none"
        )}
      >
        <div
          className={cn(
            "h-full transform transition-transform duration-500 ease-out",
            selectedAgent ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
          )}
        >
          {selectedAgent && (
            <ConfigPanel
              agent={selectedAgent}
              onDelete={(id) => deleteAgentMutation.mutateAsync(id)}
              onUpdate={(id, updates) => updateAgentMutation.mutateAsync({ id, updates })}
              isDeleting={deleteAgentMutation.isPending}
              isSaving={updateAgentMutation.isPending}
            />
          )}
        </div>
      </div>

      <CreateAgentDrawer
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreateManual={async (payload) => {
          await createAgentMutation.mutateAsync(payload);
        }}
        onGenerateFromPrompt={async (prompt, options) => {
          const result = await api.buildAgentFromPrompt(prompt, options);
          toast({ title: "Agent generated", description: result.spec.name });
          queryClient.invalidateQueries({ queryKey: ["agents"] });
          return result;
        }}
      />
    </div>
  );
}
