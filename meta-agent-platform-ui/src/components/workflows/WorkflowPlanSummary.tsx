import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { WorkflowPlan } from "@/types/api";
import { AlertTriangle, Radio, Zap } from "lucide-react";

type Props = {
  plan: WorkflowPlan | null;
};

// Displays a compact summary of the compiled workflow metadata.
export function WorkflowPlanSummary({ plan }: Props) {
  if (!plan) {
    return (
      <Card className="p-4 bg-card/60 border-dashed border-muted">
        <p className="text-sm text-muted-foreground">Compile a prompt to see the workflow summary.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-card/80 via-card/70 to-card/60 border border-border/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase text-muted-foreground tracking-[0.2em]">Workflow</p>
          <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
        </div>
        <Badge variant="outline" className="flex items-center gap-1 text-[11px]">
          <Radio className="h-3 w-3" /> {plan.trigger.type} trigger
        </Badge>
      </div>

      <Separator className="my-4" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Required Nodes</div>
          <div className="flex flex-wrap gap-2">
            {(plan.requiredNodes?.length ? plan.requiredNodes : ["auto-matched"]).map((node) => (
              <Badge key={node} variant="secondary" className="text-[11px]">
                {node}
              </Badge>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Missing Nodes</div>
          <div className="flex flex-wrap gap-2">
            {plan.missingNodes?.length ? (
              plan.missingNodes.map((node) => (
                <Badge key={node} variant="destructive" className="flex items-center gap-1 text-[11px]">
                  <AlertTriangle className="h-3 w-3" />
                  {node}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-[11px] flex items-center gap-1">
                <Zap className="h-3 w-3" /> none
              </Badge>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Steps</div>
          <p className="text-sm text-foreground">
            {plan.steps.length} total · {plan.steps.filter((s) => s.type === "condition").length} conditions
          </p>
        </div>
      </div>
    </Card>
  );
}
