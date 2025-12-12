import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  Send,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  duration?: number;
  request?: any;
  response?: any;
  error?: string;
}

export const TestRunner = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('console');
  const [results, setResults] = useState<TestResult[]>([
    {
      id: '1',
      name: 'Auth: OAuth2 Token Exchange',
      status: 'success',
      duration: 234,
      request: { grant_type: 'client_credentials', scope: 'useraccount' },
      response: { access_token: 'eyJ...', expires_in: 3600 },
    },
    {
      id: '2',
      name: 'Action: Create Incident',
      status: 'success',
      duration: 456,
      request: { short_description: 'Test incident', priority: '3' },
      response: { result: { sys_id: 'abc123', number: 'INC0010001' } },
    },
    {
      id: '3',
      name: 'Action: Get Incident',
      status: 'error',
      duration: 123,
      error: 'Record not found: Invalid sys_id',
    },
  ]);

  const [logs, setLogs] = useState<string[]>([
    '[INFO] Initializing test runner...',
    '[INFO] Loading connector configuration...',
    '[INFO] Authenticating with OAuth2...',
    '[SUCCESS] Token acquired successfully',
    '[INFO] Testing action: Create Incident',
    '[REQUEST] POST /api/now/table/incident',
    '[RESPONSE] 201 Created (456ms)',
    '[SUCCESS] Create Incident passed',
    '[INFO] Testing action: Get Incident',
    '[REQUEST] GET /api/now/table/incident/invalid-id',
    '[RESPONSE] 404 Not Found (123ms)',
    '[ERROR] Get Incident failed: Record not found',
  ]);

  const runTests = () => {
    setIsRunning(true);
    setLogs((prev) => [...prev, '[INFO] Running all tests...']);
    
    setTimeout(() => {
      setLogs((prev) => [...prev, '[SUCCESS] Test run complete: 2 passed, 1 failed']);
      setIsRunning(false);
    }, 2000);
  };

  const selectedResult = results.find((r) => r.status !== 'pending');

  return (
    <div className="h-full flex flex-col bg-card/50 border-t border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Test Runner
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-400" /> 2 passed
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" /> 1 failed
            </span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={runTests}
          disabled={isRunning}
          className="bg-primary hover:bg-primary/90"
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run Tests
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Test list */}
        <div className="w-64 border-r border-border/30 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {results.map((result) => (
                <div
                  key={result.id}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors',
                    'hover:bg-muted/50'
                  )}
                >
                  {result.status === 'running' && (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  )}
                  {result.status === 'success' && (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  )}
                  {result.status === 'error' && (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  {result.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span className="truncate text-foreground">{result.name}</span>
                  {result.duration && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {result.duration}ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Tabs panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="bg-transparent border-b border-border/30 rounded-none h-auto p-0">
              <TabsTrigger
                value="console"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Console
              </TabsTrigger>
              <TabsTrigger
                value="request"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Request
              </TabsTrigger>
              <TabsTrigger
                value="response"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
              >
                Response
              </TabsTrigger>
            </TabsList>

            <TabsContent value="console" className="flex-1 m-0">
              <ScrollArea className="h-full">
                <div className="p-4 font-mono text-xs space-y-1">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={cn(
                        'whitespace-pre',
                        log.includes('[ERROR]') && 'text-red-400',
                        log.includes('[SUCCESS]') && 'text-green-400',
                        log.includes('[REQUEST]') && 'text-blue-400',
                        log.includes('[RESPONSE]') && 'text-purple-400',
                        log.includes('[INFO]') && 'text-muted-foreground'
                      )}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="request" className="flex-1 m-0">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4 text-sm">
                    <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 font-mono">
                      POST
                    </span>
                    <code className="text-muted-foreground">
                      /api/now/table/incident
                    </code>
                  </div>
                  <pre className="bg-muted/30 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto">
{JSON.stringify(selectedResult?.request || {}, null, 2)}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="response" className="flex-1 m-0">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4 text-sm">
                    <span className="px-2 py-1 rounded bg-green-500/20 text-green-400 font-mono">
                      201
                    </span>
                    <span className="text-muted-foreground">Created</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {selectedResult?.duration}ms
                    </span>
                  </div>
                  <pre className="bg-muted/30 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto">
{JSON.stringify(selectedResult?.response || {}, null, 2)}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
