import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Mic, Sparkles, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api, apiBaseUrl } from "@/lib/api";
import type { AgentRecord, CommandResponse, TaskRecord } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";

type MessageRole = "user" | "assistant" | "system";

interface Message {
  role: MessageRole;
  content: string;
  taskId?: string;
  status?: TaskRecord["status"];
  agentId?: string;
  agentName?: string;
  streamContent?: string;
  streamingState?: "streaming" | "complete";
}

function findAgentByIdentifier(agents: AgentRecord[], identifier: string) {
  const lowered = identifier.toLowerCase();
  return (
    agents.find((agent) => agent.id === identifier) ||
    agents.find((agent) => agent.name.toLowerCase() === lowered)
  );
}

function autoSelectAgent(agents: AgentRecord[], text: string) {
  const lowered = text.toLowerCase();
  return (
    agents.find((agent) => lowered.includes(agent.name.toLowerCase())) ||
    agents.find((agent) => lowered.includes(agent.role.toLowerCase())) ||
    agents[0]
  );
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

function formatTaskMessage(agentName: string | undefined, task: TaskRecord): string {
  const name = agentName ?? "Agent";
  switch (task.status) {
    case "pending":
      return `Task enqueued for ${name}. Status: pending.`;
    case "working":
      return `${name} is working on your request...`;
    case "completed": {
      const result = task.result as
        | {
            thought?: unknown;
            action?: { summary?: unknown };
            message?: unknown;
          }
        | string
        | null
        | undefined;

      if (typeof result === "string") {
        return `${name} completed the task:\n\n${result}`;
      }

      if (result && typeof result === "object") {
        const thought = typeof result.thought === "string" ? result.thought.trim() : "";
        const summary =
          result.action && typeof result.action === "object" && result.action !== null && "summary" in result.action
            ? typeof result.action.summary === "string"
              ? result.action.summary.trim()
              : ""
            : "";
        const message = typeof result.message === "string" ? result.message.trim() : "";
        const parts = [
          `${name} completed the task.`,
          thought,
          summary ? `Summary: ${summary}` : "",
          message,
        ].filter((part) => part && part.length > 0);
        return parts.join("\n\n") || `${name} completed the task.`;
      }

      return `${name} completed the task.`;
    }
    case "error": {
      const result = task.result as { message?: unknown } | string | null | undefined;
      if (typeof result === "string") {
        return `Task for ${name} failed: ${result}`;
      }
      if (result && typeof result === "object" && typeof result.message === "string") {
        return `Task for ${name} failed: ${result.message}`;
      }
      return `Task for ${name} failed.`;
    }
    default:
      return `${name} reported status: ${task.status}`;
  }
}

type TaskStreamPayload =
  | {
      type: "status";
      status: TaskRecord["status"];
      task: TaskRecord;
      agent?: AgentRecord;
    }
  | {
      type: "token";
      token: string;
      agent?: AgentRecord;
    }
  | {
      type: "complete";
      status: "completed";
      task: TaskRecord;
      agent?: AgentRecord;
    }
  | {
      type: "error";
      status: "error";
      message: string;
      task?: TaskRecord;
      agent?: AgentRecord;
    };

export default function CommandConsole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const taskStreams = useRef<Map<string, EventSource>>(new Map());

  const closeTaskStream = useCallback((taskId: string) => {
    const source = taskStreams.current.get(taskId);
    if (source) {
      source.close();
      taskStreams.current.delete(taskId);
    }
  }, []);

  const handleTaskStreamEvent = useCallback(
    (taskId: string, payload: TaskStreamPayload) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (message.taskId !== taskId) {
            return message;
          }
          const next: Message = { ...message };

          if (payload.agent) {
            next.agentId = payload.agent.id;
            next.agentName = payload.agent.name;
          }

          switch (payload.type) {
            case "token": {
              const combined = `${next.streamContent ?? ""}${payload.token}`;
              next.streamContent = combined;
              next.status = "working";
              next.streamingState = "streaming";
              return next;
            }
            case "status": {
              next.status = payload.status;
              if (payload.task) {
                next.content = formatTaskMessage(next.agentName ?? payload.agent?.name, payload.task);
              }
              next.streamingState = "streaming";
              return next;
            }
            case "complete": {
              const task = payload.task;
              next.status = payload.status;
              if (task) {
                next.content = formatTaskMessage(next.agentName ?? payload.agent?.name, task);
              } else if (next.streamContent) {
                next.content = next.streamContent;
              }
              next.streamContent = undefined;
              next.streamingState = "complete";
              return next;
            }
            case "error": {
              const errorTask = payload.task;
              next.status = payload.status;
              const messageText = typeof payload.message === "string" ? payload.message : "Task failed.";
              const agentDisplay = next.agentName ?? payload.agent?.name ?? "agent";
              next.content = `Task for ${agentDisplay} failed: ${messageText}`;
              next.streamContent = undefined;
              next.streamingState = "complete";
              return next;
            }
            default:
              return next;
          }
        }),
      );
    },
    [],
  );

  const startTaskStream = useCallback(
    (taskId: string) => {
      if (!taskId || taskStreams.current.has(taskId)) {
        return;
      }
      if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
        return;
      }
      const path = `/tasks/${taskId}/stream`;
      const url = apiBaseUrl ? `${apiBaseUrl}${path}` : path;
      const source = new window.EventSource(url);
      taskStreams.current.set(taskId, source);

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TaskStreamPayload;
          handleTaskStreamEvent(taskId, data);
          if (data.type === "complete" || data.type === "error") {
            closeTaskStream(taskId);
          }
        } catch (error) {
          console.error("Failed to parse task stream event", error);
        }
      };

      source.onerror = () => {
        closeTaskStream(taskId);
        setMessages((prev) =>
          prev.map((message) =>
            message.taskId === taskId
              ? {
                  ...message,
                  streamingState: "complete",
                }
              : message,
          ),
        );
      };
    },
    [closeTaskStream, handleTaskStreamEvent],
  );

  useEffect(
    () => () => {
      taskStreams.current.forEach((source) => source.close());
      taskStreams.current.clear();
    },
    [],
  );

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.listAgents(),
    select: (res) => res.items,
    refetchInterval: 20_000,
  });

  const commandMutation = useMutation({
    mutationFn: (command: string) => api.runCommand(command),
    onSuccess: (response) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: describeResponse(response),
          taskId: response.task?.id,
          status: response.task?.status,
          agentId: response.agent?.id,
          agentName: response.agent?.name,
          streamingState: response.task ? "streaming" : undefined,
        },
      ]);
      if (response.task?.id) {
        startTaskStream(response.task.id);
      }
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${error.message}` },
      ]);
      toast({ title: "Command failed", description: error.message, variant: "destructive" });
    },
  });

  const streamingTaskIds = useMemo(
    () =>
      messages
        .filter((message) => message.taskId && message.streamingState === "streaming")
        .map((message) => message.taskId!),
    [messages],
  );

  const pollTaskIds = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            message.taskId &&
            message.streamingState !== "streaming" &&
            !["completed", "error"].includes(message.status ?? "pending"),
        )
        .map((message) => message.taskId!),
    [messages],
  );

  const { data: tasksData } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.listTasks(),
    enabled: pollTaskIds.length > 0,
    refetchInterval: pollTaskIds.length > 0 ? 2_000 : false,
  });

  useEffect(() => {
    if (!tasksData) return;
    setMessages((prev) =>
      prev.map((message) => {
        if (!message.taskId || message.streamingState === "streaming") {
          return message;
        }
        const task = tasksData.items.find((item) => item.id === message.taskId);
        if (!task) {
          return message;
        }
        const updatedContent = formatTaskMessage(message.agentName, task);
        if (updatedContent === message.content && task.status === message.status) {
          return message;
        }
        return {
          ...message,
          content: updatedContent,
          status: task.status,
        };
      }),
    );
  }, [tasksData]);

  const isTyping = commandMutation.isPending || streamingTaskIds.length > 0 || pollTaskIds.length > 0;

  const activeAgentName = useMemo(() => {
    const streamingMessage = messages.find((message) => message.streamingState === "streaming");
    if (streamingMessage?.agentName) {
      return streamingMessage.agentName;
    }
    const pendingMessage = messages.find(
      (message) => message.taskId && !["completed", "error"].includes(message.status ?? "pending"),
    );
    return pendingMessage?.agentName;
  }, [messages]);

  const suggestions = useMemo(() => {
    if (agents.length === 0) {
      return [
        "Create an agent that monitors onboarding emails",
        "Generate a financial summary for this week",
      ];
    }
    return agents.slice(0, 4).map((agent) => `@${agent.name} run a status update`);
  }, [agents]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const { command } = buildCommand(input, agents);
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
                  className={`max-w-[80%] rounded-2xl px-4 py-3 whitespace-pre-wrap ${
                    message.role === "user"
                      ? "bg-atlas-glow/20 text-foreground ml-auto"
                      : message.role === "system"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {message.streamContent ?? message.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {commandMutation.isPending
                      ? "Processing command..."
                      : activeAgentName
                      ? `${activeAgentName} is working...`
                      : "Processing command..."}
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
