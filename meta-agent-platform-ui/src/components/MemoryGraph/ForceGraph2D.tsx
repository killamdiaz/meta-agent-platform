import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceX, forceY } from "d3-force-3d";
import { GraphData, GraphNode as GraphNodeType } from "@/types/graph";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface ForceGraph2DProps {
  data: GraphData;
}

type PositionedGraphNode = GraphNodeType & { brainX?: number; brainY?: number };

function hashToUnit(value: string, salt = "") {
  let hash = 0;
  const input = `${value}:${salt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return ((hash >>> 0) % 1_000_000) / 1_000_000;
}

function computeBrainTarget(node: GraphNodeType, index: number, total: number) {
  const baseRadiusByType: Record<GraphNodeType["type"], number> = {
    agent: 110,
    document: 160,
    memory: 210,
  } as const;

  const angleSeed = hashToUnit(node.id, "angle");
  const lobeSeed = hashToUnit(node.id, "lobe");
  const jitterXSeed = hashToUnit(node.id, "jx");
  const jitterYSeed = hashToUnit(node.id, "jy");

  const primaryAngle = angleSeed * Math.PI * 2;
  const spiral = (index / total) * 0.35;
  const adjustedAngle = primaryAngle + spiral;

  const lobeOffset = 140;
  const lobeDirection = lobeSeed < 0.55 ? -1 : 1;
  const baseRadius = baseRadiusByType[node.type] ?? 180;

  const horizontalStretch = 1.2 + 0.35 * Math.abs(Math.sin(adjustedAngle * 1.1));
  const verticalStretch = 0.8 + 0.3 * Math.cos(adjustedAngle * 1.4);

  const ellipseRadius = baseRadius * (1 + 0.15 * Math.sin(adjustedAngle * 2));
  const xComponent = ellipseRadius * Math.cos(adjustedAngle) * horizontalStretch;
  const yComponent = ellipseRadius * Math.sin(adjustedAngle) * verticalStretch;

  const jitterX = (jitterXSeed - 0.5) * (node.type === "agent" ? 20 : 35);
  const jitterY = (jitterYSeed - 0.5) * (node.type === "agent" ? 18 : 28);

  const x = lobeDirection * lobeOffset + xComponent + jitterX;
  const y = yComponent + jitterY;

  return { x, y };
}

export function ForceGraph2DComponent({ data }: ForceGraph2DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>();
  const [hoveredNode, setHoveredNode] = useState<GraphNodeType | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodeType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const selectedMetadataRecord = selectedNode?.metadata as Record<string, unknown> | undefined;
  const selectedMemoryType =
    selectedNode?.type === "memory"
      ? (selectedMetadataRecord?.memoryType as "short_term" | "long_term" | undefined)
      : undefined;
  const selectedMemoryExpiresAt =
    selectedNode?.type === "memory" && typeof selectedMetadataRecord?.expiresAt === "string"
      ? (selectedMetadataRecord?.expiresAt as string)
      : null;
  const selectedRetention =
    selectedNode?.type === "memory" && selectedMetadataRecord
      ? ((selectedMetadataRecord["retention"] ?? {}) as { reason?: unknown })
      : undefined;

  const sanitizedData = useMemo(() => {
    const total = Math.max(1, data.nodes.length);
    const nodes = data.nodes.map((node, index) => {
      const clone: PositionedGraphNode = { ...node };
      const target = computeBrainTarget(clone, index, total);
      clone.brainX = target.x;
      clone.brainY = target.y;

      const offsetSeedX = hashToUnit(node.id, "offset-x");
      const offsetSeedY = hashToUnit(node.id, "offset-y");
      const nudgeSeedX = hashToUnit(node.id, "nudge-x");
      const nudgeSeedY = hashToUnit(node.id, "nudge-y");

      if (!Number.isFinite(clone.x) || !Number.isFinite(clone.y)) {
        clone.x = target.x + (offsetSeedX - 0.5) * 18;
        clone.y = target.y + (offsetSeedY - 0.5) * 18;
      } else {
        clone.x += (nudgeSeedX - 0.5) * 8;
        clone.y += (nudgeSeedY - 0.5) * 8;
      }

      if (!Number.isFinite(clone.vx)) clone.vx = 0;
      if (!Number.isFinite(clone.vy)) clone.vy = 0;
      return clone;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links = data.links
      .map((link) => {
        const sourceId = typeof link.source === "string" ? link.source : link.source.id;
        const targetId = typeof link.target === "string" ? link.target : link.target.id;
        return { ...link, source: sourceId, target: targetId, _sourceId: sourceId, _targetId: targetId };
      })
      .filter((link) => link._sourceId !== link._targetId && nodeIds.has(link._sourceId) && nodeIds.has(link._targetId))
      .map(({ _sourceId, _targetId, ...link }) => link);

    return { nodes, links };
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fgRef.current || !dimensions.width || !dimensions.height) return;
    if (!sanitizedData.nodes.length) return;
    const timeout = setTimeout(() => {
      fgRef.current.zoomToFit(400, 40);
    }, 150);
    return () => clearTimeout(timeout);
  }, [sanitizedData, dimensions]);

  useEffect(() => {
    if (!fgRef.current || !sanitizedData.nodes.length) {
      return;
    }

    const size = Math.max(220, Math.min(dimensions.width, dimensions.height) / 1.9 || 260);

    const brainForceX = forceX<PositionedGraphNode>((node) => node.brainX ?? 0).strength(0.12);
    const brainForceY = forceY<PositionedGraphNode>((node) => node.brainY ?? 0).strength(0.12);

    const graph = fgRef.current;
    if (!graph || typeof graph.d3Force !== "function") {
      return;
    }

    graph.d3Force("brain-x", brainForceX);
    graph.d3Force("brain-y", brainForceY);

    const chargeForce = graph.d3Force("charge");
    if (chargeForce && typeof chargeForce.strength === "function") {
      chargeForce.strength(-80);
      if (typeof chargeForce.distanceMin === "function") {
        chargeForce.distanceMin(12);
      }
      if (typeof chargeForce.distanceMax === "function") {
        chargeForce.distanceMax(size * 2.6);
      }
    }

    const linkForce = graph.d3Force("link");
    if (linkForce?.distance) {
      linkForce.distance((link: any) => {
        switch (link.relation) {
          case "derived":
            return size * 0.32;
          case "extends":
            return size * 0.42;
          case "shared":
            return size * 0.48;
          default:
            return size * 0.38;
        }
      });
    }

    if (typeof graph.d3ReheatSimulation === "function") {
      graph.d3ReheatSimulation();
    } else if (typeof graph.d3Alpha === "function") {
      graph.d3Alpha(0.7);
    }

    return () => {
      if (fgRef.current === graph) {
        graph.d3Force("brain-x", null);
        graph.d3Force("brain-y", null);
      }
    };
  }, [sanitizedData, dimensions]);

  const focusNode = useCallback(
    (node?: PositionedGraphNode) => {
      if (!node || !fgRef.current) return;
      const graph = fgRef.current;
      const nodeX = Number.isFinite(node.x) ? node.x! : node.brainX ?? 0;
      const nodeY = Number.isFinite(node.y) ? node.y! : node.brainY ?? 0;
      const currentZoom = typeof graph.zoom === "function" ? graph.zoom() : undefined;
      if (typeof graph.centerAt === "function") {
        graph.centerAt(nodeX, nodeY, 600);
      }
      if (typeof graph.zoom === "function") {
        const targetZoom = Math.max(1.4, currentZoom ?? 1.6);
        graph.zoom(targetZoom, 600);
      }
      setSelectedNode(node);
    },
    [fgRef],
  );

  const agentPalette = useMemo(
    () => [
      "#22d3ee",
      "#a855f7",
      "#f97316",
      "#34d399",
      "#facc15",
      "#38bdf8",
      "#f472b6",
      "#c084fc",
      "#fb7185",
      "#818cf8",
    ],
    [],
  );

  const agentColors = useMemo(() => {
    const agents = sanitizedData.nodes.filter((node) => node.type === "agent");
    const map = new Map<string, string>();
    agents.forEach((agent, index) => {
      map.set(agent.id, agentPalette[index % agentPalette.length]);
    });
    return map;
  }, [sanitizedData.nodes, agentPalette]);

  const withAlpha = useCallback((hex: string, alpha: number) => {
    if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
      return hex;
    }
    let r: number;
    let g: number;
    let b: number;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hoveredNodeId = hoveredNode?.id;
  const selectedNodeId = selectedNode?.id;
  const matchingNodes = useMemo(() => {
    if (!normalizedQuery) return [];
    return sanitizedData.nodes
      .filter((node) => {
        const label = node.label?.toLowerCase() ?? "";
        const type = node.type?.toLowerCase() ?? "";
        return label.includes(normalizedQuery) || type.includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [sanitizedData.nodes, normalizedQuery]);

  const getNodeColor = (node: GraphNodeType) => {
    if (node.status === "forgotten") return "#dc2626";
    if (node.status === "expiring") return "#ea580c";
    if (node.status === "new") return "#fbbf24";
    if (node.status === "older") return "#10b981";

    switch (node.type) {
      case "document":
        return "#8b5cf6";
      case "agent": {
        return "#ffffff";
      }
      case "memory": {
        const memoryType = node.metadata?.memoryType;
        if (memoryType === "short_term") {
          return "#38bdf8";
        }
        if (memoryType === "long_term") {
          return "#14b8a6";
        }
        const createdBy = node.metadata?.createdBy;
        const agentColor = createdBy ? agentColors.get(createdBy) : undefined;
        return agentColor ? withAlpha(agentColor, 0.75) : "#3b82f6";
      }
      default:
        return "#6b7280";
    }
  };

  const getNodeSize = (node: GraphNodeType) => {
    if (node.type === "agent") return 3.8;
    if (node.type === "document") return 2.8;
    return 2.4;
  };

  const getLinkColor = (link: any) => {
    switch (link.relation) {
      case "updated":
        return "rgba(59, 130, 246, 0.15)";
      case "extends":
        return "rgba(139, 92, 246, 0.18)";
      case "derived":
        return "rgba(20, 184, 166, 0.2)";
      case "similar":
        return "rgba(16, 185, 129, 0.12)";
      case "shared":
        return "rgba(244, 114, 182, 0.12)";
      default:
        return "rgba(100, 116, 139, 0.1)";
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
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/* Search + Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-3">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search for nodes..."
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                focusNode(matchingNodes[0]);
              }
              if (event.key === "Escape") {
                setSearchQuery("");
                setIsSearchFocused(false);
              }
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background/95 backdrop-blur-sm border-border"
          />
          {isSearchFocused && matchingNodes.length > 0 && (
            <div className="absolute left-0 top-11 w-full rounded-xl border border-border/70 bg-background/95 backdrop-blur-sm shadow-lg">
              <div className="py-1">
                {matchingNodes.map((node) => (
                  <button
                    key={node.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      focusNode(node);
                      setSearchQuery(node.label ?? node.id);
                      setIsSearchFocused(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted/40 flex flex-col gap-0.5"
                  >
                    <span className="font-medium">{node.label}</span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{node.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
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
                {sanitizedData.links.filter(
                  (l) => {
                    const source = typeof l.source === "string" ? l.source : l.source.id;
                    const target = typeof l.target === "string" ? l.target : l.target.id;
                    return source === selectedNode.id || target === selectedNode.id;
                  }
                ).length}
              </span>
            </div>
            {selectedNode.metadata?.createdBy && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created by:</span>
                <span className="text-foreground">
                  {sanitizedData.nodes.find((node) => node.id === selectedNode.metadata?.createdBy)?.label ??
                    selectedNode.metadata?.createdBy}
                </span>
              </div>
            )}
            {selectedNode.type === "memory" && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memory type:</span>
                  <span className="text-foreground capitalize">
                    {selectedMemoryType === "short_term"
                      ? "Short-term"
                      : selectedMemoryType === "long_term"
                      ? "Long-term"
                      : "Unknown"}
                  </span>
                </div>
                {selectedMemoryExpiresAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires:</span>
                    <span className="text-foreground">
                      {new Date(selectedMemoryExpiresAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedRetention?.reason && typeof selectedRetention.reason === "string" && (
                  <div>
                    <span className="text-muted-foreground block">Retention logic:</span>
                    <span className="text-foreground italic">{selectedRetention.reason}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {/* Force Graph */}
      <ForceGraph2D
        ref={fgRef}
        graphData={sanitizedData}
        width={dimensions.width}
        height={dimensions.height}
        nodeLabel="label"
        nodeColor={(node) => getNodeColor(node as GraphNodeType)}
        nodeVal={(node) => getNodeSize(node as GraphNodeType)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const graphNode = node as GraphNodeType;
          const label = graphNode.label;
          const fontSize = 10 / globalScale;
          const nodeSize = getNodeSize(graphNode);
          const color = getNodeColor(graphNode);
          const isAgent = graphNode.type === "agent";

          const nodeX = typeof node.x === "number" && Number.isFinite(node.x) ? node.x : 0;
          const nodeY = typeof node.y === "number" && Number.isFinite(node.y) ? node.y : 0;

          if (isAgent) {
            ctx.save();
            const glowRadius = nodeSize * 2.4;
            const gradient = ctx.createRadialGradient(
              nodeX,
              nodeY,
              nodeSize * 0.25,
              nodeX,
              nodeY,
              glowRadius,
            );
            gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
            gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.85)");
            gradient.addColorStop(0.7, "rgba(255, 255, 255, 0.2)");
            gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, glowRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
          }
          
          ctx.shadowBlur = isAgent ? 26 : 15;
          ctx.shadowColor = isAgent ? "rgba(255, 255, 255, 0.85)" : color;
          
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, nodeSize, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();

          if (isAgent) {
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, nodeSize * 0.65, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fill();
          }

          ctx.shadowBlur = 0;
          ctx.strokeStyle = isAgent ? "rgba(255, 255, 255, 0.85)" : color;
          ctx.lineWidth = isAgent ? 0.9 : 0.5;
          ctx.beginPath();
          ctx.arc(nodeX, nodeY, nodeSize + (isAgent ? 0.2 : 0), 0, 2 * Math.PI);
          ctx.stroke();
          
          const matchesSearch = normalizedQuery
            ? label?.toLowerCase().includes(normalizedQuery) ||
              graphNode.type?.toLowerCase().includes(normalizedQuery)
            : false;
          const emphasize = hoveredNodeId === graphNode.id || selectedNodeId === graphNode.id;

          if (matchesSearch) {
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, nodeSize + 1.3, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          const shouldRenderLabel =
            Boolean(label) && (matchesSearch || emphasize || globalScale >= 1.8);

          if (shouldRenderLabel) {
            ctx.shadowBlur = 0;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.fillText(label, nodeX, nodeY + nodeSize + fontSize + 2);
          }
        }}
        linkColor={getLinkColor}
        linkWidth={(link: any) => link.strength * 0.8}
        linkCurvature={0.15}
        linkDirectionalParticles={(link: any) =>
          link.relation === "derived" || link.relation === "shared" ? 1 : 0
        }
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
