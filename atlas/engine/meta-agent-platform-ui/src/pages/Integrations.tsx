import { useCallback, useEffect, useState, type ElementType } from "react";
import { ShieldCheck, KeyRound, Slack, Github, GitBranch, BookOpen, Boxes, Cloud, Bot, Workflow, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { api, API_BASE, apiBaseUrl } from "@/lib/api";
import { useBrandStore } from "@/store/brandStore";

interface IntegrationCard {
  id: string;
  title: string;
  description: string;
  icon: ElementType;
  isNew?: boolean;
  actionText: string;
  connected?: boolean;
  comingSoon?: boolean;
}

const integrationCards: IntegrationCard[] = [
  {
    id: "okta-saml",
    title: "Okta SAML SSO",
    description: "Enable secure SAML 2.0 authentication for enterprise customers through Okta.",
    icon: ShieldCheck,
    isNew: true,
    actionText: "Configure SAML",
  },
  {
    id: "atlas-auth",
    title: "Atlas Account Login",
    description: "Standard Forge login using Atlas OS identity provider.",
    icon: KeyRound,
    actionText: "Manage",
  },
  {
    id: "slack",
    title: "Slack Workspace",
    description: "Integrate with Slack to send automated messages, notifications, and agent logs.",
    icon: Slack,
    actionText: "Connect",
  },
  {
    id: "github",
    title: "GitHub Repos",
    description: "Allow Forge agents to read repos, create PRs, and manage issues.",
    icon: Github,
    actionText: "Connect",
  },
  {
    id: "jira",
    title: "Jira Cloud",
    description: "Sync tickets, create tasks, and enrich Jira workflows inside Forge.",
    icon: GitBranch,
    actionText: "Connect",
  },
  {
    id: "confluence",
    title: "Confluence",
    description: "Allow Atlas Engine to index documentation and use it as reasoning context.",
    icon: BookOpen,
    actionText: "Connect",
  },
  {
    id: "notion",
    title: "Notion",
    description: "Sync pages and databases for enriched agent context.",
    icon: Boxes,
    comingSoon: true,
    actionText: "Coming Soon",
  },
  {
    id: "gdrive",
    title: "Google Drive",
    description: "Import PDFs, DOCs, sheets — and allow agents to read & generate updates.",
    icon: Cloud,
    actionText: "Connect",
  },
  {
    id: "custom-ai",
    title: "Custom API Connector",
    description: "Connect any external API to your Agents and Workflows using the custom connector.",
    icon: Bot,
    actionText: "Configure",
  },
  {
    id: "automations",
    title: "Workflow Engine",
    description: "Create workflows, triggers, and sync flows across all integrations.",
    icon: Workflow,
    actionText: "Open",
  },
];

function SamlConfigModal({
  open,
  onOpenChange,
  orgId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
}) {
  const [form, setForm] = useState({
    idp_metadata_url: "",
    idp_certificate: "",
    idp_sso_url: "",
    sp_entity_id: "",
    sp_acs_url: "",
    sp_metadata_url: "",
    enforce_sso: false,
    domainsText: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const metadataUrl = form.sp_metadata_url || (orgId ? `${API_BASE}/.well-known/saml/metadata/${orgId}` : "");
  const acsUrl = form.sp_acs_url || `${apiBaseUrl}/auth/saml/acs`;
  const entityId = form.sp_entity_id || "atlas-forge-sp";

  const hydrate = useCallback(async () => {
    if (!open || !orgId) return;
    setLoading(true);
    try {
      const cfg = await api.fetchSamlConfig(orgId);
      setForm({
        idp_metadata_url: cfg.idp_metadata_url ?? "",
        idp_certificate: cfg.idp_certificate ?? "",
        idp_sso_url: cfg.idp_sso_url ?? "",
        sp_entity_id: cfg.sp_entity_id ?? entityId,
        sp_acs_url: cfg.sp_acs_url ?? acsUrl,
        sp_metadata_url: cfg.sp_metadata_url ?? metadataUrl,
        enforce_sso: cfg.enforce_sso ?? false,
        domainsText: (cfg.domains ?? []).join(", "),
      });
    } catch (error) {
      console.warn("[saml] load config failed", error);
    } finally {
      setLoading(false);
    }
  }, [open, orgId, entityId, acsUrl, metadataUrl]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const handleCopy = useCallback((value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  }, []);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const domains = form.domainsText
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const { domainsText: _discard, ...payload } = form;
      const saved = await api.saveSamlConfig(orgId, { ...payload, domains });
      setForm((prev) => ({
        ...prev,
        ...saved,
        sp_entity_id: saved.sp_entity_id ?? prev.sp_entity_id,
        sp_acs_url: saved.sp_acs_url ?? prev.sp_acs_url,
        sp_metadata_url: saved.sp_metadata_url ?? prev.sp_metadata_url,
        domainsText: domains.join(", "),
      }));
      toast.success("SAML settings saved");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save SAML settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { redirectUrl } = await api.startSamlLogin({
        org_id: orgId,
        relayState: window.location.origin,
      });
      window.location.href = redirectUrl;
    } catch (error) {
      console.error(error);
      toast.error("Unable to start SSO test");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] rounded-3xl p-8">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl">Configure SAML SSO</DialogTitle>
          <DialogDescription>
            Provide your IdP metadata URL and share the Service Provider details with your identity team.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>IdP Metadata URL</Label>
              <Input
                placeholder="https://your-idp/.well-known/saml.xml"
                value={form.idp_metadata_url}
                onChange={(e) => setForm((prev) => ({ ...prev, idp_metadata_url: e.target.value }))}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">We will fetch the SSO URL and certificate from this XML.</p>
            </div>
            <div className="space-y-2">
              <Label>IdP SSO URL (Entry Point)</Label>
              <Input
                placeholder="https://your-idp/idp/profile/SAML2/Redirect/SSO"
                value={form.idp_sso_url}
                onChange={(e) => setForm((prev) => ({ ...prev, idp_sso_url: e.target.value }))}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Direct login URL from your IdP. Required if metadata fetch is blocked.</p>
            </div>
            <div className="space-y-2">
              <Label>Allowed email domains</Label>
              <Input
                placeholder="company.com, subsidiary.io"
                value={form.domainsText}
                onChange={(e) => setForm((prev) => ({ ...prev, domainsText: e.target.value }))}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">Used to map login emails to this organization automatically.</p>
            </div>
            <div className="space-y-2">
              <Label>IdP Certificate</Label>
              <Textarea
                rows={4}
                placeholder="-----BEGIN CERTIFICATE-----"
                value={form.idp_certificate}
                onChange={(e) => setForm((prev) => ({ ...prev, idp_certificate: e.target.value }))}
                disabled={saving}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Enforce SSO</p>
                <p className="text-xs text-muted-foreground">Disable password or magic-link login for this org.</p>
              </div>
              <Switch
                checked={form.enforce_sso}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enforce_sso: checked }))}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Service Provider Details</p>
                <p className="text-sm text-muted-foreground">Copy these into Okta, Azure AD, or Ping.</p>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <a href={metadataUrl} download>
                  <Download className="h-4 w-4 mr-2" />
                  Download XML
                </a>
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>SP Entity ID</Label>
                <div className="flex items-center gap-2">
                  <Input value={entityId} readOnly className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(entityId)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>ACS URL</Label>
                <div className="flex items-center gap-2">
                  <Input value={acsUrl} readOnly className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(acsUrl)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>SP Metadata URL</Label>
                <div className="flex items-center gap-2">
                  <Input value={metadataUrl} readOnly className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => handleCopy(metadataUrl)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={saving || loading || !orgId}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={saving || !orgId}>
                Test SSO
              </Button>
              <Button variant="ghost" onClick={hydrate} disabled={loading}>
                Reload
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Integrations() {
  const { user } = useAuth();
  const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? null;
  const accountId = user?.id ?? null;
  const brandShort = useBrandStore(
    (state) => state.shortName?.trim() || state.companyName?.trim() || "Atlas",
  );
  const engineName = useBrandStore(
    (state) => `${state.companyName?.trim() || "Atlas"} Engine`,
  );
  const [loading, setLoading] = useState<string | null>(null);
  const [slackStatus, setSlackStatus] = useState<'unknown' | 'active' | 'inactive'>('unknown');
  const [jiraStatus, setJiraStatus] = useState<'unknown' | 'active' | 'inactive'>('unknown');
  const [statusLoading, setStatusLoading] = useState(false);
  const [showSamlModal, setShowSamlModal] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      setStatusLoading(true);
      try {
        const status = await api.fetchSlackIntegrationStatus(orgId ?? undefined);
        setSlackStatus((status.status as 'active' | 'inactive') ?? 'inactive');
        const jira = await api.fetchJiraIntegrationStatus(orgId ?? undefined, accountId ?? undefined);
        setJiraStatus((jira.status as 'active' | 'inactive') ?? 'inactive');
      } catch (error) {
        console.warn('[integrations] slack status lookup failed', error);
        setSlackStatus('inactive');
        setJiraStatus('inactive');
      } finally {
        setStatusLoading(false);
      }
    };
    fetchStatus();
  }, [accountId, orgId]);

  const handleIntegrationClick = async (integration: IntegrationCard) => {
    if (integration.comingSoon) {
      toast.info("This integration is coming soon!");
      return;
    }
    const licenseKey = typeof window !== "undefined" ? localStorage.getItem("forge_license_key") : null;
    const appendLicense = (url: string) => {
      if (!licenseKey) return url;
      const hasQuery = url.includes("?");
      return `${url}${hasQuery ? "&" : "?"}license_key=${encodeURIComponent(licenseKey)}`;
    };
    const isSlack = integration.id === "slack";
    const isJira = integration.id === "jira";
    const slackConnected = isSlack && slackStatus === "active";
    const jiraConnected = isJira && jiraStatus === "active";
    const action = slackConnected || jiraConnected ? "disconnect" : "clicked";

    setLoading(integration.id);

    try {
      await supabase.from("integration_logs").insert({
        profile_id: user?.id,
        integration: integration.id,
        action,
      });

      if (isSlack && slackConnected) {
        await api.disconnectSlackIntegration(orgId ?? undefined);
        setSlackStatus("inactive");
        toast.success("Slack disconnected");
      } else if (isJira && jiraConnected) {
        await api.disconnectJiraIntegration(orgId ?? undefined, accountId ?? undefined);
        setJiraStatus("inactive");
        toast.success("Jira disconnected");
      } else if (integration.id === "okta-saml") {
        setShowSamlModal(true);
      } else if (integration.id === "slack") {
        const orgQuery = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
        window.location.href = appendLicense(`${API_BASE}/connectors/slack/api/install${orgQuery}`);
      } else if (integration.id === "jira") {
        const params = new URLSearchParams();
        if (orgId) params.set("org_id", orgId);
        if (accountId) params.set("account_id", accountId);
        const query = params.toString();
        window.location.href = appendLicense(`${API_BASE}/connectors/jira/api/install${query ? `?${query}` : ""}`);
      } else if (integration.id === "github") {
        window.location.href = "/oauth/github";
      } else {
        toast.success(`${integration.title} opened`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect external apps and identity providers to {engineName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrationCards.map((integration) => {
          const Icon = integration.icon;
          const isLoading = loading === integration.id;
          const isSlack = integration.id === "slack";
          const isJira = integration.id === "jira";
          const isConnected = isSlack && slackStatus === "active";
          const jiraConnected = isJira && jiraStatus === "active";
          const title = integration.id === "atlas-auth" ? `${brandShort} Account Login` : integration.title;
          const description =
            integration.id === "confluence"
              ? `Allow ${engineName} to index documentation and use it as reasoning context.`
              : integration.id === "atlas-auth"
                ? `Standard login using the ${brandShort} identity provider.`
              : integration.description;

          return (
            <Card key={integration.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      {title}
                      {integration.isNew && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                          NEW
                        </Badge>
                      )}
                      {integration.comingSoon && (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 text-xs">
                          SOON
                        </Badge>
                      )}
                      {(isSlack || isJira) && (
                        <Badge
                          variant={isSlack ? (isConnected ? "default" : "outline") : jiraConnected ? "default" : "outline"}
                          className={`text-xs ${jiraConnected || isConnected ? "bg-blue-100 text-blue-700" : ""}`}
                        >
                          {(isSlack ? isConnected : jiraConnected)
                            ? "Connected"
                            : statusLoading
                              ? "Checking..."
                              : "Not connected"}
                        </Badge>
                      )}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>

                <Button
                  variant={integration.comingSoon ? "secondary" : "outline"}
                  disabled={isLoading || integration.comingSoon || statusLoading}
                  className="w-full"
                  onClick={() => handleIntegrationClick(integration)}
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                      Loading...
                    </>
                  ) : (
                    (isConnected || jiraConnected) ? "Disconnect" : integration.actionText
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <SamlConfigModal open={showSamlModal} onOpenChange={setShowSamlModal} orgId={orgId} />
    </div>
  );
}
