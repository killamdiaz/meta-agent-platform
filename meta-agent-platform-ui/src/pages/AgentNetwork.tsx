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
import { Plus, Workflow, ChevronDown } from "lucide-react";
import { useAgentStore } from "@/store/agentStore";
import { StartNode } from "@/components/AgentNetwork/StartNode";
import { AgentNode } from "@/components/AgentNetwork/AgentNode";
import { ConfigPanel } from "@/components/AgentNetwork/ConfigPanel";
import { api } from "@/lib/api";
import type { AgentRecord, AutomationRecord, AutomationPipeline } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { CreateAgentDrawer } from "@/components/AgentNetwork/CreateAgentDrawer";
import { useAgentGraphStore } from "@/store/agentGraphStore";
import useAgentGraphStream from "@/hooks/useAgentGraphStream";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useAutomationPipelineStore } from "@/store/automationPipelineStore";

const nodeTypes = {
  start: StartNode,
  agent: AgentNode,
};

const START_NODE: Node = {
  id: "start",
  type: "start",
  position: { x: 0, y: 0 },
  data: { label: "Start" },
  draggable: false,
};

const generatePosition = (index: number, total: number): { x: number; y: number } => {
  if (total <= 0) return { x: 0, y: 0 };
  const minRadius = 320;
  const desiredSpacing = 180;
  const radius = Math.max(minRadius, (total * desiredSpacing) / (2 * Math.PI));
  const angle = (index / total) * 2 * Math.PI;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
};

const extractPipelineFromMetadata = (metadata: Record<string, unknown> | null | undefined): AutomationPipeline | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const pipelineCandidate = (metadata as { pipeline?: unknown }).pipeline;
  if (!pipelineCandidate || typeof pipelineCandidate !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(pipelineCandidate)) as AutomationPipeline;
  } catch {
    return null;
  }
};

export default function AgentNetwork() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showMinimap, setShowMinimap] = useState(false);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [automationName, setAutomationName] = useState("");
  const [automationType, setAutomationType] = useState("multi-agent");
  const [automationOpen, setAutomationOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("__new");
  const automationPipeline = useAutomationPipelineStore((state) => state.pipeline);
  const automationSessionId = useAutomationPipelineStore((state) => state.sessionId);
  const setSharedPipeline = useAutomationPipelineStore((state) => state.setPipeline);
  const clearSharedPipeline = useAutomationPipelineStore((state) => state.clear);

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
      const totalAgents = agents.length;
      agents.forEach((agent, index) => {
        if (!next[agent.id]) {
          next[agent.id] = generatePosition(index, totalAgents);
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
        position: positions[agent.id] ?? generatePosition(index, agents.length),
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

  const createAutomationMutation = useMutation({
    mutationFn: (payload: { name: string; type: string; metadata: Record<string, unknown> }) =>
      api.createAutomation({ name: payload.name, automation_type: payload.type, metadata: payload.metadata }),
    onSuccess: (record) => {
      toast({ title: "Automation created", description: record.name });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setSelectedAutomationId(record.id);
      setAutomationName(record.name);
      setAutomationType(record.automation_type);
      setAutomationOpen(false);
      setIsEditingName(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateAutomationMutation = useMutation({
    mutationFn: (payload: { id: string; name: string; type: string; metadata: Record<string, unknown> }) =>
      api.updateAutomation(payload.id, {
        name: payload.name,
        automation_type: payload.type,
        metadata: payload.metadata,
      }),
    onSuccess: (record) => {
      toast({ title: "Automation updated", description: record.name });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setAutomationName(record.name);
      setAutomationType(record.automation_type);
      setAutomationOpen(false);
      setIsEditingName(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update automation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const automationsQuery = useQuery({
    queryKey: ["automations"],
    queryFn: async () => {
      const response = await api.listAutomations();
      return response.items;
    },
    initialData: [] as AutomationRecord[],
  });

  const handleSelectAutomation = useCallback(
    (value: string) => {
      if (value === "__new") {
        setAutomationName("");
        setAutomationType("multi-agent");
        setSelectedAutomationId("__new");
        clearSharedPipeline();
        return;
      }
      const automation = automationsQuery.data?.find((entry) => entry.id === value);
      if (!automation) {
        return;
      }
      setSelectedAutomationId(automation.id);
      setAutomationName(automation.name);
      setAutomationType(automation.automation_type);
      const pipeline = extractPipelineFromMetadata(automation.metadata);
      if (pipeline) {
        setSharedPipeline(pipeline);
      } else {
        clearSharedPipeline();
        toast({
          title: "No pipeline stored",
          description: "This automation does not have a saved pipeline yet.",
        });
      }
    },
    [automationsQuery.data, clearSharedPipeline, setSharedPipeline, toast],
  );

  const isSavingAutomation = createAutomationMutation.isPending || updateAutomationMutation.isPending;

  const handleSaveAutomation = useCallback(() => {
    const trimmedName = automationName.trim();
    if (trimmedName.length < 2) {
      toast({
        title: "Name your automation",
        description: "Automation names must be at least two characters.",
        variant: "destructive",
      });
      return;
    }
    if (!automationPipeline) {
      toast({
        title: "No pipeline to save",
        description: "Build or load an automation in the Command Console first.",
        variant: "destructive",
      });
      return;
    }
    const metadata: Record<string, unknown> = {
      pipeline: automationPipeline,
    };
    if (automationSessionId) {
      metadata.sessionId = automationSessionId;
    }
    if (selectedAutomationId === "__new") {
      createAutomationMutation.mutate({
        name: trimmedName,
        type: automationType,
        metadata,
      });
    } else {
      updateAutomationMutation.mutate({
        id: selectedAutomationId,
        name: trimmedName,
        type: automationType,
        metadata,
      });
    }
  }, [
    automationName,
    automationPipeline,
    automationSessionId,
    automationType,
    createAutomationMutation,
    selectedAutomationId,
    toast,
    updateAutomationMutation,
  ]);

  useEffect(() => {
    if (automationsQuery.isLoading || automationsQuery.error) return;
    const automations = automationsQuery.data ?? [];
    if (!automations.length) {
      setSelectedAutomationId("__new");
      return;
    }
    const selected = automations.find((automation) => automation.id === selectedAutomationId);
    if (selected) {
      setAutomationName((prev) => (prev.trim().length > 0 ? prev : selected.name));
      setAutomationType(selected.automation_type);
      return;
    }
    const first = automations[0];
    setSelectedAutomationId(first.id);
    setAutomationName(first.name);
    setAutomationType(first.automation_type);
    if (!automationPipeline) {
      const pipeline = extractPipelineFromMetadata(first.metadata);
      if (pipeline) {
        setSharedPipeline(pipeline);
      }
    }
  }, [automationPipeline, automationsQuery.data, automationsQuery.isLoading, automationsQuery.error, selectedAutomationId, setSharedPipeline]);

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

        <Card className="absolute left-1/2 top-6 z-30 w-[420px] -translate-x-1/2 bg-black/40 backdrop-blur border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => setAutomationOpen((prev) => !prev)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Workflow className="h-5 w-5 text-white/80" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">Automation</Label>
                <span className="text-[11px] uppercase tracking-widest text-white/40">Alpha</span>
              </div>
              {isEditingName ? (
                <Input
                  autoFocus
                  value={automationName}
                  onChange={(event) => setAutomationName(event.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                  placeholder="Atlas launch playbook"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
              ) : (
                <button
                  type="button"
                  className="w-full text-sm font-medium text-white text-left hover:text-white/80"
                  onClick={() => setIsEditingName(true)}
                >
                  {automationName.trim() || "Name your automation"}
                </button>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-white/70 transition-transform duration-300",
                automationOpen ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
          {automationOpen && (
            <div className="space-y-4 border-t border-white/10 px-5 py-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Load existing</Label>
                <Select value={selectedAutomationId} onValueChange={handleSelectAutomation}>
                  <SelectTrigger className="border-white/10 bg-white/5 text-white">
                    <SelectValue placeholder="Select automation" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/80 backdrop-blur border-white/10 text-white">
                    {automationsQuery.data?.map((automation) => (
                      <SelectItem key={automation.id} value={automation.id}>
                        {automation.name}
                      </SelectItem>
                    )) ?? null}
                    <SelectItem value="__new">New automation…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Name</Label>
                <Input
                  value={automationName}
                  onChange={(event) => setAutomationName(event.target.value)}
                  placeholder="Atlas launch playbook"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Template</Label>
                <Select value={automationType} onValueChange={setAutomationType}>
                  <SelectTrigger className="border-white/10 bg-white/5 text-white">
                    <SelectValue placeholder="Automation type" />
                  </SelectTrigger>
                  <SelectContent className="bg-black/80 backdrop-blur border-white/10 text-white">
                    <SelectItem value="multi-agent">Multi-agent orchestration</SelectItem>
                    <SelectItem value="tool-chain">Tool chain</SelectItem>
                    <SelectItem value="alert">Alert & escalation</SelectItem>
                    <SelectItem value="custom">Custom workflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Current pipeline</Label>
                {automationPipeline ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
                    <ol className="space-y-1 text-xs">
                      {automationPipeline.nodes.map((node, index) => (
                        <li key={node.id} className="flex items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/60">
                            {index + 1}
                          </span>
                          <span className="font-medium text-white/90">[{node.type}]</span>
                          <span>{node.agent}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="text-xs text-white/60">
                    Build an automation in the Command Console to save it here.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  className="text-white/70 hover:bg-white/10"
                  onClick={() => setAutomationOpen(false)}
                >
                  Close
                </Button>
                <Button
                  className="bg-white/10 hover:bg-white/20 text-white"
                  disabled={isSavingAutomation || !automationPipeline}
                  onClick={handleSaveAutomation}
                >
                  {selectedAutomationId === "__new"
                    ? isSavingAutomation
                      ? "Saving…"
                      : "Save automation"
                    : isSavingAutomation
                    ? "Updating…"
                    : "Update automation"}
                </Button>
              </div>
            </div>
          )}
        </Card>

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
