import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandBox } from "./CommandBox";
import { StatusBadge } from "./StatusBadge";
import { mockTickets } from "@/data/mockTickets";
import { Loader2 } from "lucide-react";

interface CreateStreamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateStream: (name: string, ticketKey: string | null) => void;
}

export const CreateStreamModal = ({ open, onOpenChange, onCreateStream }: CreateStreamModalProps) => {
  const [streamName, setStreamName] = useState("");
  const [linkedTicket, setLinkedTicket] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  // Generate mock URL and token
  const streamUrl = streamName 
    ? `https://atlas.exhaust.io/stream/${streamName.toLowerCase().replace(/\s+/g, '-')}`
    : '';
  const token = `exh_live_${Math.random().toString(36).substring(2, 22)}`;

  const handleCreate = async () => {
    if (!streamName.trim()) return;
    
    setIsCreating(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsCreating(false);
    setIsCreated(true);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation
    setTimeout(() => {
      setStreamName("");
      setLinkedTicket("");
      setIsCreated(false);
    }, 200);
  };

  const handleConfirm = () => {
    onCreateStream(streamName, linkedTicket || null);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isCreated ? "Stream Created" : "Create New Log Stream"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!isCreated ? (
            <>
              {/* Stream Name */}
              <div className="space-y-2">
                <Label htmlFor="stream-name">Stream Name</Label>
                <Input
                  id="stream-name"
                  placeholder="e.g., prod-api-logs"
                  value={streamName}
                  onChange={(e) => setStreamName(e.target.value)}
                  className="bg-muted/30"
                />
              </div>

              {/* Link to Ticket */}
              <div className="space-y-2">
                <Label htmlFor="linked-ticket">Link to Ticket (Optional)</Label>
                <Select value={linkedTicket} onValueChange={setLinkedTicket}>
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue placeholder="Select a ticket..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mockTickets.map((ticket) => (
                      <SelectItem key={ticket.id} value={ticket.key}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{ticket.key}</span>
                          <span className="truncate">{ticket.title}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              {streamName && (
                <div className="space-y-2 p-4 rounded-lg bg-muted/20 border border-border/50">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Preview
                  </p>
                  <p className="text-sm font-mono text-foreground/80 truncate">
                    {streamUrl}
                  </p>
                </div>
              )}

              {/* Create Button */}
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={!streamName.trim() || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Stream...
                  </>
                ) : (
                  "Create Stream"
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-foreground">{streamName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status="waiting" />
                    {linkedTicket && (
                      <span className="text-xs text-muted-foreground">
                        Linked to {linkedTicket}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Command Box */}
              <CommandBox streamUrl={streamUrl} token={token} />

              {/* Info */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-blue-400 text-xs">i</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Share the command above with your user. Once they run it, logs will start streaming in real-time.
                </p>
              </div>

              {/* Done Button */}
              <Button className="w-full" onClick={handleConfirm}>
                Done
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
