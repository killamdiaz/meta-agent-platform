import { useMemo } from "react";
import { AgentConfigField } from "@/types/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface DynamicAgentConfigFormProps {
  schema: AgentConfigField[];
  values: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  disabled?: boolean;
  onChange: (nextValues: Record<string, unknown>) => void;
}

const fieldWrapperClass = "flex flex-col gap-2";

function renderHint({ description, tooltip, secure }: { description?: string; tooltip?: string; secure?: boolean }) {
  if (!description && !tooltip && !secure) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {secure && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-200">
          <Lock className="h-3 w-3" />
          Secret
        </span>
      )}
      {description && <span>{description}</span>}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function DynamicAgentConfigForm({ schema, values, defaults, disabled, onChange }: DynamicAgentConfigFormProps) {
  const mergedValues = useMemo(() => {
    const next: Record<string, unknown> = { ...defaults, ...values };
    return next;
  }, [defaults, values]);

  const updateValue = (key: string, value: unknown) => {
    const next = { ...mergedValues, [key]: value };
    onChange(next);
  };

  if (!schema.length) {
    return <p className="text-sm text-muted-foreground">No additional configuration is required.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {schema.map((field) => {
        const currentValue = mergedValues[field.key];
        const placeholder = field.placeholder ?? (field.required ? "Required" : "Optional");
        return (
          <div key={field.key} className={fieldWrapperClass}>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground" htmlFor={`config-${field.key}`}>
                {field.label}
                {field.required && <span className="ml-1 text-red-400">*</span>}
              </Label>
            </div>
            {(() => {
              switch (field.type) {
                case "textarea":
                  return (
                    <Textarea
                      id={`config-${field.key}`}
                      value={typeof currentValue === "string" ? currentValue : ""}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={placeholder}
                      disabled={disabled}
                      className="resize-none"
                    />
                  );
                case "boolean":
                  return (
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`config-${field.key}`}
                        checked={Boolean(currentValue)}
                        onCheckedChange={(checked) => updateValue(field.key, checked)}
                        disabled={disabled}
                      />
                      <Label htmlFor={`config-${field.key}`} className="text-sm text-muted-foreground">
                        {placeholder}
                      </Label>
                    </div>
                  );
                case "select":
                  return (
                    <Select
                      value={typeof currentValue === "string" ? currentValue : undefined}
                      onValueChange={(value) => updateValue(field.key, value)}
                      disabled={disabled}
                    >
                      <SelectTrigger id={`config-${field.key}`}>
                        <SelectValue placeholder={placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                case "number":
                  return (
                    <Input
                      id={`config-${field.key}`}
                      type="number"
                      value={typeof currentValue === "number" ? currentValue : currentValue ?? ""}
                      onChange={(event) => updateValue(field.key, Number(event.target.value))}
                      placeholder={placeholder}
                      disabled={disabled}
                    />
                  );
                case "password":
                  return (
                    <Input
                      id={`config-${field.key}`}
                      type="password"
                      value={typeof currentValue === "string" ? currentValue : ""}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={placeholder}
                      disabled={disabled}
                    />
                  );
                case "string":
                default:
                  return (
                    <Input
                      id={`config-${field.key}`}
                      type="text"
                      value={typeof currentValue === "string" ? currentValue : currentValue ?? ""}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={placeholder}
                      disabled={disabled}
                    />
                  );
              }
            })()}
            {renderHint({ description: field.description, tooltip: field.tooltip, secure: field.secure })}
          </div>
        );
      })}
    </div>
  );
}

export default DynamicAgentConfigForm;
