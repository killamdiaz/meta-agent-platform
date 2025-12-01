import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Link, Server, FileText, Database, Search, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

interface IngestionJob {
  id: string;
  url?: string;
  source?: string;
  status?: string;
  progress?: number;
  created_at?: string;
  metadata?: Record<string, unknown>;
  total_records?: number;
  processed_records?: number;
}

const safe = (value: any): string =>
  typeof value === "string"
    ? value
    : value == null
    ? ""
    : JSON.stringify(value);

export default function DataSources() {
  const { user } = useAuth();
  const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? null;

  const [kbURL, setKbURL] = useState("");
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [startingIngestion, setStartingIngestion] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; source_type: string; source_id: string; content: unknown; metadata: Record<string, unknown>; created_at?: string }>
  >([]);

  useEffect(() => {
    void fetchIngestionStatus();
  }, []);

  useEffect(() => {
    if (!orgId) return;
    const interval = setInterval(() => {
      void fetchIngestionStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [orgId]);

  const fetchIngestionStatus = async () => {
    if (!orgId) return;
    const data = await api.listImportJobs(orgId);
    setIngestionJobs(data || []);
  };

  const startIngestion = async () => {
    if (!kbURL.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    setStartingIngestion(true);

    try {
      await api.createImportJob(orgId, kbURL);
      toast.success("Ingestion started in background!");
      setKbURL("");
      void fetchIngestionStatus();
    } catch (error) {
      console.error(error);
      toast.error("Failed to start ingestion");
    } finally {
      setStartingIngestion(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !orgId) return;

    setUploading(true);

    const file = e.target.files[0];
    const filePath = `${orgId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);

    if (uploadError) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    setUploadedFiles((prev) => [...prev, file]);
    toast.success("Document uploaded & queued for ingestion");
    setUploading(false);
  };

  const searchKb = async () => {
    if (!orgId) {
      toast.error("Missing org context");
      return;
    }
    if (!searchQuery.trim()) {
      toast.error("Enter a query to search the knowledge base");
      return;
    }
    setSearching(true);
    try {
      const result = await api.searchIngestion(orgId, searchQuery.trim());
      setSearchResults(result.items || []);
    } catch (error) {
      console.error(error);
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Data Sources</h1>
        <p className="text-muted-foreground mt-1">
          Manage all your company-wide knowledge sources – websites, documents, logs & more.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="shadow-sm hover:shadow-md transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Link className="w-5 h-5 text-primary" />
              Knowledge Base Website Ingestion
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Add your documentation base URL and Atlas Forge will crawl, extract, chunk, embed and index all pages in
              the background. Perfect for product docs, help centers, or wikis.
            </p>

            <div className="flex gap-3">
              <Input placeholder="https://docs.yourcompany.com" value={kbURL} onChange={(e) => setKbURL(e.target.value)} />
              <Button onClick={startIngestion} disabled={startingIngestion}>
                {startingIngestion ? "Starting..." : "Ingest"}
              </Button>
            </div>

            <h3 className="text-sm font-semibold mt-6">Recent Ingestion Jobs</h3>

            <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
              {ingestionJobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {safe(job.url) || safe(job.source) || "Job"}
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={async () => {
                          if (!orgId) return;
                          try {
                            await api.deleteImportJob(orgId, job.id);
                            toast.success("Job deleted");
                            void fetchIngestionStatus();
                          } catch (error) {
                            console.error(error);
                            toast.error("Failed to delete job");
                          }
                        }}
                        aria-label="Delete job"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                        aria-label="Show crawl info"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                      <Badge
                        variant="secondary"
                        className={
                          job.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : job.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }
                      >
                        {safe(job.status ?? "queued")}
                      </Badge>
                    </div>
                  </div>

                  <Progress value={job.progress ?? 0} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{safe(job.progress ?? 0)}%</span>
                    <span>{job.created_at ? new Date(job.created_at).toLocaleString() : ""}</span>
                  </div>
                  {(() => {
                    const metadata = (job.metadata as Record<string, unknown>) || {};
                    const processed =
                      (job.processed_records as number | undefined) ??
                      (metadata.processed_records as number | undefined) ??
                      0;
                    const total =
                      (job.total_records as number | undefined) ??
                      (metadata.total_records as number | undefined) ??
                      (metadata.pages as number | undefined) ??
                      undefined;
                    const currentUrl = (metadata.current_url as string | undefined) ?? "";
                    const remaining = typeof total === "number" ? Math.max(0, total - processed) : null;
                    return (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>URLs processed</span>
                          <span className="font-medium">
                            {processed}
                            {typeof total === "number" ? ` / ${total}` : " / ?"}
                          </span>
                        </div>
                        {remaining !== null && (
                          <div className="flex justify-between">
                            <span>Remaining</span>
                            <span className="font-medium">{remaining}</span>
                          </div>
                        )}
                        {currentUrl && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-muted-foreground">Current URL</span>
                            <span className="font-medium break-all text-[11px] text-foreground">{currentUrl}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {expandedJobId === job.id && (
                    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current URL</span>
                        <span className="font-medium break-all">
                          {safe((job.metadata as any)?.current_url || job.source || job.url)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Error</span>
                        <span className="font-medium break-all">
                          {safe((job.metadata as any)?.error || (job.metadata as any)?.reason || "")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <UploadCloud className="w-5 h-5 text-primary" />
              Upload Documents (PDF / PPT / DOCX)
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-sm">
              Upload files to be processed & indexed by the global ingestion pipeline.
            </p>

            <div className="w-full border-2 border-dashed border-primary/30 rounded-xl p-6 text-center hover:bg-primary/5 transition-all">
              <Input type="file" className="cursor-pointer" onChange={handleFileUpload} disabled={uploading} />

              {uploading && (
                <p className="text-primary mt-2 text-sm animate-pulse">
                  Uploading…
                </p>
              )}
            </div>

            <div className="space-y-2">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between border rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">{file.name}</span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    Uploaded
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* <Card className="shadow-sm hover:shadow-md transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Search className="w-5 h-5 text-primary" />
              Query Knowledge Base
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Search across all ingested sources (Slack, docs, crawls, uploads) via the unified ingestion index.
            </p>
            <div className="flex gap-3">
              <Input
                placeholder="Search ingested content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button onClick={searchKb} disabled={searching}>
                {searching ? "Searching..." : "Search"}
              </Button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {searchResults.map((item) => {
                const content =
                  typeof item.content === "string"
                    ? item.content
                    : item.content !== null && item.content !== undefined
                      ? JSON.stringify(item.content)
                      : "";
                const created = item.created_at ? new Date(item.created_at).toLocaleString() : "";
                return (
                  <div key={item.id} className="border rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{item.source_type}</span>
                      <span>{created}</span>
                    </div>
                    <div className="text-sm font-semibold truncate">
                      {typeof item.source_id === "string" ? item.source_id : JSON.stringify(item.source_id ?? "")}
                    </div>
                    <p className="text-sm text-foreground line-clamp-3">{content}</p>
                  </div>
                );
              })}
              {!searchResults.length && !searching && (
                <p className="text-sm text-muted-foreground">No results yet.</p>
              )}
            </div>
          </CardContent>
        </Card> */}
      </div>

      <Card className="shadow-sm hover:shadow-md transition-all">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Server className="w-5 h-5 text-primary" />
            Exhaust Systems (Logs, Events, Metrics)
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <p className="text-muted-foreground text-sm">
            Connect internal logs, system exhausts, security events, or analytics streams to give your agents live
            operational awareness.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-lg p-4 flex flex-col justify-between">
              <div>
                <h4 className="font-medium text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  Syslog Feed
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Ingest logs from your core systems, routers, or firewalls.
                </p>
              </div>
              <Button variant="outline" className="w-full mt-4" disabled>
                Coming Soon
              </Button>
            </div>

            <div className="border rounded-lg p-4 flex flex-col justify-between">
              <div>
                <h4 className="font-medium text-base flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" />
                  App Logs
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Connect production logging systems (ELK, Datadog, CloudWatch).
                </p>
              </div>
              <Button variant="outline" className="w-full mt-4" disabled>
                Coming Soon
              </Button>
            </div>

            <div className="border rounded-lg p-4 flex flex-col justify-between">
              <div>
                <h4 className="font-medium text-base flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" />
                  Trace & Telemetry
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Stream tracing and span data for deep agent visibility.
                </p>
              </div>
              <Button variant="outline" className="w-full mt-4" disabled>
                Coming Soon
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
