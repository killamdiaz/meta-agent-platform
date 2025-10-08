import { Handle, Position } from 'reactflow';
import { Play } from 'lucide-react';

export function StartNode() {
  return (
    <div className="px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 hover:border-emerald-500/40 transition-colors">
      <Play className="h-4 w-4 text-emerald-500" />
      <span className="text-sm font-medium text-emerald-500">Start</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-500/20"
      />
    </div>
  );
}
