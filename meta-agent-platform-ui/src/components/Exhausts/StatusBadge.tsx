import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: "active" | "waiting" | "disconnected" }) {
  const styles: Record<typeof status, string> = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    waiting: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    disconnected: "bg-red-500/10 text-red-400 border-red-500/30",
  };

  const label: Record<typeof status, string> = {
    active: "Active",
    waiting: "Waiting",
    disconnected: "Disconnected",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border",
        styles[status],
      )}
    >
      <span className="w-2 h-2 rounded-full bg-current opacity-80" />
      {label[status]}
    </span>
  );
}
