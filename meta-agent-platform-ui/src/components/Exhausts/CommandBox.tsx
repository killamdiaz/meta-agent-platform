import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CommandBoxProps {
  streamUrl: string;
  token: string;
  className?: string;
}

export function CommandBox({ streamUrl, token, className }: CommandBoxProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const cliCommand = `curl -X POST ${streamUrl} \\
  -H "Authorization: Bearer ${token}" \\
  --data-binary @/path/to/logfile.log`;

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => copyToClipboard(text, field)}>
      {copiedField === field ? (
        <>
          <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 mr-1" />
          Copy
        </>
      )}
    </Button>
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stream URL</label>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <code className="flex-1 text-sm font-mono text-foreground/80 truncate">{streamUrl}</code>
          <CopyButton text={streamUrl} field="URL" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">One-Time Token</label>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
          <code className="flex-1 text-sm font-mono text-foreground/80 truncate">{token}</code>
          <CopyButton text={token} field="Token" />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5" />
          CLI Command
        </label>
        <div className="relative rounded-lg bg-[#0d0d12] border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-card/30 border-b border-border/50">
            <span className="text-xs text-muted-foreground font-mono">bash</span>
            <CopyButton text={cliCommand.replace(/\\\n\s*/g, " ")} field="Command" />
          </div>
          <pre className="p-4 overflow-x-auto">
            <code className="text-sm font-mono text-emerald-400 whitespace-pre">{cliCommand}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
