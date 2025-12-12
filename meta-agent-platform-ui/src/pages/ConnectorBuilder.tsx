import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BuilderFileTree } from '@/components/Connectors/BuilderFileTree';
import { BuilderEditor } from '@/components/Connectors/BuilderEditor';
import { TestRunner } from '@/components/Connectors/TestRunner';
import { PublishModal } from '@/components/Connectors/PublishModal';
import { Save, Play, Upload, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ConnectorBuilder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string } | null>({ id: 'connector.json', name: 'connector.json' });
  const [editorContent, setEditorContent] = useState('');
  const [showTestRunner, setShowTestRunner] = useState(true);
  const [showPublish, setShowPublish] = useState(false);

  const language = selectedFile?.name.endsWith('.js') ? 'javascript' : 'json';

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top toolbar */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-foreground">{id === 'new' ? 'New Connector' : 'Edit Connector'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><Save className="w-4 h-4 mr-2" />Save Draft</Button>
          <Button variant="outline" size="sm" onClick={() => setShowTestRunner(!showTestRunner)}><Play className="w-4 h-4 mr-2" />Test</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Export ZIP</Button>
          <Button size="sm" onClick={() => setShowPublish(true)} className="bg-primary hover:bg-primary/90"><Upload className="w-4 h-4 mr-2" />Publish</Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* File tree sidebar */}
        <div className="w-64 border-r border-border/50 bg-card/30">
          <BuilderFileTree onSelect={(item) => setSelectedFile({ id: item.id, name: item.name })} selectedId={selectedFile?.id} />
        </div>

        {/* Editor + Test panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor */}
          <div className={cn('flex-1 min-h-0', showTestRunner && 'h-1/2')}>
            {selectedFile && (
              <BuilderEditor fileName={selectedFile.name} content={editorContent} onChange={setEditorContent} language={language} />
            )}
          </div>

          {/* Test runner */}
          {showTestRunner && (
            <div className="h-1/2 min-h-[200px]">
              <TestRunner />
            </div>
          )}
        </div>
      </div>

      <PublishModal open={showPublish} onClose={() => setShowPublish(false)} connectorName="My Connector" />
    </div>
  );
};

export default ConnectorBuilder;
