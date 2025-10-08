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
        data: { name: agent.name, status: agent.status, role: agent.role },
        selected: selectedAgentId === agent.id,
      })),
    ];
  }, [agents, positions, selectedAgentId]);

  const edges = useMemo(
    () =>
      agents.map((agent) => ({
        id: `start-${agent.id}`,
        source: "start",
        target: agent.id,
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 2 },
      })),
    [agents],
  );

  const onNodeDragStop = useCallback((_event: any, node: Node) => {
    if (node.id === "start") return;
    setPositions((current) => ({ ...current, [node.id]: { x: node.position.x, y: node.position.y } }));
  }, []);

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

      <ConfigPanel
        agent={selectedAgent}
        onDelete={(id) => deleteAgentMutation.mutateAsync(id)}
        onUpdate={(id, updates) => updateAgentMutation.mutateAsync({ id, updates })}
        isDeleting={deleteAgentMutation.isPending}
        isSaving={updateAgentMutation.isPending}
      />

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
