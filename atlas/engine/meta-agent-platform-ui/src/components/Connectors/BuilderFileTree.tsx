import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileJson,
  FileCode,
  Settings,
  Key,
  Zap,
  Radio,
} from 'lucide-react';

interface TreeItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  icon?: ReactNode;
  children?: TreeItem[];
}

interface BuilderFileTreeProps {
  onSelect: (item: TreeItem) => void;
  selectedId?: string;
}

const defaultTree: TreeItem[] = [
  {
    id: 'metadata',
    name: 'Metadata',
    type: 'folder',
    icon: <Settings className="w-4 h-4" />,
    children: [
      { id: 'connector.json', name: 'connector.json', type: 'file', icon: <FileJson className="w-4 h-4 text-yellow-400" /> },
    ],
  },
  {
    id: 'auth',
    name: 'Auth',
    type: 'folder',
    icon: <Key className="w-4 h-4" />,
    children: [
      { id: 'auth-config.json', name: 'auth-config.json', type: 'file', icon: <FileJson className="w-4 h-4 text-yellow-400" /> },
    ],
  },
  {
    id: 'actions',
    name: 'Actions',
    type: 'folder',
    icon: <Zap className="w-4 h-4" />,
    children: [
      { id: 'create-incident.json', name: 'create-incident.json', type: 'file', icon: <FileJson className="w-4 h-4 text-yellow-400" /> },
      { id: 'get-incident.json', name: 'get-incident.json', type: 'file', icon: <FileJson className="w-4 h-4 text-yellow-400" /> },
      { id: 'update-incident.json', name: 'update-incident.json', type: 'file', icon: <FileJson className="w-4 h-4 text-yellow-400" /> },
    ],
  },
  {
    id: 'triggers',
    name: 'Triggers',
    type: 'folder',
    icon: <Radio className="w-4 h-4" />,
    children: [
      { id: 'incident-created.json', name: 'incident-created.json', type: 'file', icon: <FileJson className="w-4 h-4 text-yellow-400" /> },
    ],
  },
  {
    id: 'transforms',
    name: 'Transforms',
    type: 'folder',
    icon: <FileCode className="w-4 h-4" />,
    children: [
      { id: 'request-transform.js', name: 'request-transform.js', type: 'file', icon: <FileCode className="w-4 h-4 text-blue-400" /> },
      { id: 'response-transform.js', name: 'response-transform.js', type: 'file', icon: <FileCode className="w-4 h-4 text-blue-400" /> },
    ],
  },
];

const TreeNode = ({
  item,
  level = 0,
  onSelect,
  selectedId,
  expandedIds,
  toggleExpand,
}: {
  item: TreeItem;
  level?: number;
  onSelect: (item: TreeItem) => void;
  selectedId?: string;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
}) => {
  const isExpanded = expandedIds.has(item.id);
  const isFolder = item.type === 'folder';
  const isSelected = item.id === selectedId;

  return (
    <div>
      <div
        onClick={() => {
          if (isFolder) {
            toggleExpand(item.id);
          } else {
            onSelect(item);
          }
        }}
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md text-sm transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/20 text-primary'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-primary" />
            ) : (
              <Folder className="w-4 h-4 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            {item.icon || <File className="w-4 h-4 text-muted-foreground" />}
          </>
        )}
        <span className={cn('truncate', isFolder && 'font-medium')}>
          {item.name}
        </span>
      </div>
      {isFolder && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const BuilderFileTree = ({ onSelect, selectedId }: BuilderFileTreeProps) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(['metadata', 'actions'])
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="p-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-2">
        Files
      </div>
      {defaultTree.map((item) => (
        <TreeNode
          key={item.id}
          item={item}
          onSelect={onSelect}
          selectedId={selectedId}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  );
};
