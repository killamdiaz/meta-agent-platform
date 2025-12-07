import { useEffect, useMemo, useState } from "react";
import { ExhaustStream, mockAIAnalysis, LogEntry } from "@/data/mockExhausts";
import { StatusBadge } from "./StatusBadge";
import { TerminalViewer } from "./TerminalViewer";
import { ErrorSummariesPanel } from "./ErrorSummariesPanel";
import { LogsChatPanel } from "./LogsChatPanel";
import { CommandBox } from "./CommandBox";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Unplug, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { EXHAUST_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface LogStreamViewProps {
  stream: ExhaustStream;
  onBack: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}

export function LogStreamView({ stream, onBack, onDisconnect, onDelete }: LogStreamViewProps) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>(stream.logs || []);
  const [showEmptyState, setShowEmptyState] = useState(stream.logs.length === 0);
  const [polling, setPolling] = useState<ReturnType<typeof setInterval> | null>(null);
  const [mode, setMode] = useState<"analysis" | "chat">("analysis");

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    const token =
      localStorage.getItem("access_token") ||
      localStorage.getItem("sb-access-token") ||
      localStorage.getItem("sb-auth-token");
    if (token) h["Authorization"] = `Bearer ${token}`;
    const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id;
    if (orgId) h["x-org-id"] = orgId;
    return h;
  }, [user]);

  useEffect(() => {
    setLogs(stream.logs || []);
    setShowEmptyState((stream.logs || []).length === 0);
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${EXHAUST_BASE}/exhausts/${stream.id}/logs?limit=200`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        const items: LogEntry[] =
          (data.items as any[])?.map((item) => ({
            id: item.id,
            timestamp: item.timestamp || item.created_at,
            level: (item.level || "INFO").toString().toUpperCase(),
            message: item.message || item.normalized_text || "",
            raw: item.raw || item.raw_json,
          })) ?? [];
        setLogs(items.reverse());
        setShowEmptyState(items.length === 0);
      } catch {
        /* ignore */
      }
    };
    void fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    setPolling(interval);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [stream.id, stream.logs, headers]);

  const copyCommand = () => {
    const command = `curl -X POST ${stream.streamUrl} -H "Authorization: Bearer ${stream.token}" --data-binary @/path/to/logfile.log`;
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="h-6 w-px bg-border/50" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold">{stream.name}</h1>
              <StatusBadge status={stream.status} />
            </div>
            {stream.ticketKey && (
              <a
                href="#"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              >
                <span className="font-mono">{stream.ticketKey}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyCommand} className="gap-2">
            <Copy className="w-4 h-4" />
            Copy Command
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            className="gap-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
          >
            <Unplug className="w-4 h-4" />
            Disconnect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "analysis" ? "chat" : "analysis")}
            className="gap-2"
          >
            Chat
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {showEmptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-md text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-2">No logs yet</h2>
              <p className="text-muted-foreground mb-6">Ask your user to run the command below to begin streaming logs.</p>
              <div className="text-left">
                <CommandBox streamUrl={stream.streamUrl} token={stream.token} />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 p-6 overflow-hidden flex flex-col min-w-0">
              <TerminalViewer logs={logs} className="max-h-[90vh] min-h-[70vh]" />
            </div>
            <div className="w-[400px] border-l border-border/50 bg-card/20 flex flex-col shrink-0">
              {mode === "analysis" ? (
                <ErrorSummariesPanel streamId={stream.id} />
              ) : (
                <LogsChatPanel streamId={stream.id} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
