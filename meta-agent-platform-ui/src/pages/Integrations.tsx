import { useEffect, useState, type ElementType } from "react";
import { ShieldCheck, KeyRound, Slack, Github, GitBranch, BookOpen, Boxes, Cloud, Bot, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { api, API_BASE } from "@/lib/api";

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
    description: "Allow Atlas Forge to index documentation and use it as reasoning context.",
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

export default function Integrations() {
  const { user } = useAuth();
  const orgId = (user?.user_metadata as { org_id?: string } | undefined)?.org_id ?? user?.id ?? null;
  const [loading, setLoading] = useState<string | null>(null);
  const [slackStatus, setSlackStatus] = useState<'unknown' | 'active' | 'inactive'>('unknown');
  const [jiraStatus, setJiraStatus] = useState<'unknown' | 'active' | 'inactive'>('unknown');
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      setStatusLoading(true);
      try {
        const status = await api.fetchSlackIntegrationStatus(orgId ?? undefined);
        setSlackStatus((status.status as 'active' | 'inactive') ?? 'inactive');
        const jira = await api.fetchJiraIntegrationStatus(orgId ?? undefined);
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
  }, [orgId]);

  const handleIntegrationClick = async (integration: IntegrationCard) => {
    if (integration.comingSoon) {
      toast.info("This integration is coming soon!");
      return;
    }

    setLoading(integration.id);

    try {
      await supabase.from("integration_logs").insert({
        profile_id: user?.id,
        integration: integration.id,
        action: "clicked",
      });

      if (integration.id === "okta-saml") {
        window.location.href = "/settings/saml";
      } else if (integration.id === "slack") {
        const orgQuery = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
        window.location.href = `${API_BASE}/connectors/slack/api/install${orgQuery}`;
      } else if (integration.id === "jira") {
        const orgQuery = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
        window.location.href = `${API_BASE}/connectors/jira/api/install${orgQuery}`;
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
            Connect external apps and identity providers to Atlas Forge
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

          return (
            <Card key={integration.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      {integration.title}
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
                <p className="text-sm text-muted-foreground leading-relaxed">{integration.description}</p>

                <Button
                  variant={integration.comingSoon ? "secondary" : "outline"}
                  disabled={
                    isLoading ||
                    integration.comingSoon ||
                    ((isConnected || jiraConnected) && !statusLoading)
                  }
                  className="w-full"
                  onClick={() => handleIntegrationClick(integration)}
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                      Loading...
                    </>
                  ) : (
                    isConnected && !statusLoading ? "Connected" : integration.actionText
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
