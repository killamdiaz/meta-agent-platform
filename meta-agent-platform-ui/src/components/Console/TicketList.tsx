import { Ticket } from "@/data/mockTickets";
import { cn } from "@/lib/utils";

type TicketListProps = {
  tickets: Ticket[];
  selectedTicket: Ticket | null;
  onSelectTicket: (ticket: Ticket) => void;
};

const priorityColors: Record<Ticket["priority"], string> = {
  P1: "bg-red-500/20 text-red-400 border-red-500/30",
  P2: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  P3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  P4: "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function TicketList({ tickets, selectedTicket, onSelectTicket }: TicketListProps) {
  const groupedTickets = tickets.reduce((acc, ticket) => {
    if (!acc[ticket.priority]) acc[ticket.priority] = [];
    acc[ticket.priority].push(ticket);
    return acc;
  }, {} as Record<string, Ticket[]>);

  const priorities: Ticket["priority"][] = ["P1", "P2", "P3", "P4"];

  return (
    <div className="space-y-6">
      {priorities.map((priority) => {
        const priorityTickets = groupedTickets[priority];
        if (!priorityTickets?.length) return null;

        return (
          <div key={priority}>
            <div className="flex items-center gap-2 mb-3">
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded border", priorityColors[priority])}>
                {priority}
              </span>
              <span className="text-xs text-muted-foreground">
                {priorityTickets.length} ticket{priorityTickets.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {priorityTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => onSelectTicket(ticket)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    selectedTicket?.id === ticket.id
                      ? "bg-atlas-glow/10 border-atlas-glow/50"
                      : "bg-card/50 border-border/50 hover:border-border hover:bg-card/80",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">{ticket.key}</span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        ticket.status === "open"
                          ? "bg-blue-500/20 text-blue-400"
                          : ticket.status === "in-progress"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-green-500/20 text-green-400",
                      )}
                    >
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground line-clamp-1">{ticket.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ticket.description}</p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
