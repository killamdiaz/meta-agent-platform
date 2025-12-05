import { useState } from "react";
import { ExhaustStream, mockAIAnalysis } from "@/data/mockExhausts";
import { StatusBadge } from "./StatusBadge";
import { TerminalViewer } from "./TerminalViewer";
import { AIAnalysisPanel } from "./AIAnalysisPanel";
import { CommandBox } from "./CommandBox";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Unplug, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface LogStreamViewProps {
  stream: ExhaustStream;
  onBack: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}

export function LogStreamView({ stream, onBack, onDisconnect, onDelete }: LogStreamViewProps) {
  const [showEmptyState] = useState(stream.logs.length === 0);

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
              <TerminalViewer logs={stream.logs} className="flex-1" />
            </div>
            <div className="w-[400px] border-l border-border/50 bg-card/20 flex flex-col shrink-0">
              <AIAnalysisPanel analysis={mockAIAnalysis} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
