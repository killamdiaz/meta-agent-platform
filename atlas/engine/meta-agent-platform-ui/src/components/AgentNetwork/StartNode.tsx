import { Handle, Position } from 'reactflow';
import { BrainCircuit } from 'lucide-react';

export function StartNode() {
  return (
    <div className="px-6 py-3 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center gap-2 hover:border-purple-400/60 transition-colors shadow-sm shadow-purple-500/20">
      <BrainCircuit className="h-4 w-4 text-purple-400" />
      <span className="text-sm font-semibold text-purple-200">Meta Cortex</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-purple-400 !border-2 !border-purple-500/40"
      />
    </div>
  );
}
