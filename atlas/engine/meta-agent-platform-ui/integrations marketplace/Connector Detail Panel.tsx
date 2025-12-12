import { Connector } from '@/store/connectorStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  Shield,
  Code,
  Zap,
  Key,
  History,
  ExternalLink,
  CheckCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectorDetailPanelProps {
  connector: Connector;
  onInstall?: () => void;
  onClose?: () => void;
}

export const ConnectorDetailPanel = ({
  connector,
  onInstall,
  onClose,
}: ConnectorDetailPanelProps) => {
  const categoryColors: Record<string, string> = {
    security: 'bg-red-500/20 text-red-400 border-red-500/30',
    itsm: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    devops: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    monitoring: 'bg-green-500/20 text-green-400 border-green-500/30',
    hr: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="h-full flex flex-col bg-card/50 backdrop-blur-sm border-l border-border/50">
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-3xl border border-border/50">
              {connector.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">{connector.name}</h2>
                {connector.verified && (
                  <Shield className="w-5 h-5 text-primary" />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                by {connector.publisher}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className={cn('text-xs', categoryColors[connector.category])}>
                  {connector.category.toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">v{connector.version}</span>
              </div>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          {connector.installed ? (
            <Button disabled className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30">
              <CheckCircle className="w-4 h-4 mr-2" />
              Installed
            </Button>
          ) : (
            <Button onClick={onInstall} className="flex-1 bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-2" />
              Install Connector
            </Button>
          )}
          {connector.openSource && (
            <Button variant="outline" size="icon">
              <Code className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <Tabs defaultValue="overview" className="p-6">
          <TabsList className="bg-muted/50 p-1 h-auto">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
            <TabsTrigger value="triggers" className="text-xs">Triggers</TabsTrigger>
            <TabsTrigger value="changelog" className="text-xs">Changelog</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-6">
            {/* Description */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Description</h3>
              <p className="text-sm text-muted-foreground">{connector.description}</p>
            </div>

            {/* Auth */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <Key className="w-4 h-4" />
                Authentication
              </h3>
              <Badge variant="outline" className="capitalize">
                {connector.authType.replace('_', ' ')}
              </Badge>
            </div>

            {/* Permissions */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Permissions Required</h3>
              <div className="flex flex-wrap gap-2">
                {connector.permissions.map((perm) => (
                  <Badge key={perm} variant="secondary" className="text-xs font-mono">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <p className="text-xs text-muted-foreground">Downloads</p>
                <p className="text-lg font-semibold text-foreground">
                  {connector.downloads.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-lg font-semibold text-foreground">{connector.lastUpdated}</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-4 space-y-3">
            {connector.actions.map((action) => (
              <div
                key={action.id}
                className="p-4 rounded-lg bg-muted/30 border border-border/30"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-foreground">{action.name}</h4>
                  <Badge variant="outline" className="text-xs font-mono">
                    {action.method}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{action.description}</p>
                <code className="text-xs text-muted-foreground block mt-2 p-2 bg-background/50 rounded">
                  {action.endpoint}
                </code>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="triggers" className="mt-4 space-y-3">
            {connector.triggers.length > 0 ? (
              connector.triggers.map((trigger) => (
                <div
                  key={trigger.id}
                  className="p-4 rounded-lg bg-muted/30 border border-border/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <h4 className="font-medium text-foreground">{trigger.name}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{trigger.description}</p>
                  <code className="text-xs text-muted-foreground block mt-2 p-2 bg-background/50 rounded">
                    Event: {trigger.event}
                  </code>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No triggers available</p>
            )}
          </TabsContent>

          <TabsContent value="changelog" className="mt-4">
            <div className="space-y-3">
              {connector.changelog.map((entry, i) => (
                <div key={i} className="flex items-start gap-3">
                  <History className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <p className="text-sm text-muted-foreground">{entry}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  );
};
