import { useState } from "react";
import { Brain, AlertCircle, Lightbulb, History, Stethoscope, ChevronDown, ChevronUp } from "lucide-react";
import { AIAnalysis, AIFinding } from "@/data/mockExhausts";
import { cn } from "@/lib/utils";

interface AIAnalysisPanelProps {
  analysis: AIAnalysis;
  className?: string;
}

const findingIcons = {
  error_pattern: AlertCircle,
  suggestion: Lightbulb,
  match: History,
  diagnosis: Stethoscope,
};

const severityColors = {
  critical: "border-l-red-500 bg-red-500/5",
  warning: "border-l-amber-500 bg-amber-500/5",
  info: "border-l-blue-500 bg-blue-500/5",
};

const severityIconColors = {
  critical: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

const FindingCard = ({ finding }: { finding: AIFinding }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const Icon = findingIcons[finding.type];
  const severity = finding.severity || "info";

  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("```")) {
        return null;
      }
      if (line.startsWith("- ")) {
        return (
          <li key={i} className="text-sm text-muted-foreground ml-4 list-disc">
            {line.replace("- ", "")}
          </li>
        );
      }
      if (line.match(/^\d+\.\s/)) {
        return (
          <li key={i} className="text-sm text-muted-foreground ml-4 list-decimal">
            {line.replace(/^\d+\.\s/, "")}
          </li>
        );
      }
      if (line.trim().length === 0) {
        return <div key={i} className="h-2" />;
      }
      return (
        <p key={i} className="text-sm text-muted-foreground">
          {line}
        </p>
      );
    });
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 p-4 bg-card/40 backdrop-blur-sm",
        "transition-all duration-200",
        severityColors[severity as keyof typeof severityColors],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg bg-muted/50", severityIconColors[severity as keyof typeof severityIconColors])}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground/80">{finding.type}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground">NEW</span>
            </div>
            <h3 className="font-semibold text-foreground mt-1">{finding.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{new Date(finding.timestamp).toLocaleTimeString()}</p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground"
          aria-label="Toggle finding details"
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {finding.content.includes("```bash") ? (
            <div className="rounded-lg bg-[#0d0d12] border border-border/50 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-card/50 border-b border-border/50">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">Suggested Command</span>
              </div>
              <pre className="p-3 text-xs text-emerald-400 font-mono whitespace-pre-wrap">
                {finding.content.replace("```bash", "").replace("```", "")}
              </pre>
            </div>
          ) : (
            <div className="space-y-1">{renderContent(finding.content)}</div>
          )}
        </div>
      )}
    </div>
  );
};

export function AIAnalysisPanel({ analysis, className }: AIAnalysisPanelProps) {
  return (
    <div className={cn("flex-1 flex flex-col", className)}>
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">AI Analysis</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground uppercase">
                {analysis.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{analysis.statusMessage}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {analysis.findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>
    </div>
  );
}
