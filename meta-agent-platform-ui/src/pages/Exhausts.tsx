import { useEffect, useMemo, useState } from "react";
import { Plus, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExhaustsTable } from "@/components/Exhausts/ExhaustsTable";
import { CreateStreamModal } from "@/components/Exhausts/CreateStreamModal";
import { LogStreamView } from "@/components/Exhausts/LogStreamView";
import { type ExhaustStream } from "@/data/mockExhausts";
import { toast } from "sonner";
import { API_BASE, EXHAUST_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate, useParams } from "react-router-dom";

export default function Exhausts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { streamId } = useParams<{ streamId: string }>();
  const [streams, setStreams] = useState<ExhaustStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<ExhaustStream | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   const orgId = useMemo(
    () => (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? null,
    [user],
  );
  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    const token =
      localStorage.getItem("access_token") ||
      localStorage.getItem("sb-access-token") ||
      localStorage.getItem("sb-auth-token");
    if (token) h["Authorization"] = `Bearer ${token}`;
    if (orgId) h["x-org-id"] = orgId;
    const license = localStorage.getItem("forge_license_key");
    if (license) h["x-license-key"] = license;
    return h;
  }, [user, orgId]);

  const fetchStreams = async () => {
    try {
      const res = await fetch(`${EXHAUST_BASE}/exhausts${orgId ? `?org_id=${orgId}` : ""}`, {
        headers,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const items =
        (data.items as any[])?.map((s) => ({
          id: s.id,
          name: s.name,
          status: "waiting",
          linkedTicket: null,
          ticketKey: null,
          createdBy: s.created_by ?? "You",
          createdAt: s.created_at,
          lastActivity: s.created_at,
          streamUrl: s.ingest_url,
          token: s.secret_token,
          logs: [],
        })) ?? [];
      setStreams(items);
      if (streamId) {
        const found = items.find((s) => s.id === streamId);
        if (found) {
          setSelectedStream(found);
        }
      }
    } catch (err) {
      console.error("[exhaust] failed to load streams", err);
      toast.error("Failed to load streams");
    }
  };

  useEffect(() => {
    void fetchStreams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, streamId]);

  const handleCreateStream = async (name: string, ticketKey: string | null, type: "custom" | "zscaler_lss") => {
    const res = await fetch(`${EXHAUST_BASE}/exhausts/create`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ name, org_id: orgId, type }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const newStream: ExhaustStream = {
      id: data.exhaust_id,
      name,
      status: "waiting",
      linkedTicket: ticketKey ? `Ticket ${ticketKey}` : null,
      ticketKey,
      createdBy: user?.email || "You",
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      streamUrl: data.ingest_url || data.lss_ingest_url || "",
      token: data.lss_secret || data.secret_token || "",
      logs: [],
    };
    setStreams((prev) => [newStream, ...prev]);
    navigate(`/exhausts/${newStream.id}`);
    toast.success("Stream created successfully");
    return data;
  };

  const handleDeleteStream = (streamId: string) => {
    fetch(`${EXHAUST_BASE}/exhausts/${streamId}`, {
      method: "DELETE",
      headers,
      credentials: "include",
    })
      .then(() => {
        setStreams((prev) => prev.filter((s) => s.id !== streamId));
        if (selectedStream?.id === streamId) setSelectedStream(null);
        navigate("/exhausts");
        toast.success("Stream deleted");
      })
      .catch((err) => {
        console.error("[exhaust] failed to delete stream", err);
        toast.error("Failed to delete stream");
      });
  };

  const handleDisconnectStream = () => {
    if (selectedStream) {
      setStreams((prev) =>
        prev.map((s) => (s.id === selectedStream.id ? { ...s, status: "disconnected" as const } : s)),
      );
      setSelectedStream({ ...selectedStream, status: "disconnected" });
      toast.success("Stream disconnected");
    }
  };

  const handleSelectStream = (stream: ExhaustStream) => {
    setSelectedStream(stream);
    navigate(`/exhausts/${stream.id}`);
  };

  const activeCount = streams.filter((s) => s.status === "active").length;
  const waitingCount = streams.filter((s) => s.status === "waiting").length;
  const disconnectedCount = streams.filter((s) => s.status === "disconnected").length;

  return (
    <div className="flex flex-col h-full bg-background">
      {selectedStream ? (
        <LogStreamView
          stream={selectedStream}
          onBack={() => setSelectedStream(null)}
          onDisconnect={handleDisconnectStream}
          onDelete={() => handleDeleteStream(selectedStream.id)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                <Radio className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Exhausts</h1>
                <p className="text-sm text-muted-foreground">Real-Time Log Streams</p>
              </div>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create New Log Stream
            </Button>
          </div>

          <div className="px-6 py-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{activeCount}</span> Active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{waitingCount}</span> Waiting
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{disconnectedCount}</span> Disconnected
              </span>
            </div>
          </div>

          <div className="flex-1 px-6 pb-6 overflow-auto">
            <ExhaustsTable streams={streams} onViewStream={handleSelectStream} onDeleteStream={handleDeleteStream} />
          </div>
        </>
      )}

      <CreateStreamModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onCreateStream={handleCreateStream}
      />
    </div>
  );
}
