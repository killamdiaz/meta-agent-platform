import { Handle, Position } from "reactflow";
import { Bot } from "lucide-react";
import { useAgentStore } from "@/store/agentStore";

interface AgentNodeProps {
  id: string;
  data: {
    name: string;
    status: string;
    role?: string;
    isTalking?: boolean;
    isVirtual?: boolean;
    sourceId?: string;
  };
  selected?: boolean;
}

const statusColor: Record<string, string> = {
  idle: "bg-muted",
  working: "bg-atlas-success",
  error: "bg-destructive",
};

export function AgentNode({ id, data, selected }: AgentNodeProps) {
  const selectAgent = useAgentStore((state) => state.selectAgent);

  const badgeColor = statusColor[data.status] ?? "bg-muted";
  const talking = Boolean(data.isTalking);
  const targetId = data.sourceId ?? id;
  const isVirtual = Boolean(data.isVirtual);

  return (
    <div
      onClick={() => selectAgent(targetId)}
      className={`px-6 py-3 rounded-full border flex items-center gap-3 cursor-pointer transition-all hover:shadow-lg hover:shadow-primary/20 min-w-[200px] ${
        selected ? "bg-card border-primary shadow-lg shadow-primary/30" : "bg-card border-border hover:border-primary/50"
      } ${
        talking ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-background" : ""
      } ${isVirtual ? "opacity-90 backdrop-blur-sm" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-primary/20"
      />
      <div className={`w-2 h-2 rounded-full ${badgeColor}`} />
      <Bot className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col flex-1">
        <span className="text-sm font-medium text-foreground">{data.name}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[140px]">{data.role}</span>
      </div>
      {talking && <span className="text-xs mr-1">💬</span>}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-primary/20 ml-2"
      />
    </div>
  );
}
