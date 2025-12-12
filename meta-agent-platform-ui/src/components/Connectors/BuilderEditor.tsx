import { useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";

interface BuilderEditorProps {
  fileName: string;
  content: string;
  onChange: (content: string) => void;
  language?: 'json' | 'javascript';
}

const connectorJsonExample = `{
  "name": "ServiceNow",
  "version": "2.4.1",
  "description": "Enterprise IT Service Management platform",
  "publisher": "Atlas",
  "category": "itsm",
  "icon": "🎫",
  "auth": {
    "type": "oauth2",
    "config": {
      "authUrl": "https://instance.service-now.com/oauth_auth.do",
      "tokenUrl": "https://instance.service-now.com/oauth_token.do",
      "scopes": ["useraccount"]
    }
  },
  "baseUrl": "https://{{instance}}.service-now.com",
  "variables": {
    "instance": {
      "type": "string",
      "required": true,
      "description": "Your ServiceNow instance name"
    }
  }
}`;

const actionExample = `{
  "id": "create-incident",
  "name": "Create Incident",
  "description": "Create a new incident in ServiceNow",
  "method": "POST",
  "endpoint": "/api/now/table/incident",
  "headers": {
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  "body": {
    "short_description": "{{short_description}}",
    "description": "{{description}}",
    "priority": "{{priority}}",
    "caller_id": "{{caller_id}}"
  },
  "fields": [
    {
      "name": "short_description",
      "type": "string",
      "required": true,
      "description": "Brief summary of the incident"
    },
    {
      "name": "description",
      "type": "text",
      "required": false,
      "description": "Detailed description"
    },
    {
      "name": "priority",
      "type": "select",
      "required": true,
      "options": ["1", "2", "3", "4", "5"],
      "description": "Incident priority (1=Critical, 5=Planning)"
    }
  ],
  "response": {
    "transform": "transforms/response-transform.js"
  }
}`;

const transformExample = `// Response transformation script
// Transform the API response to Atlas format

module.exports = function transform(response) {
  const record = response.result;
  
  return {
    id: record.sys_id,
    number: record.number,
    title: record.short_description,
    description: record.description,
    priority: mapPriority(record.priority),
    status: mapState(record.state),
    createdAt: record.sys_created_on,
    updatedAt: record.sys_updated_on,
    assignee: record.assigned_to?.display_value || null,
    reporter: record.caller_id?.display_value || null
  };
};

function mapPriority(priority) {
  const map = { '1': 'critical', '2': 'high', '3': 'medium', '4': 'low', '5': 'planning' };
  return map[priority] || 'unknown';
}

function mapState(state) {
  const map = { '1': 'new', '2': 'in_progress', '3': 'on_hold', '6': 'resolved', '7': 'closed' };
  return map[state] || 'unknown';
}`;

const getDefaultContent = (fileName: string): string => {
  if (fileName.includes('connector.json')) return connectorJsonExample;
  if (fileName.includes('action') || fileName.includes('incident')) return actionExample;
  if (fileName.includes('transform')) return transformExample;
  return '{\n  \n}';
};

export const BuilderEditor = ({
  fileName,
  content,
  onChange,
  language = 'json',
}: BuilderEditorProps) => {
  const [localContent, setLocalContent] = useState(content || getDefaultContent(fileName));
  const lines = localContent.split('\n');

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
    onChange(e.target.value);
  };

  // Syntax highlighting for JSON
  const highlightLine = (line: string) => {
    if (language === 'json') {
      // Key highlighting
      line = line.replace(
        /"([^"]+)":/g,
        '<span class="text-purple-400">"$1"</span>:'
      );
      // String value highlighting
      line = line.replace(
        /: "([^"]+)"/g,
        ': <span class="text-green-400">"$1"</span>'
      );
      // Number highlighting
      line = line.replace(
        /: (\d+)/g,
        ': <span class="text-yellow-400">$1</span>'
      );
      // Boolean highlighting
      line = line.replace(
        /: (true|false)/g,
        ': <span class="text-blue-400">$1</span>'
      );
      // Null highlighting
      line = line.replace(
        /: (null)/g,
        ': <span class="text-gray-500">$1</span>'
      );
    } else if (language === 'javascript') {
      // Keywords
      line = line.replace(
        /\b(const|let|var|function|return|if|else|for|while|module|exports)\b/g,
        '<span class="text-purple-400">$1</span>'
      );
      // Strings
      line = line.replace(
        /'([^']+)'/g,
        '<span class="text-green-400">\'$1\'</span>'
      );
      // Comments
      if (line.trim().startsWith('//')) {
        line = `<span class="text-gray-500">${line}</span>`;
      }
    }
    return line;
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e] rounded-lg overflow-hidden border border-border/30">
      {/* Editor header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
        <div className="text-xs text-muted-foreground">{language.toUpperCase()}</div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          {/* Line numbers */}
          <div className="flex-shrink-0 py-4 pr-2 text-right bg-muted/10 select-none">
            {lines.map((_, i) => (
              <div
                key={i}
                className="px-3 text-xs font-mono text-muted-foreground/50 leading-6"
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code area */}
          <div className="flex-1 relative">
            {/* Highlighted overlay */}
            <div className="absolute inset-0 py-4 px-4 pointer-events-none">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="text-sm font-mono leading-6 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: highlightLine(line) || '&nbsp;' }}
                />
              ))}
            </div>

            {/* Actual textarea */}
            <textarea
              value={localContent}
              onChange={handleChange}
              className={cn(
                'w-full h-full py-4 px-4 bg-transparent text-transparent caret-white',
                'font-mono text-sm leading-6 resize-none outline-none',
                'selection:bg-primary/30'
              )}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
