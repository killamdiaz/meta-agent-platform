import { useState, useEffect, useRef } from "react";
import { LogEntry } from "@/data/mockExhausts";
import { cn } from "@/lib/utils";
import { Pause, Play, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TerminalViewerProps {
  logs: LogEntry[];
  className?: string;
}

const levelColors = {
  ERROR: "text-red-400",
  WARN: "text-amber-400",
  INFO: "text-blue-400",
  DEBUG: "text-muted-foreground",
};

const levelBgColors = {
  ERROR: "bg-red-500/10",
  WARN: "bg-amber-500/10",
  INFO: "bg-blue-500/10",
  DEBUG: "bg-muted/30",
};

export function TerminalViewer({ logs, className }: TerminalViewerProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && !isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isPaused]);

  const formatTimestamp = (timestamp: string | number | null | undefined) => {
    if (!timestamp) return "-";
    let date: Date | null = null;
    if (typeof timestamp === "number") {
      // If it's seconds, convert to ms; if it's already ms, Date will handle.
      const secsToMs = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
      date = new Date(secsToMs);
    } else if (typeof timestamp === "string") {
      const asNumber = Number(timestamp);
      if (!Number.isNaN(asNumber) && asNumber !== 0) {
        const secsToMs = asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber;
        date = new Date(secsToMs);
      } else {
        const parsed = new Date(timestamp);
        date = Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }
    if (!date || Number.isNaN(date.getTime())) return "-";
    const time = date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${time}.${ms}`;
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border/50 bg-[#0d0d12] overflow-hidden h-full",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-card/50 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs text-muted-foreground ml-2 font-mono">live-stream.log</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAutoScroll(!autoScroll)}>
            <ArrowDownToLine className={cn("w-3.5 h-3.5 mr-1", autoScroll && "text-emerald-400")} />
            Auto-scroll
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 mr-1" />
                Pause
              </>
            )}
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-y-auto p-4 font-mono text-sm space-y-1 h-full">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <p className="text-sm">Waiting for logs...</p>
              <p className="text-xs mt-1 opacity-60">Logs will appear here in real-time</p>
            </div>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={cn("flex items-start gap-3 px-2 py-1 rounded", levelBgColors[log.level])}>
              <span className="text-muted-foreground text-xs shrink-0 opacity-60">{formatTimestamp(log.timestamp)}</span>
              <span className={cn("text-xs font-semibold uppercase w-12 shrink-0", levelColors[log.level])}>{log.level}</span>
              {log.source && (
                <span className="text-xs text-muted-foreground shrink-0 opacity-60">[{log.source}]</span>
              )}
              <span className="text-foreground/90 break-all">{log.message}</span>
            </div>
          ))
        )}
        {!isPaused && logs.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs pt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Streaming...
          </div>
        )}
      </div>
    </div>
  );
}
