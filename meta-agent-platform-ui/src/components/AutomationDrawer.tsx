import { useMemo } from "react";
import { X } from "lucide-react";
import ReactFlow, { Background, BackgroundVariant, Controls, MiniMap, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { useAgentGraphStore } from "@/store/agentGraphStore";
import type { AutomationPipeline } from "@/types/api";

interface AutomationDrawerProps {
  open: boolean;
  onClose: () => void;
  pipeline: AutomationPipeline | null;
  sessionId: string;
  status?: string;
}

const generatePosition = (index: number, total: number): { x: number; y: number } => {
  if (total <= 0) return { x: 0, y: 0 };
  const minRadius = 240;
  const desiredSpacing = 160;
  const radius = Math.max(minRadius, (total * desiredSpacing) / (2 * Math.PI));
  const angle = (index / total) * 2 * Math.PI;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
};

const formatNodeLabel = (node: { agent: string; type: string }) => `${node.agent} · ${node.type}`;

export function AutomationDrawer({ open, onClose, pipeline, sessionId, status }: AutomationDrawerProps) {
  const agents = useAgentGraphStore((state) => state.agents);
  const links = useAgentGraphStore((state) => state.links);

  const prefix = useMemo(() => `automation:${sessionId}:`, [sessionId]);

  const flowNodes = useMemo<Node[]>(() => {
    const automationAgents = Object.values(agents)
      .filter((agent) => agent.id.startsWith(prefix))
      .sort((a, b) => a.id.localeCompare(b.id));
    const total = automationAgents.length;
    if (total === 0) {
      return [];
    }

    return automationAgents.map((agent, index) => ({
      id: agent.id,
      data: { label: agent.name, role: agent.role },
      position: generatePosition(index, total),
      draggable: false,
      style: {
        borderRadius: 12,
        padding: "12px 16px",
        border: `1px solid rgba(148, 163, 184, 0.5)`,
        background: "rgba(15,23,42,0.7)",
        color: "rgb(226,232,240)",
        fontSize: 13,
      },
    }));
  }, [agents, prefix]);

  const flowEdges = useMemo<Edge[]>(() => {
    const automationLinks = Object.values(links).filter(
      (link) => link.source.startsWith(prefix) && link.target.startsWith(prefix),
    );
    return automationLinks.map((link) => ({
      id: link.id,
      source: link.source,
      target: link.target,
      animated: link.isActive,
      style: {
        strokeWidth: link.isActive ? 3 : 1.5,
        stroke: link.isActive ? "#facc15" : "#60a5fa",
      },
    }));
  }, [links, prefix]);

  const steps = useMemo(() => {
    if (!pipeline) return [];
    return pipeline.nodes.map((node, index) => ({
      index: index + 1,
      agent: node.agent,
      type: node.type,
    }));
  }, [pipeline]);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-50 transition ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
    >
      <div
        className={`absolute inset-0 bg-background/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`pointer-events-auto absolute right-0 top-0 flex h-full w-full max-w-4xl transform flex-col border-l border-border/70 bg-background/95 shadow-2xl transition-transform duration-500 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Automation Builder
            </div>
            <div className="text-lg font-semibold text-foreground">
              {pipeline?.name ?? "Live automation pipeline"}
            </div>
            {status && <div className="text-xs uppercase tracking-wide text-muted-foreground/80">Status: {status}</div>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close automation drawer">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="hidden w-72 flex-shrink-0 border-r border-border/60 bg-muted/20 lg:flex lg:flex-col">
            <div className="px-6 py-4 border-b border-border/60">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pipeline steps</div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground/80">
                  Describe an automation in the console to populate the canvas.
                </p>
              ) : (
                steps.map((step) => (
                  <div key={step.index} className="rounded-xl border border-border/50 bg-background/70 p-3 text-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Step {step.index}
                    </div>
                    <div className="mt-1 font-medium text-foreground">{formatNodeLabel(step)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex-1 relative">
            {flowNodes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground/80">
                Waiting for automation activity…
              </div>
            ) : (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                fitView
                panOnScroll
                panOnDrag
                zoomOnScroll
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <MiniMap pannable zoomable />
                <Controls />
                <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(148, 163, 184, 0.3)" />
              </ReactFlow>
            )}
          </div>
        </div>
        <div className="border-t border-border/60 px-6 py-3">
          <p className="text-xs text-muted-foreground/70">
            Pipelines stream live from the Agent Network. Provide credentials when prompted to unlock secure modules.
          </p>
        </div>
      </aside>
    </div>
  );
}
