import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Mic, Sparkles, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import TicketDrawer from "@/components/Console/TicketDrawer";
import { type Ticket as TicketType } from "@/data/mockTickets";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const cleanDescription = (raw: unknown) => {
  if (!raw) return "";
  if (typeof raw === "string") return raw.replace(/<[^>]+>/g, "").trim();
  if (typeof raw === "object" && raw !== null && "content" in raw) {
    try {
      const blocks = (raw as any).content as Array<{ content?: Array<{ text?: string }> }>;
      return blocks
        .map((block) => block.content?.map((c) => c.text).filter(Boolean).join(" ") ?? "")
        .filter(Boolean)
        .join("\n")
        .trim();
    } catch {
      return "";
    }
  }
  return "";
};

const mapIssueToTicket = (issue: any): TicketType | null => {
  if (!issue) return null;
  const fields = issue.fields || {};
  const statusName = String(fields.status?.name ?? "").toLowerCase();
  const status: TicketType["status"] =
    statusName.includes("done") || statusName.includes("resolved") || statusName.includes("closed")
      ? "closed"
      : statusName.includes("progress")
      ? "in-progress"
      : "open";
  const priorityName = String(fields.priority?.name ?? "").toLowerCase();
  const priority: TicketType["priority"] =
    priorityName.includes("highest") || priorityName.includes("blocker") || priorityName.includes("critical")
      ? "P1"
      : priorityName.includes("high") || priorityName.includes("major")
      ? "P2"
      : priorityName.includes("medium")
      ? "P3"
      : "P4";

  const descriptionRaw = issue.renderedFields?.description ?? fields.description;
  const description = cleanDescription(descriptionRaw);
  const reporter = fields.assignee?.displayName || fields.reporter?.displayName || "Unassigned";
  const createdAt = fields.created || new Date().toISOString();

  return {
    id: issue.id || issue.key || fields.id || fields.key || `jira-${Math.random().toString(36).slice(2)}`,
    key: issue.key || fields.key || "JIRA",
    title: fields.summary || issue.key || "Jira issue",
    description,
    priority,
    status,
    reporter,
    createdAt,
    source: fields.project?.name || "Jira",
  };
};

export default function CommandConsole() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showTicketView, setShowTicketView] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const agents = [
    { id: "core", name: "Atlas Core" },
    { id: "diagnosis", name: "Diagnosis Engine" },
    { id: "analysis", name: "Analysis Agent" },
  ];
  const [mentionCandidates, setMentionCandidates] = useState(agents);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const pendingCount = tickets.filter((t) => t.status === "open" || t.status === "in-progress").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;

  const fetchIssues = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const storedToken =
        localStorage.getItem("access_token") ||
        localStorage.getItem("sb-access-token") ||
        localStorage.getItem("sb-auth-token");
      const headers: Record<string, string> = {};
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      if (user?.id) headers["x-account-id"] = user.id;
      const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id;
      if (orgId) headers["x-org-id"] = orgId;
      const license = localStorage.getItem("forge_license_key");
      if (license) headers["x-license-key"] = license;
      const res = await fetch(`${API_BASE}/connectors/jira/api/issues/assigned`, {
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 400) {
          setTickets([]);
          return;
        }
        const text = await res.text();
        throw new Error(`Failed to load Jira issues: ${res.statusText || text || "unknown"}`);
      }
      const data = await res.json();
      const mapped = Array.isArray(data?.issues)
        ? (data.issues.map(mapIssueToTicket).filter(Boolean) as TicketType[])
        : [];
      setTickets(mapped);
    } catch (error) {
      console.error("[console] failed to load Jira issues", error);
    } finally {
      setTicketsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const history = messages
      .filter((m) => m.content && m.content !== "__streaming__")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    const payload = history ? `${history}\nUser: ${input}` : input;
    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    const body = JSON.stringify({ message: payload, conversationId: conversationId ?? undefined });
    const controller = new AbortController();

    try {
      const storedToken =
        localStorage.getItem("access_token") ||
        localStorage.getItem("sb-access-token") ||
        localStorage.getItem("sb-auth-token");
      const license = localStorage.getItem("forge_license_key");
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
          ...(license ? { "x-license-key": license } : {}),
        },
        body,
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        throw new Error(`Chat failed: ${res.statusText}`);
      }

      let buffer = "";
      let assistantContent = "";
      let hasAssistantMessage = false;

      const reader = res.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const chunk of parts) {
          const lines = chunk.split("\n");
          let event: string | null = null;
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.replace("event:", "").trim();
            if (line.startsWith("data:")) dataLines.push(line.replace(/^data:\s?/, ""));
          }
          const data = dataLines.join("\n");
          if (event === "token") {
            assistantContent += data;
            setMessages((prev) => {
              if (!hasAssistantMessage) {
                hasAssistantMessage = true;
                return [...prev, { role: "assistant", content: assistantContent || "__streaming__" }];
              }
              if (!prev.length) {
                return [{ role: "assistant", content: assistantContent || "__streaming__" }];
              }
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx].role === "assistant") {
                updated[lastIdx] = { ...updated[lastIdx], content: assistantContent || "__streaming__" };
              } else {
                updated.push({ role: "assistant", content: assistantContent || "__streaming__" });
              }
              return updated;
            });
          }
          if (event === "done") {
            try {
              const payload = JSON.parse(data);
              if (payload?.conversationId) setConversationId(payload.conversationId);
              if (payload?.messageId) {
                setMessages((prev) => {
                  if (!prev.length) return [{ role: "assistant", content: assistantContent }];
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (updated[lastIdx].role === "assistant") {
                    updated[lastIdx] = { ...updated[lastIdx], content: assistantContent };
                  } else {
                    updated.push({ role: "assistant", content: assistantContent });
                  }
                  return updated;
                });
              }
            } catch {
              setMessages((prev) => {
                if (!prev.length) return [{ role: "assistant", content: assistantContent }];
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx].role === "assistant") {
                  updated[lastIdx] = { ...updated[lastIdx], content: assistantContent };
                } else {
                  updated.push({ role: "assistant", content: assistantContent });
                }
                return updated;
              });
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I hit an error responding." }]);
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery !== null && mentionCandidates.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    const caret = e.target.selectionStart ?? value.length;
    const textBeforeCaret = value.slice(0, caret);
    const match = textBeforeCaret.match(/@([\w-]*)$/);
    if (match) {
      const query = match[1];
      const filtered = agents.filter((agent) =>
        `${agent.id} ${agent.name}`.toLowerCase().includes(query.toLowerCase()),
      );
      setMentionQuery(query);
      setMentionCandidates(filtered);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionCandidates(agents);
    }
  };

  const insertMention = (agent: { id: string; name: string }) => {
    const mentionText = `@${agent.id}`;
    setInput((prev) => {
      const caret = inputRef.current?.selectionStart ?? prev.length;
      const before = prev.slice(0, caret);
      const after = prev.slice(caret);
      const match = before.match(/@[\w-]*$/);
      const start = match ? caret - match[0].length : caret;
      const newValue = `${prev.slice(0, start)}${mentionText} ${after}`;
      const nextCaret = start + mentionText.length + 1;
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(nextCaret, nextCaret);
        }
      });
      return newValue;
    });
    setMentionQuery(null);
    setMentionCandidates(agents);
    setMentionIndex(0);
  };

  const handleViewTickets = () => {
    setShowTicketView(true);
    void fetchIssues();
    setMessages([
      {
        role: "assistant",
        content: "I've loaded your Jira issues. Select one from the panel on the right to inspect it.",
      },
    ]);
  };

  const handleSelectTicket = (ticket: TicketType) => {
    setSelectedTicket(ticket);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `**${ticket.key}: ${ticket.title}**\n\n**Priority:** ${ticket.priority}\n**Reporter:** ${ticket.reporter}\n**Status:** ${ticket.status}\n\n**Description:**\n${ticket.description}\n\nWould you like me to proceed with analyzing and fixing this issue?`,
      },
    ]);
  };

  useEffect(() => {
    if (!conversationId) return;
    localStorage.setItem(`atlas-chat-${conversationId}`, JSON.stringify(messages));
  }, [messages, conversationId]);

  useEffect(() => {
    const lastConversationId = localStorage.getItem("atlas-last-conversation-id");
    if (lastConversationId) {
      setConversationId(lastConversationId);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    localStorage.setItem("atlas-last-conversation-id", conversationId);
    const stored = localStorage.getItem(`atlas-chat-${conversationId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } catch {
        setMessages([]);
      }
    } else {
      setMessages((prev) => (prev.length ? prev : []));
    }
  }, [conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const renderWelcome = () => (
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

      <div className="flex items-center gap-6 mt-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold text-red-400">{pendingCount}</span>
          <span className="text-sm text-muted-foreground">Pending tickets</span>
        </div>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold text-blue-400">{closedCount}</span>
          <span className="text-sm text-muted-foreground">Closed tickets</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleViewTickets}
          className="flex items-center gap-2 px-5 py-3 text-sm border border-border rounded-xl hover:border-atlas-glow/50 hover:bg-muted/30 transition-all"
        >
          <TicketIcon className="w-4 h-4" />
          View my tickets
        </button>
        <button className="flex items-center gap-2 px-5 py-3 text-sm border border-border rounded-xl hover:border-atlas-glow/50 hover:bg-muted/30 transition-all">
          <Sparkles className="w-4 h-4" />
          Create new agent
        </button>
      </div>
    </div>
  );

  const renderMessages = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      {messages.map((message, i) => (
        <div key={i} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
          <div
            className={cn(
              "max-w-[80%] whitespace-pre-wrap",
              message.role === "user"
                ? "rounded-2xl px-4 py-3 bg-atlas-glow/20 text-foreground ml-auto"
                : "text-foreground",
            )}
          >
            {message.content}
          </div>
        </div>
      ))}
      {isTyping && (
        <div className="flex justify-start animate-fade-in">
          <div className="bg-muted rounded-2xl px-4 py-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-atlas-glow animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-atlas-glow animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-atlas-glow animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderInput = () => (
    <div className="bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-card/40 backdrop-blur-sm border border-border/50 rounded-[28px] hover:border-border transition-colors">
          {mentionQuery !== null && (
            <div className="absolute bottom-full left-5 mb-2 w-64 rounded-xl border border-border bg-card shadow-md overflow-hidden">
              {mentionCandidates.length ? (
                mentionCandidates.map((agent, idx) => (
                  <button
                    key={agent.id}
                    className={cn(
                      "w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors",
                      idx === mentionIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(agent);
                    }}
                  >
                    {agent.name} ({agent.id})
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-muted-foreground">No matches</div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 px-5 py-4">
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-transparent h-9 w-9"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask Atlas Core..."
              ref={inputRef}
              className="flex-1 bg-transparent border-0 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              <span>Tools</span>
            </button>
            <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-transparent h-9 w-9">
              <Mic className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (showTicketView) {
    return (
      <div className="flex h-screen gap-4 p-4 max-w-7xl mx-auto">
        <div className="flex-[3] flex flex-col bg-card/30 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8" ref={scrollRef}>
            {renderMessages()}
          </div>
          {renderInput()}
        </div>
        <div className="flex-1 min-w-[320px] max-w-[400px]">
          <TicketDrawer
            tickets={tickets}
            selectedTicket={selectedTicket}
            onSelectTicket={handleSelectTicket}
            onClearSelection={() => setSelectedTicket(null)}
            loading={ticketsLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-8" ref={scrollRef}>
        {messages.length === 0 ? renderWelcome() : renderMessages()}
      </div>
      {renderInput()}
    </div>
  );
}
