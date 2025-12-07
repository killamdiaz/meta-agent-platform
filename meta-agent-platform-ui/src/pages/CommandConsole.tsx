import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Mic, Sparkles, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import TicketDrawer from "@/components/Console/TicketDrawer";
import { type Ticket as TicketType } from "@/data/mockTickets";
import { cn } from "@/lib/utils";
import { API_BASE, EXHAUST_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getIssueDetails, type JiraIssueDetails } from "@/hooks/useJiraIssue";
import type { SimilarIssue } from "@/types/jira";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type ExhaustStream } from "@/data/mockExhausts";

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

const mapIssueToTicket = (issue: Record<string, unknown> | null | undefined): TicketType | null => {
  if (!issue) return null;
  const fields = (issue as any).fields || {};
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
  const comments = (fields.comment?.comments || []).map((c: any) => ({
    author: c.author?.displayName,
    body: cleanDescription(c.body ?? c.renderedBody ?? ""),
    created: c.created,
  }));

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
    comments,
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
  const [issueDetails, setIssueDetails] = useState<Record<string, JiraIssueDetails>>({});
  const [similarIssues, setSimilarIssues] = useState<Record<string, SimilarIssue[]>>({});
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const agents = [
    { id: "core", name: "Atlas Core" },
    { id: "diagnosis", name: "Diagnosis Engine" },
    { id: "analysis", name: "Analysis Agent" },
  ];
  const [logStreams, setLogStreams] = useState<ExhaustStream[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [logStreamByTicket, setLogStreamByTicket] = useState<Record<string, ExhaustStream>>({});
  const [mentionCandidates, setMentionCandidates] = useState(agents);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [ticketView, setTicketView] = useState<"pending" | "resolved">("pending");
  const [toast, setToast] = useState<string | null>(null);
  const ticketCacheKey = user?.id ? `atlas-tickets-${user.id}` : null;

  const pendingCount = tickets.filter((t) => t.status === "open" || t.status === "in-progress").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;
  const formatContent = (text: string) =>
    text
      // Space around any markdown header
      .replace(/(#+\s*[^\n]+)/g, "\n\n$1\n\n")
      // Space around horizontal rules
      .replace(/---/g, "\n\n---\n\n")
      // Ensure list items have space before them
      .replace(/(\n)(\d+\.|\-)\s/g, "\n$2 ")
      // Fix accidental triple newlines
      .replace(/(\n){3,}/g, "\n\n")
      // Trim edges
      .trim();
  const formatAssistantMarkdown = (text: string) =>
    text
      .replace(/(\S)(#+\s)/g, "$1\n$2")
      .replace(/(\S)(\n?\d+\.\s)/g, "$1\n$2")
      .replace(/(\S)(\n?-\s)/g, "$1\n$2")
      .replace(/(\n){3,}/g, "\n\n")
      .trim();

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
          if (ticketCacheKey) localStorage.removeItem(ticketCacheKey);
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
      if (ticketCacheKey) localStorage.setItem(ticketCacheKey, JSON.stringify(mapped));
    } catch (error) {
      console.error("[console] failed to load Jira issues", error);
    } finally {
      setTicketsLoading(false);
    }
  }, [user, ticketCacheKey]);

  useEffect(() => {
    if (!ticketCacheKey) return;
    const cached = localStorage.getItem(ticketCacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) setTickets(parsed);
      } catch {
        /* ignore bad cache */
      }
    }
  }, [ticketCacheKey]);

  const fetchLogStreams = useCallback(async () => {
    try {
      const license = localStorage.getItem("forge_license_key");
      const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id;
      const res = await fetch(`${EXHAUST_BASE}/exhausts${orgId ? `?org_id=${orgId}` : ""}`, {
        credentials: "include",
        headers: license ? { "x-license-key": license } : undefined,
      });
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.items ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        status: "waiting",
        linkedTicket: null,
        ticketKey: null,
        createdBy: "You",
        createdAt: s.created_at,
        lastActivity: s.created_at,
        streamUrl: s.ingest_url,
        token: s.secret_token,
        logs: [],
      }));
      setLogStreams(items);
    } catch (err) {
      console.error("[console] failed to load log streams", err);
    }
  }, [user]);

  const fetchLogContext = useCallback(
    async (ticketKey: string) => {
      const stream = logStreamByTicket[ticketKey];
      if (!stream) return "";
      try {
        const res = await fetch(`${EXHAUST_BASE}/streams/${stream.id}`, { credentials: "include" });
        if (!res.ok) return "";
        const data = await res.json();
        const logs: { timestamp: string; level: string; message: string; source?: string }[] = data?.stream?.logs ?? [];
        const recent = logs.slice(-20);
        const formatted = recent
          .map((l) => `[${l.timestamp}] ${l.level}${l.source ? ` ${l.source}` : ""} ${l.message}`)
          .join("\n");
        return `Log stream: ${stream.name} (${stream.id}) linked to ticket ${ticketKey}\n${formatted}`;
      } catch (err) {
        console.error("[console] failed to load log context", err);
        return "";
      }
    },
    [logStreamByTicket],
  );

  useEffect(() => {
    void fetchIssues();
    void fetchLogStreams();
  }, [fetchIssues, fetchLogStreams]);

  const handleResolveTicket = async (ticket: TicketType) => {
    const headers: Record<string, string> = {};
    const storedToken =
      localStorage.getItem("access_token") ||
      localStorage.getItem("sb-access-token") ||
      localStorage.getItem("sb-auth-token");
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
    const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id;
    if (orgId) headers["x-org-id"] = orgId;
    if (user?.id) headers["x-account-id"] = user.id;
    const license = localStorage.getItem("forge_license_key");
    if (license) headers["x-license-key"] = license;
    const issue = issueDetails[ticket.key];
    const payload = {
      issue: {
        key: ticket.key,
        fields: {
          summary: issue?.summary ?? ticket.title,
          description: issue?.descriptionHtml ?? ticket.description,
          status: { name: "Done" },
          reporter: { displayName: ticket.reporter },
          priority: { name: ticket.priority },
        },
        changelog: issue?.changelog,
      },
    };
    try {
      await fetch(`${API_BASE}/connectors/jira/api/issues/${ticket.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({
          fields: {
            resolution: { name: "Done" },
            status: { name: "Done" },
          },
        }),
      });
      await fetch(`${API_BASE}/connectors/jira/api/issues/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      setTickets((prev) => prev.map((t) => (t.key === ticket.key ? { ...t, status: "closed" } : t)));
      setTicketView("resolved");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Ticket ${ticket.key} resolved and ingested.` },
      ]);
      setToast(`Ticket ${ticket.key} resolved`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error("[console] failed to ingest resolved ticket", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const needsZscalerKb = /\b(zscaler|zpa|zia|zdx|zs cloud|zero trust|z-tunnel|z tunnel|private access|internet access)\b/i.test(
      input,
    );
    const history = messages
      .filter((m) => m.content && m.content !== "__streaming__")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    const logContext = selectedTicket ? await fetchLogContext(selectedTicket.key) : "";
    const kbInstruction = needsZscalerKb
      ? "\n\nWhen the user mentions Zscaler, search the Zscaler KB, cite sources, and answer concisely."
      : "\n\nAlways search the internal KB embeddings first and cite sources; if no relevant matches are found, fall back to LLM.";
    const citationInstruction =
      "\n\nCite sources inline using [source-name](url) and end with a bullet list under 'Sources:'; if no sources, explicitly say 'No sources found.'";
    const logInstruction = logContext ? `\n\nLive Log Context:\n${logContext}` : "";
    const payload = history
      ? `${history}${logInstruction}\nUser: ${input}${kbInstruction}${citationInstruction}`
      : `${logInstruction}${input}${kbInstruction}${citationInstruction}`;
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
      const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id;
      const accountId = user?.id;
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
          ...(license ? { "x-license-key": license } : {}),
          ...(orgId ? { "x-org-id": orgId } : {}),
          ...(accountId ? { "x-account-id": accountId } : {}),
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

  const handleSelectTicket = async (ticket: TicketType) => {
    setSelectedTicket(ticket);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Loading ${ticket.key}... fetching full details and similar issues.`,
      },
    ]);
    const headers: Record<string, string> = {};
    const storedToken =
      localStorage.getItem("access_token") ||
      localStorage.getItem("sb-access-token") ||
      localStorage.getItem("sb-auth-token");
    if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
    const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id;
    if (orgId) headers["x-org-id"] = orgId;
    if (user?.id) headers["x-account-id"] = user.id;
    const license = localStorage.getItem("forge_license_key");
    if (license) headers["x-license-key"] = license;
    try {
      const issue = await getIssueDetails(ticket.key, headers);
      setIssueDetails((prev) => ({ ...prev, [ticket.key]: issue }));

      const body = JSON.stringify({
        projectKey: issue.key?.split("-")?.[0],
        summary: issue.summary,
        description: issue.descriptionHtml,
        limit: 5,
      });
      try {
        const res = await fetch(`${API_BASE}/connectors/jira/api/issues/similar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          credentials: "include",
          body,
        });
        if (res.ok) {
          const data = await res.json();
          setSimilarIssues((prev) => ({ ...prev, [ticket.key]: data.items ?? [] }));
        } else {
          setSimilarIssues((prev) => ({ ...prev, [ticket.key]: [] }));
        }
      } catch (err) {
        console.error("[console] failed to load similar issues", err);
        setSimilarIssues((prev) => ({ ...prev, [ticket.key]: [] }));
      }

      const descText = issue.descriptionHtml ? cleanDescription(issue.descriptionHtml) : ticket.description;
      setMessages((prev) => [
        ...prev.filter((m) => !m.content.startsWith("Loading ")),
        {
          role: "assistant",
          content: `**${ticket.key}: ${issue.summary || ticket.title}**\n\n**Priority:** ${ticket.priority}\n**Reporter:** ${ticket.reporter}\n**Status:** ${ticket.status}\n\n**Description:**\n${descText}\n\nWould you like me to proceed with analyzing and fixing this issue?`,
        },
      ]);
    } catch (err) {
      console.error("[console] failed to load issue details", err);
      setMessages((prev) => [
        ...prev.filter((m) => !m.content.startsWith("Loading ")),
        {
          role: "assistant",
          content: `**${ticket.key}: ${ticket.title}**\n\n**Priority:** ${ticket.priority}\n**Reporter:** ${ticket.reporter}\n**Status:** ${ticket.status}\n\n**Description:**\n${ticket.description || "Description not available."}\n\nWould you like me to proceed with analyzing and fixing this issue?`,
        },
      ]);
    }
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

  const shouldCenterIntro =
    showTicketView &&
    messages.length === 1 &&
    messages[0]?.role === "assistant" &&
    messages[0]?.content.includes("I've loaded your Jira issues");

  const renderMessages = () => (
    <div
      className={cn(
        "max-w-3xl mx-auto space-y-6",
        shouldCenterIntro && "h-full flex flex-col justify-center items-center",
      )}
    >
      {messages.map((message, i) => (
        <div
          key={i}
          className={`flex ${
            shouldCenterIntro ? "justify-center" : message.role === "user" ? "justify-end" : "justify-start"
          } animate-fade-in`}
        >
          <div
            className={cn(
              "max-w-[80%] whitespace-pre-wrap",
              message.role === "user"
                ? "rounded-2xl px-4 py-3 bg-atlas-glow/20 text-foreground ml-auto"
                : "text-foreground prose prose-invert max-w-none",
              shouldCenterIntro && "text-center",
            )}
          >
            {message.role === "assistant" ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node, ...props }) => (
                    <a className="text-blue-400 underline" target="_blank" rel="noreferrer" {...props} />
                  ),
                  ul: ({ node, ...props }) => <ul className="list-disc pl-4 space-y-1" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-4 space-y-1" {...props} />,
                }}
              >
                {formatAssistantMarkdown(message.content)}
              </ReactMarkdown>
            ) : (
              formatContent(message.content)
            )}
          </div>
        </div>
      ))}
      {isTyping && (
        <div className="flex justify-start animate-fade-in">
          <div className="w-10 h-10 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-atlas-glow animate-pulse-scale" />
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
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground hover:bg-transparent h-9 w-9"
                onClick={() => setShowPlusMenu((v) => !v)}
              >
                <Plus className="h-5 w-5" />
              </Button>
              {showPlusMenu && (
                <div className="absolute left-0 mt-2 w-40 rounded-xl border border-border bg-card shadow-lg z-10">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors rounded-t-xl"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setShowPlusMenu(false);
                      setShowLogModal(true);
                    }}
                  >
                    Connect logs
                  </button>
                </div>
              )}
            </div>
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
      <>
        <div className="flex h-screen gap-4 p-4 max-w-7xl mx-auto relative">
          <div className="flex-[3] flex flex-col bg-card/30 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden">
            {toast && (
              <div className="absolute top-6 right-6 z-50">
                <div className="bg-card/90 border border-border text-foreground px-4 py-3 rounded-xl shadow-lg animate-fade-in">
                  {toast}
                </div>
              </div>
            )}
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
              issueDetails={issueDetails}
              similarIssues={similarIssues}
              view={ticketView}
              onChangeView={setTicketView}
              onResolveTicket={handleResolveTicket}
            />
          </div>
        </div>
        <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Connect logs</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {logStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground">No log streams yet. Create one in Exhausts.</p>
              ) : (
                logStreams.map((stream) => (
                  <div key={stream.id} className="p-3 rounded-lg border border-border/50 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{stream.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{stream.streamUrl}</div>
                      {selectedTicket && (
                        <div className="text-[11px] text-muted-foreground">
                          Ticket: {selectedTicket.key}
                          {logStreamByTicket[selectedTicket.key]?.id === stream.id ? " (attached)" : ""}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-sm text-blue-400 hover:underline"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `curl -X POST ${stream.streamUrl} -H "Authorization: Bearer ${stream.token}" --data-binary @/path/to/logfile.log`,
                          );
                        }}
                      >
                        Copy
                      </button>
                      {selectedTicket && (
                        <button
                          className="text-sm text-emerald-400 hover:underline"
                          onClick={() => {
                            setLogStreamByTicket((prev) => ({ ...prev, [selectedTicket.key]: stream }));
                            setToast(`Logs linked to ${selectedTicket.key}`);
                            setShowLogModal(false);
                          }}
                        >
                          Attach
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col h-screen">
        <div className="flex-1 overflow-y-auto p-8" ref={scrollRef}>
          {messages.length === 0 ? renderWelcome() : renderMessages()}
        </div>
        {renderInput()}
      </div>
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect logs</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {logStreams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No log streams yet. Create one in Exhausts.</p>
            ) : (
              logStreams.map((stream) => (
                <div key={stream.id} className="p-3 rounded-lg border border-border/50 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{stream.name}</div>
                    <div className="text-xs text-muted-foreground">{stream.streamUrl}</div>
                  </div>
                  <button
                    className="text-sm text-blue-400 hover:underline"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `curl -X POST ${stream.streamUrl} -H "Authorization: Bearer ${stream.token}" --data-binary @/path/to/logfile.log`,
                      );
                      setShowLogModal(false);
                    }}
                  >
                    Copy command
                  </button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
