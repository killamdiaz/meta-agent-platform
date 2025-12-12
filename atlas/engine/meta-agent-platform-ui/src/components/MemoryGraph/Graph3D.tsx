import { useRef, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Line } from "@react-three/drei";
import { forceSimulation, forceLink, forceManyBody, forceCenter } from "d3-force-3d";
import { GraphData, GraphNode as GraphNodeType } from "@/types/graph";
import { GraphNode } from "./GraphNode";
import { Points } from "./Points";
import { Card } from "@/components/ui/card";

interface Graph3DProps {
  data: GraphData;
}

export function Graph3D({ data }: Graph3DProps) {
  const [graphData, setGraphData] = useState<GraphData>(data);
  const [hoveredNode, setHoveredNode] = useState<GraphNodeType | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeType | null>(null);
  const simulationRef = useRef<any>(null);

  useEffect(() => {
    // Initialize D3 force simulation
    const simulation = forceSimulation(graphData.nodes as any)
      .force(
        "link",
        forceLink(graphData.links)
          .id((d: any) => d.id)
          .distance(2)
          .strength(0.5)
      )
      .force("charge", forceManyBody().strength(-100))
      .force("center", forceCenter(0, 0, 0))
      .numDimensions(3);

    simulationRef.current = simulation;

    // Update positions on each tick
    simulation.on("tick", () => {
      setGraphData({ ...graphData });
    });

    // Stop simulation after convergence
    setTimeout(() => simulation.stop(), 3000);

    return () => {
      simulation.stop();
    };
  }, []);

  const handleNodeClick = (node: GraphNodeType) => {
    setSelectedNode(node);
  };

  const getRelationColor = (relation: string) => {
    switch (relation) {
      case "updated": return "#60a5fa";
      case "extends": return "#a78bfa";
      case "derived": return "#34d399";
      default: return "#00d4ff";
    }
  };

  return (
    <>
      <Canvas className="bg-[#0B0C10]">
        <PerspectiveCamera makeDefault position={[0, 0, 10]} />
        <OrbitControls enableDamping dampingFactor={0.05} />
        
        {/* Ambient light */}
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />

        {/* Background particles */}
        <Points />

        {/* Grid helper */}
        <gridHelper args={[20, 20, "#1a1d29", "#1a1d29"]} rotation={[Math.PI / 2, 0, 0]} />

        {/* Render links */}
        {graphData.links.map((link, i) => {
          const source = typeof link.source === "string" 
            ? graphData.nodes.find(n => n.id === link.source)
            : link.source;
          const target = typeof link.target === "string"
            ? graphData.nodes.find(n => n.id === link.target)
            : link.target;

          if (!source || !target || !source.x || !target.x) return null;

          return (
            <Line
              key={i}
              points={[
                [source.x, source.y || 0, source.z || 0],
                [target.x, target.y || 0, target.z || 0],
              ]}
              color={getRelationColor(link.relation)}
              lineWidth={1}
              opacity={link.strength * 0.6}
              transparent
            />
          );
        })}

        {/* Render nodes */}
        {graphData.nodes.map((node) => (
          <GraphNode
            key={node.id}
            node={node}
            onClick={handleNodeClick}
            onHover={setHoveredNode}
          />
        ))}
      </Canvas>

      {/* Hover tooltip */}
      {hoveredNode && (
        <Card className="absolute top-24 left-6 z-10 bg-card border-border p-4 space-y-2 w-72 animate-fade-in">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-foreground">{hoveredNode.label}</div>
              <div className="text-xs text-muted-foreground capitalize">{hoveredNode.type}</div>
            </div>
            <div
              className={`px-2 py-1 rounded text-xs font-medium ${
                hoveredNode.status === "new"
                  ? "bg-atlas-glow/20 text-atlas-glow"
                  : hoveredNode.status === "forgotten"
                  ? "bg-red-500/20 text-red-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {hoveredNode.status}
            </div>
          </div>
          {hoveredNode.metadata && (
            <div className="text-xs text-muted-foreground">
              {hoveredNode.metadata.createdAt && (
                <div>Created: {hoveredNode.metadata.createdAt}</div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Selected node details */}
      {selectedNode && (
        <Card className="absolute bottom-6 left-6 z-10 bg-card border-border p-4 w-96 animate-fade-in">
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
                {graphData.links.filter(
                  l => l.source === selectedNode.id || l.target === selectedNode.id
                ).length}
              </span>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
