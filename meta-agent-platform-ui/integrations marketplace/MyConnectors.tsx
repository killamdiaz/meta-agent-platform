import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Download, Edit, Settings, Trash2, Upload, Play, RefreshCw, Sparkles } from 'lucide-react';
import { ConnectorCard } from '@/components/Connectors/ConnectorCard';
import { AIWizardModal } from '@/components/Connectors/AIWizardModal';
import { PublishModal } from '@/components/Connectors/PublishModal';
import { useConnectorStore } from '@/store/connectorStore';
import { mockConnectors } from '@/data/mockConnectors';
import { useNavigate } from 'react-router-dom';

const MyConnectors = () => {
  const navigate = useNavigate();
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const { setConnectors, getInstalledConnectors, getDraftConnectors, getConnectorsWithUpdates, selectConnector } = useConnectorStore();

  useEffect(() => {
    setConnectors(mockConnectors);
  }, [setConnectors]);

  const installed = getInstalledConnectors();
  const drafts = getDraftConnectors();
  const updates = getConnectorsWithUpdates();

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Connectors</h1>
            <p className="text-muted-foreground">Manage your installed and custom connectors</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAIWizard(true)} className="border-primary/50 text-primary hover:bg-primary/10">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Build
            </Button>
            <Button onClick={() => navigate('/builder/new')} className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Build Manually
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          <Tabs defaultValue="installed">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="installed">Installed ({installed.length})</TabsTrigger>
              <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>
              <TabsTrigger value="updates" className="relative">
                Updates
                {updates.length > 0 && (
                  <Badge className="ml-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center">{updates.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="installed" className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {installed.map((c) => (
                  <div key={c.id} className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl border border-border/50">{c.icon}</div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{c.name}</h3>
                        <p className="text-sm text-muted-foreground">v{c.version} • {c.publisher}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1"><Settings className="w-3 h-3 mr-1" />Configure</Button>
                      <Button size="sm" variant="outline" className="flex-1"><Play className="w-3 h-3 mr-1" />Test</Button>
                      <Button size="sm" variant="ghost"><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="drafts" className="mt-6">
              {drafts.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {drafts.map((c) => (
                    <div key={c.id} className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center text-2xl border border-border/50">{c.icon}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{c.name}</h3>
                          <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 mt-1">Draft</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/builder/${c.id}`)}><Edit className="w-3 h-3 mr-1" />Edit</Button>
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowPublish(true)}><Upload className="w-3 h-3 mr-1" />Publish</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">No draft connectors. Create one to get started.</div>
              )}
            </TabsContent>

            <TabsContent value="updates" className="mt-6">
              {updates.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {updates.map((c) => (
                    <div key={c.id} className="p-4 rounded-xl bg-card/50 border border-primary/30 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl border border-border/50">{c.icon}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{c.name}</h3>
                          <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 mt-1">Update Available</Badge>
                        </div>
                      </div>
                      <Button size="sm" className="w-full bg-primary hover:bg-primary/90"><RefreshCw className="w-3 h-3 mr-1" />Update to v{c.version}</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">All connectors are up to date.</div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      <AIWizardModal open={showAIWizard} onClose={() => setShowAIWizard(false)} onComplete={() => navigate('/builder/new')} />
      <PublishModal open={showPublish} onClose={() => setShowPublish(false)} />
    </div>
  );
};

export default MyConnectors;
