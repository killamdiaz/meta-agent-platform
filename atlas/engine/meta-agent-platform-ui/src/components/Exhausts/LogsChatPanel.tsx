import { useState } from "react";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { EXHAUST_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatResult = {
  answer: string;
  citations: Array<{ logId: string; excerpt: string }>;
  rawRelevantLogs: Array<{ id: string; message: string }>;
};

interface Props {
  streamId: string;
}

export function LogsChatPanel({ streamId }: Props) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${EXHAUST_BASE}/logs/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, question }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ChatResult;
      setResult(data);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Error querying logs.";
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border/50 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <div>
          <div className="text-sm font-semibold text-foreground">Log Chat</div>
          <div className="text-xs text-muted-foreground">Ask questions about the latest logs.</div>
        </div>
      </div>
      <div className="p-4 space-y-3 flex-1 overflow-y-auto">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., Why are requests failing?"
          className="min-h-[120px]"
        />
        <Button onClick={ask} disabled={loading || !question.trim()} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </Button>

        {error && <div className="text-xs text-destructive">{error}</div>}

        {result && (
          <div className="space-y-3">
            <div className="text-sm text-foreground whitespace-pre-wrap">{result.answer}</div>
            {result.citations?.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <div className="font-semibold text-foreground mb-1">Citations</div>
                <ul className="space-y-1 list-disc list-inside">
                  {result.citations.map((c, idx) => (
                    <li key={`${c.logId}-${idx}`}>
                      <span className="font-mono text-foreground">{c.logId}</span>: {c.excerpt}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
