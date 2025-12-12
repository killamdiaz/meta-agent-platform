import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Edit2,
  Play,
  Zap,
  Radio,
  Key,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectorStore } from '@/store/connectorStore';

interface AIWizardModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const AIWizardModal = ({ open, onClose, onComplete }: AIWizardModalProps) => {
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [testApiKey, setTestApiKey] = useState('');

  const [extractedGoals, setExtractedGoals] = useState<{
    platform: string;
    actions: string[];
    triggers: string[];
    authType: string;
    fields: string[];
  } | null>(null);

  const [draftConnector, setDraftConnector] = useState<{
    name: string;
    description: string;
    actions: { name: string; endpoint: string; method: string }[];
    triggers: { name: string; event: string }[];
    authType: string;
  } | null>(null);

  const [testResults, setTestResults] = useState<{ success: boolean; message: string }[]>([]);

  const handleGenerate = () => {
    setIsProcessing(true);
    
    // Simulate AI processing
    setTimeout(() => {
      setExtractedGoals({
        platform: 'ServiceNow',
        actions: ['Create Incident', 'Get Incident Details', 'Update Incident', 'Close Incident'],
        triggers: ['Incident Created', 'Incident Resolved'],
        authType: 'OAuth 2.0',
        fields: ['short_description', 'description', 'priority', 'urgency', 'assignment_group'],
      });
      setIsProcessing(false);
      setStep(2);
    }, 2000);
  };

  const handleProceedToDraft = () => {
    setIsProcessing(true);
    
    setTimeout(() => {
      setDraftConnector({
        name: 'ServiceNow ITSM',
        description: 'Create, manage, and track incidents in ServiceNow.',
        actions: [
          { name: 'Create Incident', endpoint: '/api/now/table/incident', method: 'POST' },
          { name: 'Get Incident', endpoint: '/api/now/table/incident/{sys_id}', method: 'GET' },
          { name: 'Update Incident', endpoint: '/api/now/table/incident/{sys_id}', method: 'PUT' },
          { name: 'Close Incident', endpoint: '/api/now/table/incident/{sys_id}', method: 'PATCH' },
        ],
        triggers: [
          { name: 'Incident Created', event: 'incident.created' },
          { name: 'Incident Resolved', event: 'incident.resolved' },
        ],
        authType: 'oauth2',
      });
      setIsProcessing(false);
      setStep(3);
    }, 1500);
  };

  const handleTest = () => {
    setIsProcessing(true);
    setTestResults([]);

    // Simulate test execution
    setTimeout(() => {
      setTestResults([
        { success: true, message: 'Authentication successful' },
        { success: true, message: 'Create Incident endpoint accessible' },
        { success: true, message: 'Get Incident endpoint accessible' },
        { success: false, message: 'Update Incident: Permission denied (check scopes)' },
      ]);
      setIsProcessing(false);
    }, 2000);
  };

  const handleComplete = () => {
    onComplete();
    onClose();
    // Reset state
    setStep(1);
    setPrompt('');
    setExtractedGoals(null);
    setDraftConnector(null);
    setTestResults([]);
    setTestApiKey('');
  };

  const examplePrompts = [
    'Build a ServiceNow connector that can create and fetch incidents',
    'Create a Jira integration for managing issues and sprints',
    'Build a Slack connector to send messages and manage channels',
    'Create a GitHub connector for managing repos and pull requests',
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 bg-card border-border/50 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">AI Connector Generator</DialogTitle>
              <p className="text-sm text-muted-foreground">Describe what you need, AI builds it for you</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    step >= s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > s ? <CheckCircle className="w-4 h-4" /> : s}
                </div>
                {s < 5 && (
                  <div
                    className={cn(
                      'w-12 h-0.5 transition-colors',
                      step > s ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-6">
            {/* Step 1: Input */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Describe the connector you want to build
                  </label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., Build me a ServiceNow connector that can create incidents and fetch details"
                    className="min-h-[120px] bg-muted/30 border-border/50"
                  />
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-3">Try one of these examples:</p>
                  <div className="flex flex-wrap gap-2">
                    {examplePrompts.map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => setPrompt(ex)}
                        className="px-3 py-1.5 text-xs rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Understanding */}
            {step === 2 && extractedGoals && (
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <p className="text-sm text-primary font-medium mb-2">
                    ✨ AI understood your request
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Review the extracted goals below and edit if needed.
                  </p>
                </div>

                <div className="grid gap-4">
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Platform Detected
                    </label>
                    <p className="text-lg font-semibold text-foreground mt-1">
                      {extractedGoals.platform}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Actions
                    </label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {extractedGoals.actions.map((action, i) => (
                        <Badge key={i} variant="secondary" className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {action}
                          <button className="ml-1 hover:text-foreground">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Triggers
                    </label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {extractedGoals.triggers.map((trigger, i) => (
                        <Badge key={i} variant="secondary" className="flex items-center gap-1">
                          <Radio className="w-3 h-3" />
                          {trigger}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
                      <label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Auth Type
                      </label>
                      <p className="text-foreground font-medium mt-1 flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        {extractedGoals.authType}
                      </p>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border border-border/30">
                      <label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Fields Detected
                      </label>
                      <p className="text-foreground font-medium mt-1">
                        {extractedGoals.fields.length} fields
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Draft Preview */}
            {step === 3 && draftConnector && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* AI Output */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">AI Generated</h3>
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/30 space-y-4">
                      <div>
                        <label className="text-xs text-muted-foreground">Name</label>
                        <p className="text-foreground font-medium">{draftConnector.name}</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Description</label>
                        <p className="text-foreground text-sm">{draftConnector.description}</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Actions</label>
                        <div className="space-y-1 mt-1">
                          {draftConnector.actions.map((a, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <Badge variant="outline" className="font-mono text-xs">
                                {a.method}
                              </Badge>
                              <span className="text-foreground">{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Editable */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <Edit2 className="w-4 h-4" /> Editable
                    </h3>
                    <div className="p-4 rounded-lg bg-muted/30 border border-primary/30 space-y-4">
                      <div>
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          defaultValue={draftConnector.name}
                          className="bg-background/50 border-border/50 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Textarea
                          defaultValue={draftConnector.description}
                          className="bg-background/50 border-border/50 mt-1 min-h-[80px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Test */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-muted/30 border border-border/30">
                  <h3 className="font-medium text-foreground mb-2">Test your connector</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Optionally provide API credentials to test the connector with live data.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">
                        API Key or Token (optional)
                      </label>
                      <Input
                        type="password"
                        value={testApiKey}
                        onChange={(e) => setTestApiKey(e.target.value)}
                        placeholder="Enter your API key..."
                        className="bg-background/50 border-border/50"
                      />
                    </div>

                    <Button onClick={handleTest} disabled={isProcessing} className="w-full">
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Run Tests
                    </Button>
                  </div>
                </div>

                {testResults.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">Test Results</h3>
                    {testResults.map((result, i) => (
                      <div
                        key={i}
                        className={cn(
                          'p-3 rounded-lg flex items-center gap-2 text-sm',
                          result.success
                            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                            : 'bg-red-500/10 border border-red-500/20 text-red-400'
                        )}
                      >
                        {result.success ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        {result.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Complete */}
            {step === 5 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Connector Ready!
                </h3>
                <p className="text-muted-foreground mb-6">
                  Your connector has been generated and is ready for final review in the Builder.
                </p>
                <div className="p-4 rounded-lg bg-muted/30 border border-border/30 inline-block">
                  <p className="text-sm text-muted-foreground">Generated files:</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">connector.json</Badge>
                    <Badge variant="secondary">4 actions</Badge>
                    <Badge variant="secondary">2 triggers</Badge>
                    <Badge variant="secondary">2 transforms</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-border/30 flex items-center justify-between bg-muted/10">
          <Button
            variant="ghost"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          {step === 1 && (
            <Button onClick={handleGenerate} disabled={!prompt || isProcessing}>
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Generate
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          {step === 2 && (
            <Button onClick={handleProceedToDraft} disabled={isProcessing}>
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Draft
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          {step === 3 && (
            <Button onClick={() => setStep(4)}>
              Test Connector
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          {step === 4 && (
            <Button onClick={() => setStep(5)}>
              Finalize
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}

          {step === 5 && (
            <Button onClick={handleComplete} className="bg-green-600 hover:bg-green-700">
              Open in Builder
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
