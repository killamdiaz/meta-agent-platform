import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types/api";
import { CheckCircle2, Clock3, GitBranch, PlayCircle, SplitSquareVertical } from "lucide-react";

type WorkflowTimelineProps = {
  steps: WorkflowStep[];
  activeStepId?: string | null;
  missingNodes?: string[];
};

// Renders a compact, readable overview of the compiled workflow steps.
export function WorkflowTimeline({ steps, activeStepId, missingNodes = [] }: WorkflowTimelineProps) {
  if (!steps?.length) {
    return (
      <Card className="p-4 bg-card/60 border-dashed border-muted">
        <p className="text-sm text-muted-foreground">No steps yet. Compile a prompt to generate a plan.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const isActive = step.id === activeStepId;
        const isMissing = step.type === "node" && missingNodes.includes(step.node);
        const icon =
          step.type === "condition" ? (
            <SplitSquareVertical className="h-4 w-4" />
          ) : isMissing ? (
            <GitBranch className="h-4 w-4" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          );

        return (
          <Card
            key={step.id}
            className={cn(
              "p-4 border bg-card/70 transition-all",
              isActive && "border-primary shadow-md shadow-primary/20",
              isMissing && "border-orange-400/60"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">{icon}</div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {index + 1}. {step.type === "condition" ? "Condition" : step.node}
                  </div>
                  <div className="flex items-center gap-2">
                    {isMissing ? (
                      <Badge variant="destructive" className="text-[11px]">
                        Missing node
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        {step.type === "condition" ? "Branch" : "Action"}
                      </Badge>
                    )}
                    {isActive ? (
                      <Badge className="bg-primary text-primary-foreground text-[11px] flex items-center gap-1">
                        <Clock3 className="h-3 w-3" /> Running
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[11px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    )}
                  </div>
                </div>
                {step.type === "condition" ? (
                  <p className="text-sm text-muted-foreground">{step.condition}</p>
                ) : (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {step.name || "Execute node"} {step.inputs && Object.keys(step.inputs).length ? "· inputs mapped" : ""}
                  </p>
                )}
                {step.type === "condition" ? (
                  <p className="text-xs text-muted-foreground">
                    onTrue → {step.onTrue ?? "next"} | onFalse → {step.onFalse ?? "next"}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
