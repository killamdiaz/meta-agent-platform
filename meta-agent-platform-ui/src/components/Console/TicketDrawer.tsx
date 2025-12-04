import { Ticket } from "@/data/mockTickets";
import TicketList from "./TicketList";
import TicketDetail from "./TicketDetail";

type TicketDrawerProps = {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  onSelectTicket: (ticket: Ticket) => void;
  onClearSelection: () => void;
  loading?: boolean;
};

export default function TicketDrawer({ tickets, selectedTicket, onSelectTicket, onClearSelection, loading }: TicketDrawerProps) {
  return (
    <div className="h-full bg-card/30 backdrop-blur-sm border border-border/50 rounded-2xl p-5 overflow-y-auto">
      {selectedTicket ? (
        <TicketDetail ticket={selectedTicket} onBack={onClearSelection} />
      ) : (
        <>
          <h2 className="text-lg font-semibold text-foreground mb-4">Your Tickets</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading your assigned Jira issues...</p>
          ) : tickets.length ? (
            <TicketList tickets={tickets} selectedTicket={selectedTicket} onSelectTicket={onSelectTicket} />
          ) : (
            <p className="text-sm text-muted-foreground">No assigned Jira issues found.</p>
          )}
        </>
      )}
    </div>
  );
}
