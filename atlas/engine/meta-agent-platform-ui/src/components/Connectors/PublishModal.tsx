import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle, ExternalLink, Copy, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  connectorName?: string;
}

export const PublishModal = ({ open, onClose, connectorName = 'My Connector' }: PublishModalProps) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [formData, setFormData] = useState({
    name: connectorName,
    version: '1.0.0',
    publisher: 'Acme Corp',
    description: '',
    category: 'custom',
    changelog: '',
  });

  const shareableUrl = `https://atlas.dev/marketplace/connectors/${formData.name.toLowerCase().replace(/\s+/g, '-')}`;

  const handlePublish = () => {
    if (!confirmed) {
      toast({
        title: 'Confirmation required',
        description: 'Please confirm that this connector contains no sensitive data.',
        variant: 'destructive',
      });
      return;
    }

    setIsPublishing(true);
    
    setTimeout(() => {
      setIsPublishing(false);
      setIsPublished(true);
    }, 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(shareableUrl);
    toast({
      title: 'Copied!',
      description: 'Share link copied to clipboard.',
    });
  };

  const handleClose = () => {
    setIsPublished(false);
    setConfirmed(false);
    setFormData({
      name: connectorName,
      version: '1.0.0',
      publisher: 'Acme Corp',
      description: '',
      category: 'custom',
      changelog: '',
    });
    onClose();
  };

  if (isPublished) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md bg-card border-border/50">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              Published Successfully!
            </h3>
            <p className="text-muted-foreground mb-6">
              Your connector is now live on the marketplace.
            </p>

            <div className="p-4 rounded-lg bg-muted/30 border border-border/30 text-left">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">
                Shareable Link
              </label>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 text-sm text-primary truncate">
                  {shareableUrl}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Close
              </Button>
              <Button className="flex-1" asChild>
                <a href={shareableUrl} target="_blank" rel="noopener noreferrer">
                  View in Marketplace
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Publish Connector
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Connector Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-muted/30 border-border/50 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="bg-muted/30 border-border/50 mt-1"
                placeholder="1.0.0"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="publisher">Publisher Name</Label>
            <Input
              id="publisher"
              value={formData.publisher}
              onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
              className="bg-muted/30 border-border/50 mt-1"
            />
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger className="bg-muted/30 border-border/50 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="itsm">ITSM</SelectItem>
                <SelectItem value="devops">DevOps</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
                <SelectItem value="custom">Custom API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-muted/30 border-border/50 mt-1 min-h-[80px]"
              placeholder="Describe what your connector does..."
            />
          </div>

          <div>
            <Label htmlFor="changelog">Changelog (this version)</Label>
            <Textarea
              id="changelog"
              value={formData.changelog}
              onChange={(e) => setFormData({ ...formData, changelog: e.target.value })}
              className="bg-muted/30 border-border/50 mt-1 min-h-[60px]"
              placeholder="- Initial release&#10;- Added create incident action"
            />
          </div>

          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked as boolean)}
                className="mt-0.5"
              />
              <Label htmlFor="confirm" className="text-sm text-yellow-200 leading-relaxed cursor-pointer">
                I confirm that this connector contains no sensitive data, secrets, or proprietary information that should not be shared publicly.
              </Label>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={handlePublish}
            disabled={isPublishing || !confirmed}
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Publish to Marketplace
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
