import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Search, Filter, Sparkles, Plus } from 'lucide-react';
import { ConnectorCard } from '@/components/Connectors/ConnectorCard';
import { ConnectorDetailPanel } from '@/components/Connectors/ConnectorDetailPanel';
import { AIWizardModal } from '@/components/Connectors/AIWizardModal';
import { useConnectorStore } from '@/store/connectorStore';
import { mockConnectors } from '@/data/mockConnectors';
import { useNavigate } from 'react-router-dom';

const Marketplace = () => {
  const navigate = useNavigate();
  const [showAIWizard, setShowAIWizard] = useState(false);
  const {
    setConnectors,
    selectedConnector,
    selectConnector,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    getFilteredConnectors,
    installConnector,
  } = useConnectorStore();

  useEffect(() => {
    setConnectors(mockConnectors);
  }, [setConnectors]);

  const filteredConnectors = getFilteredConnectors();

  return (
    <div className="h-full flex bg-background">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Connector Marketplace</h1>
              <p className="text-muted-foreground">Discover and install integrations for Atlas</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAIWizard(true)} className="border-primary/50 text-primary hover:bg-primary/10">
                <Sparkles className="w-4 h-4 mr-2" />
                AI Generator
              </Button>
              <Button onClick={() => navigate('/my-connectors')} className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                My Connectors
              </Button>
            </div>
          </div>

          {/* Search and filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search connectors..."
                className="pl-10 bg-muted/30 border-border/50"
              />
            </div>

            <Select value={filters.category || 'all'} onValueChange={(v) => setFilters({ category: v === 'all' ? null : v })}>
              <SelectTrigger className="w-[140px] bg-muted/30 border-border/50">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="itsm">ITSM</SelectItem>
                <SelectItem value="devops">DevOps</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-[150px] bg-muted/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="recent">Recently Updated</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="community">Community</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch checked={filters.verified} onCheckedChange={(v) => setFilters({ verified: v })} />
              <span className="text-sm text-muted-foreground">Verified only</span>
            </div>
          </div>
        </div>

        {/* Connectors grid */}
        <ScrollArea className="flex-1">
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredConnectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                isSelected={selectedConnector?.id === connector.id}
                onClick={() => selectConnector(connector)}
                onInstall={() => installConnector(connector.id)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel */}
      {selectedConnector && (
        <div className="w-[400px] border-l border-border/50">
          <ConnectorDetailPanel
            connector={selectedConnector}
            onInstall={() => installConnector(selectedConnector.id)}
            onClose={() => selectConnector(null)}
          />
        </div>
      )}

      <AIWizardModal open={showAIWizard} onClose={() => setShowAIWizard(false)} onComplete={() => navigate('/builder/new')} />
    </div>
  );
};

export default Marketplace;
