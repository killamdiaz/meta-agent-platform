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
import type { AgentRecord, AgentConfigField } from "@/types/api";
import { useAgentStore } from "@/store/agentStore";
import { Loader2, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import DynamicAgentConfigForm from "./DynamicAgentConfigForm";
import { useToast } from "@/components/ui/use-toast";

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
  const idSuffix = agent?.id ?? "agent";
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [objectives, setObjectives] = useState("");
  const [memoryContext, setMemoryContext] = useState("");
  const [status, setStatus] = useState<AgentRecord["status"]>("idle");
  const [internetAccess, setInternetAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSaving, setLocalSaving] = useState(false);
  const [localDeleting, setLocalDeleting] = useState(false);
  const [configSchema, setConfigSchema] = useState<AgentConfigField[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [configType, setConfigType] = useState<string>("");
  const [configSummary, setConfigSummary] = useState<string>("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configErrorMsg, setConfigErrorMsg] = useState<string | null>(null);
  const [configInferenceLoading, setConfigInferenceLoading] = useState(false);

  const { toast } = useToast();

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
    setConfigSchema(agent.config?.schema ?? []);
    setConfigValues(agent.config?.values ?? {});
    setConfigType(agent.config?.agentType ?? agent.agent_type ?? agent.role);
    setConfigSummary(agent.config?.summary ?? agent.config_summary ?? "");
    setConfigMessage(null);
    setConfigErrorMsg(null);
  }, [agent]);

  const { data: memoryData, isFetching: memoryLoading } = useQuery({
    queryKey: ["agents", agent?.id, "memory"],
    queryFn: () => api.getAgentMemory(agent!.id, 10),
    enabled: Boolean(agent?.id),
    refetchInterval: 30_000,
  });

  const {
    data: configData,
    isFetching: configLoading,
    refetch: refetchConfig,
  } = useQuery({
    queryKey: ["agent-config", agent?.id],
    queryFn: () => api.fetchAgentConfig(agent!.id),
    enabled: Boolean(agent?.id),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!configData) return;
    setConfigSchema(configData.configSchema ?? []);
    setConfigValues(configData.values ?? {});
    setConfigType(configData.agentType ?? agent?.agent_type ?? agent?.role ?? "");
    setConfigSummary(configData.description ?? agent?.config_summary ?? "");
    setConfigMessage(null);
    setConfigErrorMsg(null);
  }, [configData, agent?.agent_type, agent?.config_summary, agent?.role]);

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

  const handleSaveConfig = async () => {
    if (!agent || configSchema.length === 0) return;
    setConfigSaving(true);
    setConfigMessage(null);
    setConfigErrorMsg(null);
    try {
      await api.updateAgentConfig(agent.id, {
        agentType: configType || agent.agent_type || agent.role,
        summary: configSummary || agent.config_summary || agent.role,
        schema: configSchema,
        values: configValues,
      });
      setConfigMessage("Configuration saved");
      toast({ title: "Configuration updated", description: `${agent.name} can now use its tools.` });
      await refetchConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update configuration";
      setConfigErrorMsg(message);
      toast({ title: "Configuration error", description: message, variant: "destructive" });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleGenerateConfig = async () => {
    if (!agent) return;
    setConfigInferenceLoading(true);
    setConfigErrorMsg(null);
    setConfigMessage(null);
    try {
      const template = await api.generateAgentConfig(agent.role || agent.name, {
        existingAgents: [],
        preferredTools: Object.keys(agent.tools ?? {}),
      });
      setConfigSchema(template.configSchema ?? []);
      setConfigValues(template.defaults ?? {});
      setConfigType(template.agentType ?? agent.agent_type ?? agent.role);
      setConfigSummary(template.description ?? agent.config_summary ?? "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to infer configuration";
      setConfigErrorMsg(message);
      toast({ title: "Could not infer config", description: message, variant: "destructive" });
    } finally {
      setConfigInferenceLoading(false);
    }
  };

  if (!agent) {
    return null;
  }

  return (
    <div className="w-[380px] h-full bg-card border-l border-border flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
        <Label htmlFor={`field-${idSuffix}-name`}>Name</Label>
        <Input
          id={`field-${idSuffix}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="bg-background border-border"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`field-${idSuffix}-role`}>Instructions</Label>
        <Textarea
          id={`field-${idSuffix}-role`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="bg-background border-border min-h-[120px]"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`field-${idSuffix}-status`}>Status</Label>
        </div>
        <Select
          value={status}
          onValueChange={(value: AgentRecord["status"]) => setStatus(value)}
        >
          <SelectTrigger id={`field-${idSuffix}-status`} className="bg-background border-border">
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
          <Label className="text-sm" htmlFor={`field-${idSuffix}-internet`}>Autonomous internet access</Label>
          <p className="text-xs text-muted-foreground">
            Toggle to allow this agent to call the sandboxed internet module. Disabled by default.
          </p>
        </div>
        <Switch id={`field-${idSuffix}-internet`} checked={internetAccess} onCheckedChange={setInternetAccess} />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`field-${idSuffix}-objectives`}>Objectives</Label>
        <Textarea
          id={`field-${idSuffix}-objectives`}
          placeholder="One per line"
          value={objectives}
          onChange={(event) => setObjectives(event.target.value)}
          className="bg-background border-border min-h-[120px]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`field-${idSuffix}-memory`}>Memory context</Label>
        <Textarea
          id={`field-${idSuffix}-memory`}
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

      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm" htmlFor={`field-${idSuffix}-tool-config`}>
              Tool configuration
            </Label>
            <p className="text-xs text-muted-foreground">Store sandbox credentials securely per agent.</p>
          </div>
          {(configLoading || configInferenceLoading) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {configErrorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{configErrorMsg}</span>
          </div>
        )}

        {configSchema.length === 0 ? (
          <Button
            variant="outline"
            onClick={handleGenerateConfig}
            disabled={configInferenceLoading}
            className="w-full"
          >
            {configInferenceLoading ? "Detecting configuration..." : "Detect configuration fields"}
          </Button>
        ) : (
          <div className="space-y-3">
            <DynamicAgentConfigForm
              schema={configSchema}
              values={configValues}
              onChange={(next) => {
                setConfigValues(next);
                setConfigMessage(null);
              }}
              defaults={undefined}
              disabled={configSaving}
            />
            <div className="flex items-center justify-between">
              {configMessage && (
                <span className="inline-flex items-center gap-2 text-xs text-atlas-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {configMessage}
                </span>
              )}
              <Button onClick={handleSaveConfig} disabled={configSaving}>
                {configSaving ? "Saving..." : "Save configuration"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2" id={`field-${idSuffix}-recent-memory`}>
        <div className="flex items-center justify-between">
          <Label>Recent memory</Label>
          {memoryLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="space-y-3">
          {(memoryData?.items ?? []).slice(0, 5).map((entry) => {
            const retention = (entry.metadata?.retention ?? {}) as {
              reason?: unknown;
              expiresAt?: unknown;
            };
            const retentionReason = typeof retention.reason === "string" ? retention.reason : null;
            const expiresAtRaw =
              entry.memory_type === "short_term"
                ? (typeof retention.expiresAt === "string" ? retention.expiresAt : entry.expires_at)
                : null;
            const expiresAtDate = expiresAtRaw ? new Date(expiresAtRaw) : null;

            const badgeStyles =
              entry.memory_type === "short_term"
                ? "bg-sky-500/15 text-sky-300 border border-sky-500/40"
                : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";

            return (
              <div key={entry.id} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-foreground line-clamp-3">{entry.content}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${badgeStyles}`}>
                    {entry.memory_type === "short_term" ? "STM" : "LTM"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                  <span>
                    {entry.memory_type === "short_term"
                      ? expiresAtDate
                        ? `Expires ${expiresAtDate.toLocaleString()}`
                        : "Short-term context"
                      : `Captured ${new Date(entry.created_at).toLocaleString()}`}
                  </span>
                  {retentionReason && <span className="italic">Reason: {retentionReason}</span>}
                </div>
              </div>
            );
          })}
          {(!memoryData || memoryData.items.length === 0) && !memoryLoading && (
            <p className="text-xs text-muted-foreground">No memory captured yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-2" id={`field-${idSuffix}-task-summary`}>
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

      </div>
      <div className="border-t border-border/60 p-4">
        <Button onClick={handleSave} disabled={localSaving || isSaving} className="w-full">
          {localSaving || isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
