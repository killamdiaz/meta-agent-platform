import { Connector } from '@/store/connectorStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Download, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectorCardProps {
  connector: Connector;
  isSelected?: boolean;
  onClick?: () => void;
  onInstall?: () => void;
  compact?: boolean;
}

export const ConnectorCard = ({
  connector,
  isSelected,
  onClick,
  onInstall,
  compact = false,
}: ConnectorCardProps) => {
  const categoryColors: Record<string, string> = {
    security: 'bg-red-500/20 text-red-400 border-red-500/30',
    itsm: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    devops: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    monitoring: 'bg-green-500/20 text-green-400 border-green-500/30',
    hr: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative p-4 rounded-xl border cursor-pointer transition-all duration-200',
        'bg-card/50 hover:bg-card/80 backdrop-blur-sm',
        'border-border/50 hover:border-primary/50',
        isSelected && 'ring-2 ring-primary border-primary bg-card/80',
        compact && 'p-3'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl border border-border/50">
          {connector.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{connector.name}</h3>
            {connector.verified && (
              <Shield className="w-4 h-4 text-primary flex-shrink-0" />
            )}
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {connector.shortDescription}
          </p>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className={cn('text-xs', categoryColors[connector.category])}>
              {connector.category.toUpperCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {connector.publisher}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">v{connector.version}</span>
          </div>
        </div>

        {/* Install button */}
        {!compact && (
          <div className="flex-shrink-0">
            {connector.installed ? (
              <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle className="w-3 h-3 mr-1" />
                Installed
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onInstall?.();
                }}
              >
                <Download className="w-3 h-3 mr-1" />
                Install
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Downloads */}
      {!compact && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
          <span className="text-xs text-muted-foreground">
            <Download className="w-3 h-3 inline mr-1" />
            {connector.downloads.toLocaleString()} installs
          </span>
          <span className="text-xs text-muted-foreground">
            Updated {connector.lastUpdated}
          </span>
        </div>
      )}

      {/* Update indicator */}
      {connector.hasUpdate && (
        <div className="absolute top-2 right-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
      )}
    </div>
  );
};
