import { Ticket } from "@/data/mockTickets";
import TicketList from "./TicketList";
import TicketDetail from "./TicketDetail";
import type { SimilarIssue } from "@/types/jira";
import type { JiraIssueDetails } from "@/hooks/useJiraIssue";
import { cn } from "@/lib/utils";

type TicketDrawerProps = {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  onSelectTicket: (ticket: Ticket) => void;
  onClearSelection: () => void;
  onResolveTicket?: (ticket: Ticket) => void;
  loading?: boolean;
  issueDetails?: Record<string, JiraIssueDetails | undefined>;
  similarIssues?: Record<string, SimilarIssue[] | undefined>;
  view?: "pending" | "resolved";
  onChangeView?: (view: "pending" | "resolved") => void;
};

export default function TicketDrawer({
  tickets,
  selectedTicket,
  onSelectTicket,
  onClearSelection,
  onResolveTicket,
  loading,
  issueDetails,
  similarIssues,
  view = "pending",
  onChangeView,
}: TicketDrawerProps) {
  const filtered = tickets.filter((t) =>
    view === "pending" ? t.status !== "closed" : t.status === "closed",
  );
  return (
    <div className="h-full bg-card/30 backdrop-blur-sm border border-border/50 rounded-2xl p-5 flex flex-col">
      {selectedTicket ? (
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto pr-1">
            <TicketDetail
              ticket={selectedTicket}
              onBack={onClearSelection}
              details={issueDetails?.[selectedTicket.key]}
              similarIssues={similarIssues?.[selectedTicket.key]}
            />
          </div>
          <div className="pt-4">
            <button
              onClick={() => onResolveTicket?.(selectedTicket)}
              className="w-full text-center py-2 px-3 rounded-md bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              Resolve ticket
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => onChangeView?.("pending")}
              className={cn(
                "flex-1 text-sm py-2 rounded-lg border",
                view === "pending"
                  ? "border-atlas-glow/60 text-foreground"
                  : "border-border/50 text-muted-foreground hover:text-foreground",
              )}
            >
              Pending
            </button>
            <button
              onClick={() => onChangeView?.("resolved")}
              className={cn(
                "flex-1 text-sm py-2 rounded-lg border",
                view === "resolved"
                  ? "border-atlas-glow/60 text-foreground"
                  : "border-border/50 text-muted-foreground hover:text-foreground",
              )}
            >
              Resolved
            </button>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Tickets</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading your assigned Jira issues...</p>
          ) : filtered.length ? (
            <TicketList tickets={filtered} selectedTicket={selectedTicket} onSelectTicket={onSelectTicket} />
          ) : (
            <p className="text-sm text-muted-foreground">No assigned Jira issues found.</p>
          )}
        </>
      )}
    </div>
  );
}
