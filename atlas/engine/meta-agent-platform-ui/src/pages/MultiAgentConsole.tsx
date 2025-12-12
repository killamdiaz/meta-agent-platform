import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Share2, Users, Sparkles, StopCircle, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { apiBaseUrl } from "@/lib/api";
import type { MultiAgent, MultiAgentMessage, MultiAgentSession } from "@/types/api";
import { useToast } from "@/components/ui/use-toast";

const palette = [
  "bg-gradient-to-r from-cyan-500/40 via-cyan-400/40 to-sky-500/20 border-cyan-400/50 text-cyan-100",
  "bg-gradient-to-r from-purple-500/40 via-purple-400/40 to-fuchsia-500/20 border-purple-400/50 text-purple-100",
  "bg-gradient-to-r from-amber-500/40 via-amber-400/40 to-orange-500/20 border-amber-400/50 text-amber-100",
  "bg-gradient-to-r from-emerald-500/40 via-emerald-400/40 to-teal-500/20 border-emerald-400/50 text-emerald-100",
  "bg-gradient-to-r from-rose-500/40 via-rose-400/40 to-pink-500/20 border-rose-400/50 text-rose-100",
  "bg-gradient-to-r from-blue-500/40 via-blue-400/40 to-indigo-500/20 border-blue-400/50 text-blue-100",
];

const agentColour = (index: number) => palette[index % palette.length];

const MIN_PROMPT_LENGTH = 10;

interface AgentWithColour extends MultiAgent {
  colour: string;
}

export default function MultiAgentConsole() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("Summarize this 5-page contract and propose a fair termination clause.");
  const [messages, setMessages] = useState<MultiAgentMessage[]>([]);
  const [agents, setAgents] = useState<AgentWithColour[]>([]);
  const [memorySnapshot, setMemorySnapshot] = useState<MultiAgentSession["memory"] | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
    },
    [],
  );

  const finalMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.to === "User") {
        return message;
      }
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!finalMessage) {
      setIsSummaryOpen(false);
    }
  }, [finalMessage]);

  const resetSessionState = () => {
    setMessages([]);
    setAgents([]);
    setMemorySnapshot(null);
    setSessionId(null);
    setIsSummaryOpen(false);
  };

  const stopCollaboration = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  };

  const startCollaboration = () => {
    const trimmed = prompt.trim();
    if (trimmed.length < MIN_PROMPT_LENGTH) {
      toast({
        title: "Prompt too short",
        description: "Share a little more context so the agents can collaborate effectively.",
      });
      return;
    }

    try {
      stopCollaboration();
      resetSessionState();
      setIsStreaming(true);

      const url = `${apiBaseUrl}/multi-agent/sessions/stream?prompt=${encodeURIComponent(trimmed)}`;
      const source = new EventSource(url);
      eventSourceRef.current = source;

      source.addEventListener("agents", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as MultiAgent[];
        setAgents(data.map((agent, index) => ({ ...agent, colour: agentColour(index) })));
      });

      source.addEventListener("message", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as MultiAgentMessage;
        setMessages((prev) => [...prev, data]);
        if (data.to === "User") {
          setIsSummaryOpen(true);
        }
      });

      source.addEventListener("memory", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as MultiAgentSession["memory"];
        setMemorySnapshot(data);
      });

      source.addEventListener("complete", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as {
          sessionId: string;
          userPrompt: string;
          memory: MultiAgentSession["memory"];
        };
        setSessionId(data.sessionId);
        setMemorySnapshot(data.memory);
        setIsStreaming(false);
        source.close();
        eventSourceRef.current = null;
      });

      source.addEventListener("error", (event) => {
        if (isStreaming) {
          console.error("[multi-agent] stream error", event);
          toast({
            variant: "destructive",
            title: "Collaboration interrupted",
            description: "The agent stream was interrupted. Please try again.",
          });
        }
        source.close();
        eventSourceRef.current = null;
        setIsStreaming(false);
      });
    } catch (error) {
      console.error("[multi-agent] failed to start session", error);
      toast({
        variant: "destructive",
        title: "Failed to start collaboration",
        description: error instanceof Error ? error.message : "Unknown error occurred.",
      });
      setIsStreaming(false);
    }
  };

  const openSummary = () => {
    if (finalMessage) {
      setIsSummaryOpen(true);
    }
  };

  const agentsReady = agents.length > 0 ? agents.length : "–";
  const sharedCount =
    typeof memorySnapshot?.shared?.length === "number" && memorySnapshot.shared.length >= 0
      ? memorySnapshot.shared.length
      : "–";

  return (
    <div className="flex h-full flex-col bg-[#06070c]">
      <header className="border-b border-border/60 bg-gradient-to-br from-background via-background to-background/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <Share2 className="h-3.5 w-3.5" />
              Meta Agent Intercommunication
            </div>
            <h1 className="text-3xl font-semibold text-foreground">Collaboration Lab</h1>
            <p className="text-sm text-muted-foreground">
              Spawn specialised agents, let them debate, cross-verify, and synthesise a final answer in real time.
            </p>
          </div>
          <div className="hidden items-center gap-3 rounded-2xl border border-border/60 bg-background/50 px-6 py-4 text-xs md:flex">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Agents active</span>
              <span className="text-foreground font-semibold">{agentsReady}</span>
            </div>
            <div className="h-6 w-px bg-border/80" />
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Shared insights</span>
              <span className="text-foreground font-semibold">{sharedCount}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
          <Card className="border-border/60 bg-card/80 backdrop-blur px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1 space-y-3">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  user prompt
                </label>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                  placeholder="Analyse the latest customer feedback from Slack, helpdesk, and NPS to identify the top 3 issues and a plan to fix them."
                  className="min-h-[120px]"
                />
              </div>
              <div className="space-y-2 md:w-56">
                <Button onClick={startCollaboration} disabled={isStreaming} className="w-full gap-2">
                  {isStreaming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Collaborating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Start collaboration
                    </>
                  )}
                </Button>
                {isStreaming && (
                  <Button variant="ghost" onClick={stopCollaboration} className="w-full gap-2 text-destructive">
                    <StopCircle className="h-4 w-4" />
                    Stop session
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {agents.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`rounded-2xl border px-4 py-3 text-sm ${agent.colour} backdrop-blur transition`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      <p className="text-xs text-white/80">{agent.role}</p>
                    </div>
                    <Badge variant="secondary" className="bg-black/40 text-white">
                      {agent.purpose}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,1fr]">
            <Card className="border-border/60 bg-card/70 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  conversation
                </span>
                {finalMessage && (
                  <Button variant="ghost" size="sm" className="gap-1 text-foreground" onClick={openSummary}>
                    <FileText className="h-4 w-4" />
                    View Summary
                  </Button>
                )}
              </div>
              <div className="max-h-[520px] space-y-4 overflow-y-auto px-5 py-4">
                {messages.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                    Agents will appear here once the collaboration starts.
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {message.from} → {message.to}
                        </span>
                        <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm text-foreground">{message.content}</p>
                      {message.reasoning && (
                        <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Reasoning</span>
                          <p className="mt-1 whitespace-pre-line leading-relaxed">{message.reasoning}</p>
                        </div>
                      )}
                      {message.references && message.references.length > 0 && (
                        <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">References</span>
                          <ul className="mt-1 space-y-1">
                            {message.references.map((reference) => (
                              <li key={reference}>{reference}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="border-border/60 bg-card/70 backdrop-blur">
                <div className="border-b border-border/60 px-5 py-4">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Shared memory
                  </span>
                </div>
                <div className="space-y-3 px-5 py-4 text-sm text-muted-foreground">
                  {memorySnapshot?.shared?.length ? (
                    memorySnapshot.shared.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-border/60 bg-background/50 p-3">
                        <p className="text-xs text-muted-foreground/80">{new Date(entry.timestamp).toLocaleString()}</p>
                        <p className="mt-1 text-foreground">{entry.content}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Agents: {entry.agentsInvolved.join(", ")}</p>
                      </div>
                    ))
                  ) : (
                    <p>No shared memory recorded yet.</p>
                  )}
                </div>
              </Card>

              <Card className="border-border/60 bg-card/70 backdrop-blur">
                <div className="border-b border-border/60 px-5 py-4">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Session metadata
                  </span>
                </div>
                <div className="space-y-2 px-5 py-4 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Session ID</span>
                    <span className="text-foreground font-medium">{sessionId ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="text-foreground font-medium">{isStreaming ? "Streaming" : "Idle"}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {isSummaryOpen && finalMessage && (
            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Final summary
                </span>
                <Button variant="ghost" size="icon" onClick={() => setIsSummaryOpen(false)} aria-label="Close summary">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4 px-5 py-4 text-sm">
                <p className="whitespace-pre-line text-foreground">{finalMessage.content}</p>
                {finalMessage.reasoning && (
                  <div className="rounded-lg border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Reasoning</span>
                    <p className="mt-1 whitespace-pre-line leading-relaxed">{finalMessage.reasoning}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
