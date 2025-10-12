import { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { AgentConfigField, BuildAgentResult } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";
import DynamicAgentConfigForm from "./DynamicAgentConfigForm";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface CreateAgentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateManual: (payload: {
    name: string;
    role: string;
    tools: Record<string, boolean>;
    objectives: string[];
    memory_context?: string;
  }) => Promise<void>;
  onGenerateFromPrompt: (
    prompt: string,
    options?: { persist?: boolean; spawn?: boolean; creator?: string }
  ) => Promise<BuildAgentResult>;
}

export function CreateAgentDrawer({
  open,
  onOpenChange,
  onCreateManual,
  onGenerateFromPrompt,
}: CreateAgentDrawerProps) {
  const [tab, setTab] = useState<"natural" | "manual">("natural");

  const [manualName, setManualName] = useState("");
  const [manualRole, setManualRole] = useState("Generalist Agent");
  const [manualObjectives, setManualObjectives] = useState("");
  const [manualTools, setManualTools] = useState("");
  const [manualMemoryContext, setManualMemoryContext] = useState("");
  const [manualInternetAccess, setManualInternetAccess] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [spawnNow, setSpawnNow] = useState(false);
  const [naturalLoading, setNaturalLoading] = useState(false);
  const [naturalError, setNaturalError] = useState<string | null>(null);
  const [result, setResult] = useState<BuildAgentResult | null>(null);
  const [configTemplate, setConfigTemplate] = useState<{
    agentType: string;
    description: string;
    configSchema: AgentConfigField[];
    defaults?: Record<string, unknown>;
  } | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resetState = () => {
    setManualName("");
    setManualRole("Generalist Agent");
    setManualObjectives("");
    setManualTools("");
    setManualMemoryContext("");
    setManualInternetAccess(false);
    setManualLoading(false);
    setManualError(null);
    setPrompt("");
    setSpawnNow(false);
    setNaturalLoading(false);
    setNaturalError(null);
    setResult(null);
    setConfigTemplate(null);
    setConfigValues({});
    setConfigLoading(false);
    setConfigSaving(false);
    setConfigError(null);
    setConfigSuccess(false);
    setTab("natural");
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      resetState();
    }
    onOpenChange(value);
  };

  const handleManualSubmit = async () => {
    if (!manualName.trim()) {
      setManualError("Name is required");
      return;
    }

    setManualError(null);
    setManualLoading(true);
    try {
      const tools = manualTools
        .split(/[,\n]/)
        .map((tool) => tool.trim())
        .filter(Boolean)
        .reduce<Record<string, boolean>>((acc, tool) => {
          acc[tool] = true;
          return acc;
        }, {});

      const objectives = manualObjectives
        .split(/\n/)
        .map((objective) => objective.trim())
        .filter(Boolean);

      await onCreateManual({
        name: manualName.trim(),
        role: manualRole.trim() || "Generalist Agent",
        tools,
        objectives,
        memory_context: manualMemoryContext.trim() || undefined,
        internet_access_enabled: manualInternetAccess,
      });
      resetState();
      onOpenChange(false);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Failed to create agent");
    } finally {
      setManualLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setNaturalError("Describe the agent you want to build");
      return;
    }

    setNaturalError(null);
    setConfigTemplate(null);
    setConfigValues({});
    setConfigError(null);
    setConfigSuccess(false);
    setNaturalLoading(true);
    setConfigLoading(true);
    try {
      const description = prompt.trim();
      const generated = await onGenerateFromPrompt(description, {
        persist: true,
        spawn: spawnNow || undefined,
        creator: "atlas-ui",
      });
      setResult(generated);
      try {
        const template = await api.generateAgentConfig(description);
        setConfigTemplate(template);
        const defaults = template.defaults ?? {};
        const existingConfig = generated.savedAgent?.config?.values ?? {};
        setConfigValues({ ...defaults, ...existingConfig });
      } catch (configErr) {
        const message = configErr instanceof Error ? configErr.message : "Failed to infer configuration";
        setConfigTemplate(null);
        setConfigError(message);
      }
    } catch (error) {
      setResult(null);
      const message = error instanceof Error ? error.message : "Failed to generate agent";
      setNaturalError(message);
      setConfigError(message);
    } finally {
      setNaturalLoading(false);
      setConfigLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!configTemplate || configTemplate.configSchema.length === 0) {
      toast({
        title: "No configuration to save",
        description: "Generate a configuration schema first.",
      });
      return;
    }
    setConfigError(null);
    setConfigSaving(true);
    setConfigSuccess(false);
    try {
      const payload = {
        agentType: configTemplate.agentType,
        summary: configTemplate.description,
        schema: configTemplate.configSchema,
        values: configValues,
      };

      let targetAgentId = result?.savedAgent?.id ?? null;
      if (!targetAgentId) {
        const spec = result?.spec;
        const created = await api.createAgent({
          name: spec?.name ?? "Generated Agent",
          role: spec?.description ?? "Autonomous Agent",
          tools: {},
          objectives: spec?.goals ?? [],
          memory_context: spec?.description ?? "",
          internet_access_enabled: false,
          config: payload,
        });
        targetAgentId = created.id;
        setResult((previous) => (previous ? { ...previous, savedAgent: created } : previous));
      } else {
        await api.updateAgent(targetAgentId, { config: payload });
      }

      setConfigSuccess(true);
      toast({ title: "Configuration saved", description: "Credentials stored for this agent." });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save configuration";
      setConfigError(message);
      toast({ title: "Configuration error", description: message, variant: "destructive" });
    } finally {
      setConfigSaving(false);
    }
  };

  const securityProfile = result?.spec.securityProfile;

  const securityDetails = useMemo(() => {
    if (!securityProfile) return null;
    return [
      {
        label: "Sandbox",
        value: securityProfile.sandbox ? "Enabled" : "Disabled",
        highlight: securityProfile.sandbox,
      },
      {
        label: "Internet",
        value: securityProfile.network.allowInternet
          ? `Allowed (${securityProfile.network.domainsAllowed.join(", ") || "all domains"})`
          : "Disabled",
        highlight: securityProfile.network.allowInternet,
      },
      {
        label: "Filesystem",
        value: `Read ${securityProfile.filesystem.read.join(", ") || "none"} · Write ${
          securityProfile.filesystem.write.join(", ") || "none"
        }`,
      },
      {
        label: "Permissions",
        value: securityProfile.permissions.join(", ") || "None",
      },
      {
        label: "Timeout",
        value: `${securityProfile.executionTimeout}s`,
      },
    ];
  }, [securityProfile]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[520px] sm:w-[540px] overflow-y-auto">
        <SheetHeader className="space-y-2">
          <SheetTitle>Create a new agent</SheetTitle>
          <SheetDescription>
            Generate a secure agent from natural language or configure one manually with full sandbox controls.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="mt-6">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="natural">Natural language</TabsTrigger>
            <TabsTrigger value="manual">Manual setup</TabsTrigger>
          </TabsList>

          <TabsContent value="natural" className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prompt">Describe your agent</Label>
              <Textarea
                id="prompt"
                placeholder="Create an agent that monitors tech news every morning and emails me a summary"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="h-32 resize-none"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Switch id="spawn-now" checked={spawnNow} onCheckedChange={setSpawnNow} />
                  <Label htmlFor="spawn-now">Launch sandbox after creation</Label>
                </div>
                <span>{prompt.trim().length} characters</span>
              </div>
            </div>

            {naturalError && <p className="text-xs text-destructive">{naturalError}</p>}

            <Button onClick={handleGenerate} disabled={naturalLoading} className="w-full">
              {naturalLoading ? "Generating..." : "Generate agent"}
            </Button>

            {configLoading && (
              <p className="text-xs text-muted-foreground">Inferring required configuration…</p>
            )}

            {configError && !configLoading && !configTemplate && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{configError}</span>
              </div>
            )}

            {configTemplate && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Tool configuration</h3>
                  <p className="text-xs text-muted-foreground">
                    Provide credentials and defaults so the agent can act autonomously.
                  </p>
                </div>
                {configError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{configError}</span>
                  </div>
                )}
                <DynamicAgentConfigForm
                  schema={configTemplate.configSchema}
                  values={configValues}
                  defaults={configTemplate.defaults}
                  disabled={configSaving}
                  onChange={(nextValues) => {
                    setConfigValues(nextValues);
                    setConfigSuccess(false);
                  }}
                />
                <div className="flex items-center justify-between">
                  {configSuccess && (
                    <span className="inline-flex items-center gap-2 text-xs text-atlas-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Saved
                    </span>
                  )}
                  <Button onClick={handleSaveConfig} disabled={configSaving} className="ml-auto">
                    {configSaving ? "Saving..." : "Save configuration"}
                  </Button>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{result.spec.name}</h3>
                  <p className="text-xs text-muted-foreground">Model: {result.spec.model}</p>
                  <p className="text-xs text-muted-foreground mt-1">{result.spec.description}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Goals</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.spec.goals.map((goal) => (
                        <Badge key={goal} variant="secondary" className="text-[11px]">
                          {goal}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {securityDetails && (
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">Security profile</span>
                      <div className="mt-2 space-y-2 text-xs">
                        {securityDetails.map((detail) => (
                          <div key={detail.label} className="flex justify-between gap-4">
                            <span className="text-muted-foreground">{detail.label}</span>
                            <span className={detail.highlight ? "text-atlas-success" : "text-foreground"}>{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Sandbox ID: {result.spawnResult ? (result.spawnResult as any).sandboxId ?? "pending" : "not launched"}</p>
                  {Array.isArray((result.spawnResult as any)?.logs) && (
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Launch log</p>
                      <ul className="space-y-0.5">
                        {(result.spawnResult as any).logs.map((log: any) => (
                          <li key={`${log.timestamp}-${log.message}`}>{log.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <Button variant="secondary" onClick={() => onOpenChange(false)} className="w-full">
                  Done
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Agent name</Label>
              <Input id="name" value={manualName} onChange={(event) => setManualName(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role & instructions</Label>
              <Textarea
                id="role"
                value={manualRole}
                onChange={(event) => setManualRole(event.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="objectives">Objectives</Label>
              <Textarea
                id="objectives"
                placeholder="One objective per line"
                value={manualObjectives}
                onChange={(event) => setManualObjectives(event.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tools">Tools (comma separated)</Label>
              <Textarea
                id="tools"
                placeholder="Slack, Notion, CRM"
                value={manualTools}
                onChange={(event) => setManualTools(event.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memory">Memory context</Label>
              <Textarea
                id="memory"
                placeholder="Provide any default context or shared state"
                value={manualMemoryContext}
                onChange={(event) => setManualMemoryContext(event.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <div className="flex items-start justify-between rounded-lg border border-border/60 bg-muted/10 p-4">
              <div className="space-y-1 pr-4">
                <Label className="text-sm font-semibold">Autonomous internet access</Label>
                <p className="text-xs text-muted-foreground">
                  Disabled by default. Enable to allow browsing, summarization, and citations via the secure proxy.
                </p>
              </div>
              <Switch checked={manualInternetAccess} onCheckedChange={setManualInternetAccess} />
            </div>

            {manualError && <p className="text-xs text-destructive">{manualError}</p>}

            <Button onClick={handleManualSubmit} disabled={manualLoading} className="w-full">
              {manualLoading ? "Creating..." : "Create agent"}
            </Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
