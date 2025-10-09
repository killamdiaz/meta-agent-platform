import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentRecord } from "@/types/api";
import { useAgentStore } from "@/store/agentStore";
import { Loader2, Trash2 } from "lucide-react";

interface ConfigPanelProps {
  agent: AgentRecord | null;
  onUpdate: (
    id: string,
    updates: Partial<Pick<AgentRecord, "name" | "role" | "memory_context" | "status" | "internet_access_enabled">> & {
      objectives?: string[];
    }
  ) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isSaving?: boolean;
  isDeleting?: boolean;
}

const statusOptions: AgentRecord["status"][] = ["idle", "working", "error"];

export function ConfigPanel({ agent, onUpdate, onDelete, isSaving, isDeleting }: ConfigPanelProps) {
  const selectAgent = useAgentStore((state) => state.selectAgent);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [objectives, setObjectives] = useState("");
  const [memoryContext, setMemoryContext] = useState("");
  const [status, setStatus] = useState<AgentRecord["status"]>("idle");
  const [internetAccess, setInternetAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSaving, setLocalSaving] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);

  useEffect(() => {
    if (!agent) {
      setName("");
      setRole("");
      setObjectives("");
      setMemoryContext("");
      setStatus("idle");
      setError(null);
      return;
    }
    setName(agent.name);
    setRole(agent.role);
    const objectivesArray = Array.isArray(agent.objectives)
      ? agent.objectives
      : typeof agent.objectives === "string"
      ? [agent.objectives]
      : [];
    setObjectives(objectivesArray.join("\n"));
    setMemoryContext(agent.memory_context ?? "");
    setStatus(agent.status ?? "idle");
    setInternetAccess(Boolean(agent.internet_access_enabled));
    setError(null);
  }, [agent]);

  const { data: memoryData, isFetching: memoryLoading } = useQuery({
    queryKey: ["agents", agent?.id, "memory"],
    queryFn: () => api.getAgentMemory(agent!.id, 10),
    enabled: Boolean(agent?.id),
    refetchInterval: 30_000,
  });

  const tools = useMemo(() => {
    if (!agent?.tools) return [];
    return Object.entries(agent.tools)
      .filter(([key, value]) => Boolean(key) && Boolean(value))
      .map(([key]) => key);
  }, [agent]);

  const handleSave = async () => {
    if (!agent) return;
    setLocalSaving(true);
    setError(null);
    try {
      const updatedObjectives = objectives
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      await onUpdate(agent.id, {
        name: name.trim(),
        role: role.trim(),
        objectives: updatedObjectives,
        memory_context: memoryContext.trim(),
        status,
        internet_access_enabled: internetAccess,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setLocalSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent) return;
    setLocalDeleting(true);
    setError(null);
    try {
      await onDelete(agent.id);
      selectAgent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setLocalDeleting(false);
    }
  };

  if (!agent) {
    return (
      <div className="w-[380px] bg-card border-l border-border p-6 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Select an agent to configure</p>
      </div>
    );
  }

  return (
    <div className="w-[380px] bg-card border-l border-border p-6 space-y-6 overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{agent.name}</h2>
          <p className="text-xs text-muted-foreground mt-1">Manage sandbox access, goals, and routing.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDelete}
          disabled={localDeleting || isDeleting}
        >
          {localDeleting || isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-name">Name</Label>
        <Input
          id="agent-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="bg-background border-border"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-role">Instructions</Label>
        <Textarea
          id="agent-role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="bg-background border-border min-h-[120px]"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="agent-status">Status</Label>
        </div>
        <Select value={status} onValueChange={(value: AgentRecord["status"]) => setStatus(value)}>
          <SelectTrigger className="bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {statusOptions.map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-3">
        <div>
          <Label className="text-sm">Autonomous internet access</Label>
          <p className="text-xs text-muted-foreground">
            Toggle to allow this agent to call the sandboxed internet module. Disabled by default.
          </p>
        </div>
        <Switch checked={internetAccess} onCheckedChange={setInternetAccess} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-objectives">Objectives</Label>
        <Textarea
          id="agent-objectives"
          placeholder="One per line"
          value={objectives}
          onChange={(event) => setObjectives(event.target.value)}
          className="bg-background border-border min-h-[120px]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-memory">Memory context</Label>
        <Textarea
          id="agent-memory"
          placeholder="Persistent context shared with the sandbox"
          value={memoryContext}
          onChange={(event) => setMemoryContext(event.target.value)}
          className="bg-background border-border min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <Label>Tools</Label>
        {tools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tools configured</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tools.map((tool) => (
              <span key={tool} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Recent memory</Label>
          {memoryLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="space-y-3">
          {(memoryData?.items ?? []).slice(0, 5).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs text-foreground line-clamp-3">{entry.content}</p>
              <p className="text-[10px] text-muted-foreground mt-2">
                {new Date(entry.created_at).toLocaleString()}
              </p>
            </div>
          ))}
          {(!memoryData || memoryData.items.length === 0) && !memoryLoading && (
            <p className="text-xs text-muted-foreground">No memory captured yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Task summary</Label>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.entries(memoryData?.taskCounts ?? {}).map(([key, value]) => (
            <div key={key} className="rounded border border-border/60 bg-muted/10 p-2 text-center">
              <p className="font-semibold text-foreground">{value}</p>
              <p className="text-muted-foreground capitalize">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button onClick={handleSave} disabled={localSaving || isSaving} className="w-full">
        {localSaving || isSaving ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}
