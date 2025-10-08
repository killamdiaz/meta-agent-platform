import { useRef, useState, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { GraphData, GraphNode as GraphNodeType } from "@/types/graph";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface ForceGraph2DProps {
  data: GraphData;
}

export function ForceGraph2DComponent({ data }: ForceGraph2DProps) {
  const fgRef = useRef<any>();
  const [hoveredNode, setHoveredNode] = useState<GraphNodeType | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const getNodeColor = (node: GraphNodeType) => {
    if (node.status === "forgotten") return "#dc2626";
    if (node.status === "expiring") return "#ea580c";
    if (node.status === "new") return "#fbbf24";
    if (node.status === "older") return "#10b981";
    
    switch (node.type) {
      case "document": return "#8b5cf6";
      case "agent": return "#14b8a6";
      case "memory": return "#3b82f6";
      default: return "#6b7280";
    }
  };

  const getNodeSize = (node: GraphNodeType) => {
    return node.type === "agent" ? 3 : node.type === "document" ? 2.5 : 2;
  };

  const getLinkColor = (link: any) => {
    switch (link.relation) {
      case "updated": return "rgba(59, 130, 246, 0.15)";
      case "extends": return "rgba(139, 92, 246, 0.15)";
      case "derived": return "rgba(20, 184, 166, 0.15)";
      case "similar": return "rgba(16, 185, 129, 0.12)";
      default: return "rgba(100, 116, 139, 0.1)";
    }
  };


  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node as GraphNodeType);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleZoomIn = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * 1.2, 400);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() / 1.2, 400);
    }
  };

  const handleFitView = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  };

  return (
    <div className="relative h-full w-full">
      {/* Search Bar */}
      <div className="absolute top-4 right-4 z-10">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search for nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background/95 backdrop-blur-sm border-border"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-[340px] z-10 flex flex-col gap-2">
        <Button
          size="icon"
          variant="outline"
          className="bg-background/95 backdrop-blur-sm border-border"
          onClick={handleZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="bg-background/95 backdrop-blur-sm border-border"
          onClick={handleZoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="bg-background/95 backdrop-blur-sm border-border"
          onClick={handleFitView}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (
        <Card className="absolute top-24 left-6 z-10 bg-background/95 backdrop-blur-sm border-border p-4 space-y-2 w-72 animate-fade-in">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-foreground">{hoveredNode.label}</div>
              <div className="text-xs text-muted-foreground capitalize">{hoveredNode.type}</div>
            </div>
            <div
              className={`px-2 py-1 rounded text-xs font-medium ${
                hoveredNode.status === "new"
                  ? "bg-purple-500/20 text-purple-400"
                  : hoveredNode.status === "forgotten"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {hoveredNode.status}
            </div>
          </div>
        </Card>
      )}

      {/* Selected node details */}
      {selectedNode && (
        <Card className="absolute bottom-6 left-6 z-10 bg-background/95 backdrop-blur-sm border-border p-4 w-96 animate-fade-in">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-lg font-semibold text-foreground">{selectedNode.label}</div>
              <div className="text-sm text-muted-foreground capitalize">{selectedNode.type}</div>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="text-foreground capitalize">{selectedNode.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connections:</span>
              <span className="text-foreground">
                {data.links.filter(
                  (l) => {
                    const source = typeof l.source === "string" ? l.source : l.source.id;
                    const target = typeof l.target === "string" ? l.target : l.target.id;
                    return source === selectedNode.id || target === selectedNode.id;
                  }
                ).length}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Force Graph */}
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeLabel="label"
        nodeColor={(node) => getNodeColor(node as GraphNodeType)}
        nodeVal={(node) => getNodeSize(node as GraphNodeType)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = (node as any).label;
          const fontSize = 10 / globalScale;
          const nodeSize = getNodeSize(node as GraphNodeType);
          const color = getNodeColor(node as GraphNodeType);
          
          // Draw outer glow
          ctx.shadowBlur = 15;
          ctx.shadowColor = color;
          
          // Draw node circle
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, nodeSize, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          
          // Draw subtle ring
          ctx.shadowBlur = 0;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          
          // Draw label for important nodes when zoomed in
          if ((nodeSize > 2.5 || globalScale > 3) && label) {
            ctx.shadowBlur = 0;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillText(label, node.x!, node.y! + nodeSize + fontSize + 2);
          }
        }}
        linkColor={getLinkColor}
        linkWidth={(link: any) => link.strength * 0.8}
        linkCurvature={0.15}
        linkDirectionalParticles={(link: any) => link.relation === "derived" ? 1 : 0}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.003}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onNodeHover={(node) => setHoveredNode(node as GraphNodeType | null)}
        cooldownTicks={150}
        d3AlphaDecay={0.015}
        d3VelocityDecay={0.4}
        backgroundColor="#0B0D17"
        nodeCanvasObjectMode={() => "replace"}
        onRenderFramePre={(ctx) => {
          // Draw subtle dot grid background
          const dotSpacing = 40;
          const dotRadius = 0.5;
          const dotColor = "rgba(148, 163, 184, 0.08)";
          
          const width = ctx.canvas.width;
          const height = ctx.canvas.height;
          
          ctx.fillStyle = dotColor;
          for (let x = 0; x < width; x += dotSpacing) {
            for (let y = 0; y < height; y += dotSpacing) {
              ctx.beginPath();
              ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        }}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
