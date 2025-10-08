import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Mic, Sparkles, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { AgentRecord, CommandResponse, MemoryEntry, TaskRecord } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";

type MessageRole = "user" | "assistant" | "system";

interface Message {
  role: MessageRole;
  content: string;
  agentId?: string;
  taskId?: string;
  kind?: "context" | "memory" | "status" | "message";
}

function findAgentByIdentifier(agents: AgentRecord[], identifier: string) {
  const lowered = identifier.toLowerCase();
  return (
    agents.find((agent) => agent.id === identifier) ||
    agents.find((agent) => agent.name.toLowerCase() === lowered)
  );
}

function extractObjectives(objectives: AgentRecord["objectives"]): string[] {
  if (Array.isArray(objectives)) {
    return objectives.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }

  if (typeof objectives === "string") {
    try {
      const parsed = JSON.parse(objectives);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      }
    } catch {
      if (objectives.trim().length > 0) {
        return [objectives.trim()];
      }
    }
  }

  return [];
}

function scoreAgentForText(agent: AgentRecord, text: string) {
  const lowered = text.toLowerCase();
  let score = 0;

  const name = agent.name.toLowerCase();
  if (lowered.includes(name)) {
    score += 6;
  }

  if (agent.role) {
    const role = agent.role.toLowerCase();
    if (lowered.includes(role)) {
      score += 4;
    }
  }

  const objectives = extractObjectives(agent.objectives);
  objectives.forEach((objective) => {
    const objectiveLower = objective.toLowerCase();
    if (lowered.includes(objectiveLower)) {
      score += 2.5;
    } else {
      const keywords = objectiveLower.split(/[^\w]+/).filter((keyword) => keyword.length > 3);
      const matches = keywords.filter((keyword) => lowered.includes(keyword));
      if (matches.length > 0) {
        score += matches.length * 1.2;
      }
    }
  });

  if (agent.memory_context) {
    const memoryKeywords = agent.memory_context
      .toLowerCase()
      .split(/[^\w]+/)
      .filter((keyword) => keyword.length > 4);
    const matches = memoryKeywords.filter((keyword) => lowered.includes(keyword));
    if (matches.length > 0) {
      score += matches.length * 0.8;
    }
  }

  const tools = Object.keys(agent.tools ?? {});
  tools.forEach((tool) => {
    if (lowered.includes(tool.toLowerCase())) {
      score += 1.5;
    }
  });

  return score;
}

function autoSelectAgent(agents: AgentRecord[], text: string) {
  if (agents.length === 0) {
    return undefined;
  }

  const scored = agents
    .map((agent) => ({ agent, score: scoreAgentForText(agent, text) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score > 0) {
    return best.agent;
  }

  return agents[0];
}

function buildCommand(raw: string, agents: AgentRecord[]): { command: string; routedAgent?: AgentRecord } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Command cannot be empty");
  }

  if (trimmed.startsWith("/")) {
    return { command: trimmed };
  }

  if (trimmed.startsWith("@")) {
    const parts = trimmed.slice(1).split(/\s+/);
    const identifier = parts.shift() ?? "";
    const remainder = parts.join(" ");
    const agent = findAgentByIdentifier(agents, identifier);
    if (!agent) {
      throw new Error(`Agent ${identifier} not found`);
    }
    return {
      command: `/run ${agent.id} "${remainder || `Run command for ${agent.name}`}"`,
      routedAgent: agent,
    };
  }

  const mentionMatch = trimmed.match(/@([\w-]+)/);
  if (mentionMatch) {
    const agent = findAgentByIdentifier(agents, mentionMatch[1]);
    if (!agent) {
      throw new Error(`Agent ${mentionMatch[1]} not found`);
    }
    const remainder = trimmed.replace(mentionMatch[0], "").trim();
    return {
      command: `/run ${agent.id} "${remainder || `Run command for ${agent.name}`}"`,
      routedAgent: agent,
    };
  }

  if (agents.length === 0) {
    throw new Error("No agents are available to handle this request");
  }

  const routedAgent = autoSelectAgent(agents, trimmed);
  if (!routedAgent) {
    throw new Error("Unable to determine a suitable agent for this request");
  }
  return {
    command: `/run ${routedAgent.id} "${trimmed}"`,
    routedAgent,
  };
}

function describeResponse(response: CommandResponse): string {
  if (response.task && response.agent) {
    return `${response.message ?? "Task enqueued"} for ${response.agent.name}. Status: ${response.task.status}`;
  }
  if (response.agent && response.message) {
    return `${response.message} (${response.agent.name})`;
  }
  return response.message ?? "Command executed.";
}

function formatTaskResult(task: TaskRecord): string {
  const { result } = task;
  if (!result) {
    return `Task ${task.status}`;
  }

  if (typeof result === "string") {
    return result;
  }

  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }

  if (Array.isArray(result)) {
    return result.map((item) => (typeof item === "string" ? item : JSON.stringify(item, null, 2))).join("\n");
  }

  if (typeof result === "object") {
    const summary =
      typeof (result as Record<string, unknown>).summary === "string"
        ? (result as Record<string, unknown>).summary
        : undefined;
    if (summary) {
      return summary;
    }
    const message =
      typeof (result as Record<string, unknown>).message === "string"
        ? (result as Record<string, unknown>).message
        : undefined;
    if (message) {
      return message;
    }
    return JSON.stringify(result, null, 2);
  }

  return String(result);
}

function formatMemoryUpdate(agent: AgentRecord, entries: MemoryEntry[]): string {
  if (entries.length === 0) {
    return `${agent.name} has no stored memories yet.`;
  }

  const lines = entries.map((entry) => `• ${entry.content}`);
  return [`Recent memories for ${agent.name}:`, ...lines].join("\n");
}

export default function CommandConsole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingAgent, setPendingAgent] = useState<AgentRecord | undefined>();
  const [agentContexts, setAgentContexts] = useState<
    Record<
      string,
      {
        objectives: string[];
        memories: MemoryEntry[];
      }
    >
  >({});
  const trackedTasks = useRef(new Map<string, { agent: AgentRecord; prompt: string; status?: string }>());
  const handledTasks = useRef(new Set<string>());

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    select: (res) => res.items,
    refetchInterval: 20_000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.listTasks().then((res) => res.items),
    refetchInterval: 5_000,
  });

  const commandMutation = useMutation({
    mutationFn: (command: string) => api.runCommand(command),
    onSuccess: (response) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            response.task && (response.agent || pendingAgent)
              ? `${(response.agent ?? pendingAgent)?.name ?? "Agent"} is processing "${
                  response.task.prompt
                }". I'll share the results soon.`
              : describeResponse(response),
          agentId: (response.agent ?? pendingAgent)?.id,
          taskId: response.task?.id,
          kind: "status",
        },
      ]);
      if (response.task && (response.agent || pendingAgent)) {
        const agent = response.agent ?? pendingAgent;
        if (agent) {
          trackedTasks.current.set(response.task.id, { agent, prompt: response.task.prompt, status: response.task.status });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setPendingAgent(undefined);
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${error.message}` },
      ]);
      toast({ title: "Command failed", description: error.message, variant: "destructive" });
      setPendingAgent(undefined);
    },
  });

  const isTyping = commandMutation.isPending;

  const suggestions = useMemo(() => {
    if (agents.length === 0) {
      return [
        "Create an agent that monitors onboarding emails",
        "Generate a financial summary for this week",
      ];
    }
    return agents.slice(0, 4).map((agent) => `@${agent.name} run a status update`);
  }, [agents]);

  const ensureAgentContext = useCallback(
    async (agent: AgentRecord) => {
      const existingContext = agentContexts[agent.id];
      setAgentContexts((prev) => {
        if (prev[agent.id]) {
          return prev;
        }
        return {
          ...prev,
          [agent.id]: {
            objectives: extractObjectives(agent.objectives),
            memories: [],
          },
        };
      });

      setMessages((prev) => {
        const hasContext = prev.some((message) => message.kind === "context" && message.agentId === agent.id);
        if (hasContext) {
          return prev;
        }
        const objectives = extractObjectives(agent.objectives);
        const contextLines = [
          `Role: ${agent.role || "Unknown role"}`,
          objectives.length ? `Objectives: ${objectives.join("; ")}` : "Objectives: Not set",
        ];
        if (agent.memory_context) {
          contextLines.push(`Memory context: ${agent.memory_context}`);
        }
        return [
          ...prev,
          {
            role: "system",
            content: [`Context for ${agent.name}:`, ...contextLines].join("\n"),
            agentId: agent.id,
            kind: "context",
          },
        ];
      });

      if (existingContext && existingContext.memories.length > 0) {
        return;
      }

      try {
        const memory = await api.getAgentMemory(agent.id, 5);
        if (memory.items.length > 0) {
          setAgentContexts((prev) => ({
            ...prev,
            [agent.id]: {
              objectives: prev[agent.id]?.objectives ?? extractObjectives(agent.objectives),
              memories: memory.items,
            },
          }));
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: formatMemoryUpdate(agent, memory.items),
              agentId: agent.id,
              kind: "memory",
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to load agent memory", error);
      }
    },
    [agentContexts]
  );

  const refreshAgentMemory = useCallback(
    async (agent: AgentRecord) => {
      try {
        const memory = await api.getAgentMemory(agent.id, 5);
        setAgentContexts((prev) => {
          const current = prev[agent.id];
          const existingIds = new Set((current?.memories ?? []).map((entry) => entry.id));
          const newEntries = memory.items.filter((entry) => !existingIds.has(entry.id));
          if (newEntries.length > 0) {
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                role: "system",
                content: formatMemoryUpdate(agent, memory.items.slice(0, 5)),
                agentId: agent.id,
                kind: "memory",
              },
            ]);
          }
          return {
            ...prev,
            [agent.id]: {
              objectives: current?.objectives ?? extractObjectives(agent.objectives),
              memories: memory.items,
            },
          };
        });
      } catch (error) {
        console.error("Failed to refresh agent memory", error);
      }
    },
    []
  );

  useEffect(() => {
    tasks.forEach((task) => {
      if (!trackedTasks.current.has(task.id) && !handledTasks.current.has(task.id)) {
        return;
      }

      if (handledTasks.current.has(task.id)) {
        return;
      }

      const tracked = trackedTasks.current.get(task.id);
      const agent = tracked?.agent || agents.find((candidate) => candidate.id === task.agent_id);
      if (!agent) {
        return;
      }

      if (task.status === "working") {
        const current = trackedTasks.current.get(task.id);
        if (!current || current.status !== "working") {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `${agent.name} is working on "${task.prompt}"...`,
              agentId: agent.id,
              taskId: task.id,
              kind: "status",
            },
          ]);
        }
        trackedTasks.current.set(task.id, { agent, prompt: task.prompt, status: "working" });
        return;
      }

      if (task.status === "completed" || task.status === "error") {
        handledTasks.current.add(task.id);
        trackedTasks.current.delete(task.id);
        const resultText = formatTaskResult(task);
        setMessages((prev) => [
          ...prev,
          {
            role: task.status === "error" ? "system" : "assistant",
            content:
              task.status === "error"
                ? `Task for ${agent.name} failed: ${resultText}`
                : `${agent.name}: ${resultText}`,
            agentId: agent.id,
            taskId: task.id,
            kind: task.status === "error" ? "status" : "message",
          },
        ]);
        if (task.status === "completed") {
          refreshAgentMemory(agent);
        }
      }
    });
  }, [tasks, agents, refreshAgentMemory]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const { command, routedAgent } = buildCommand(input, agents);
      if (routedAgent) {
        await ensureAgentContext(routedAgent);
      }
      setPendingAgent(routedAgent);
      await commandMutation.mutateAsync(command);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process command";
      setMessages((prev) => [...prev, { role: "system", content: `Error: ${message}` }]);
      toast({ title: "Unable to route message", description: message, variant: "destructive" });
    } finally {
      setInput("");
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-6 animate-fade-in">
            <div className="flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-atlas-glow" />
            </div>
            <div className="text-center space-y-1">
              <h1 className="text-4xl font-normal">
                <span className="text-atlas-glow">Hello, Founder</span>
              </h1>
              <p className="text-3xl font-normal text-muted-foreground/80">What should we build today?</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8 max-w-2xl">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="p-4 text-left text-sm border border-border rounded-xl hover:border-atlas-glow/50 hover:bg-muted/30 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 whitespace-pre-wrap break-words ${
                    message.role === "user"
                      ? "bg-atlas-glow/20 text-foreground ml-auto"
                      : message.role === "system"
                      ? message.kind === "context" || message.kind === "memory"
                        ? "bg-muted/60 text-muted-foreground"
                        : "bg-destructive/10 text-destructive"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {pendingAgent ? `Routing to ${pendingAgent.name}...` : "Processing command..."}
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-card/40 backdrop-blur-sm border border-border/50 rounded-[28px] hover:border-border transition-colors">
            <div className="flex items-center gap-3 px-5 py-4">
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-transparent h-9 w-9"
                onClick={() => setInput((value) => `${value} /create `)}
              >
                <Plus className="h-5 w-5" />
              </Button>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask Atlas Core or route with @agent..."
                className="flex-1 bg-transparent border-0 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                disabled={isTyping}
              />
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>Tools</span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-transparent h-9 w-9"
              >
                <Mic className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
