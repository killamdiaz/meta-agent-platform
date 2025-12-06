import { useEffect, useState } from "react";
import { AlertCircle, Lightbulb } from "lucide-react";
import { EXHAUST_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";

type ErrorSummary = {
  summary: string;
  log_excerpt?: string;
  created_at?: string;
};

interface Props {
  streamId: string;
}

export function ErrorSummariesPanel({ streamId }: Props) {
  const [items, setItems] = useState<ErrorSummary[]>([]);

  useEffect(() => {
    let active = true;
    const fetchSummaries = async () => {
      try {
        const res = await fetch(`${EXHAUST_BASE}/exhausts/${streamId}/errors`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setItems((data.items as ErrorSummary[]) || []);
      } catch {
        /* ignore */
      }
    };
    fetchSummaries();
    const id = setInterval(fetchSummaries, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [streamId]);

  if (!items.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>No recent error patterns detected.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-foreground">AI Error Summaries</span>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="border border-border/50 rounded-lg p-3 bg-card/40">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <span>{item.created_at ? new Date(item.created_at).toLocaleString() : "Just now"}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap text-foreground">{item.summary}</div>
          {item.log_excerpt && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/20 p-2 rounded">
              <span className="font-semibold text-foreground/80">Excerpt:</span> {item.log_excerpt}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
