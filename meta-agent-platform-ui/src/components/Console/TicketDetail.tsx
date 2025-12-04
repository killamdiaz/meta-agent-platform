import { useState } from "react";
import { ChevronLeft, ChevronUp, ChevronDown, MoreHorizontal, Link2, Paperclip } from "lucide-react";
import { Ticket } from "@/data/mockTickets";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TicketDetailProps = {
  ticket: Ticket;
  onBack: () => void;
};

export default function TicketDetail({ ticket, onBack }: TicketDetailProps) {
  const [activeTab, setActiveTab] = useState<"All" | "Comments" | "History" | "Work log" | "Approvals">("Comments");
  const [showDetails, setShowDetails] = useState(true);
  const tabs = ["All", "Comments", "History", "Work log", "Approvals"] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded">{ticket.key}</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-4">{ticket.title}</h2>

      <div className="flex items-center gap-2 mb-6">
        <Button variant="outline" size="sm" className="text-xs h-8">
          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Create subtask
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-8">
          <Link2 className="w-3.5 h-3.5 mr-1.5" />
          Link work item
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-8">
          Create
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>

      <div className="bg-card/50 border border-border/50 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-xs font-medium text-white">
              {ticket.reporter
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <p className="text-sm">
                <span className="font-medium text-foreground">{ticket.reporter}</span>
                <span className="text-muted-foreground"> raised this request via </span>
                <span className="font-medium text-foreground">{ticket.source}</span>
              </p>
              <button className="text-xs text-atlas-glow hover:underline">View request in portal</button>
            </div>
          </div>
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-atlas-glow hover:underline">
            {showDetails ? "Hide" : "Show"} details
          </button>
        </div>

        {showDetails && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground mb-1">Description</p>
            <p className="text-sm text-foreground">{ticket.description}</p>
          </div>
        )}
      </div>

      <div className="bg-card/50 border border-border/50 rounded-lg p-4 mb-6">
        <button className="w-full flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Similar requests</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1">
        <h3 className="text-sm font-medium text-foreground mb-3">Activity</h3>
        <div className="flex items-center gap-1 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md transition-colors",
                activeTab === tab
                  ? "bg-atlas-glow/20 text-atlas-glow"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-xs font-medium text-white">
            ZM
          </div>
          <div className="flex-1 flex items-center gap-2">
            <button className="text-xs text-atlas-glow hover:underline">Add internal note</button>
            <span className="text-muted-foreground">/</span>
            <button className="text-xs text-atlas-glow hover:underline">Reply to customer</button>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
            <Paperclip className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          <span className="font-medium">Pro tip:</span> press{" "}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">M</kbd> to comment
        </p>
      </div>
    </div>
  );
}
