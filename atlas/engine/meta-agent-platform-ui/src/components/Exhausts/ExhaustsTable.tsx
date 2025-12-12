import { Eye, Copy, Trash2, MoreHorizontal, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ExhaustStream } from "@/data/mockExhausts";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ExhaustsTableProps {
  streams: ExhaustStream[];
  onViewStream: (stream: ExhaustStream) => void;
  onDeleteStream: (streamId: string) => void;
}

export function ExhaustsTable({ streams, onViewStream, onDeleteStream }: ExhaustsTableProps) {
  const copyCommand = (stream: ExhaustStream) => {
    const command = `curl -X POST ${stream.streamUrl} -H "Authorization: Bearer ${stream.token}" --data-binary @/path/to/logfile.log`;
    navigator.clipboard.writeText(command);
    toast.success("Command copied to clipboard");
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium">Stream Name</TableHead>
            <TableHead className="text-muted-foreground font-medium">Status</TableHead>
            <TableHead className="text-muted-foreground font-medium">Linked Ticket</TableHead>
            <TableHead className="text-muted-foreground font-medium">Created By</TableHead>
            <TableHead className="text-muted-foreground font-medium">Last Activity</TableHead>
            <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {streams.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mb-3">
                    <Eye className="w-6 h-6 opacity-50" />
                  </div>
                  <p className="text-sm">No log streams yet</p>
                  <p className="text-xs opacity-60 mt-1">Create your first stream to get started</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            streams.map((stream) => (
              <TableRow
                key={stream.id}
                className="border-border/50 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => onViewStream(stream)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                      <span className="text-xs font-mono text-violet-400">{stream.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <span className="font-medium">{stream.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={stream.status} />
                </TableCell>
                <TableCell>
                  {stream.ticketKey ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-mono text-muted-foreground">{stream.ticketKey}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50 text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{stream.createdBy}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(stream.lastActivity), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewStream(stream);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Stream
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          copyCommand(stream);
                        }}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Command
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 focus:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteStream(stream.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Stream
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
