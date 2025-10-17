import { useRef } from "react";
import { Mesh } from "three";
import { GraphNode as GraphNodeType } from "@/types/graph";

interface GraphNodeProps {
  node: GraphNodeType;
  onClick: (node: GraphNodeType) => void;
  onHover: (node: GraphNodeType | null) => void;
}

export function GraphNode({ node, onClick, onHover }: GraphNodeProps) {
  const meshRef = useRef<Mesh>(null);

  const getColor = () => {
    if (node.status === "forgotten") return "#ef4444";
    if (node.status === "expiring") return "#f59e0b";
    if (node.status === "new") return "#00d4ff";
    if (node.status === "older") return "#f97316";
    
    switch (node.type) {
      case "document":
        return "#a855f7";
      case "agent":
        return "#22c55e";
      case "memory": {
        const memoryType = node.metadata?.memoryType;
        if (memoryType === "short_term") {
          return "#38bdf8";
        }
        if (memoryType === "long_term") {
          return "#14b8a6";
        }
        return "#00d4ff";
      }
      default:
        return "#00d4ff";
    }
  };

  const getGeometry = () => {
    switch (node.type) {
      case "document":
        return <boxGeometry args={[0.3, 0.3, 0.3]} />;
      case "agent":
        return <boxGeometry args={[0.3, 0.3, 0.3]} />;
      case "memory":
      default:
        return <sphereGeometry args={[0.15, 16, 16]} />;
    }
  };

  return (
    <mesh
      ref={meshRef}
      position={[node.x || 0, node.y || 0, node.z || 0]}
      onClick={() => onClick(node)}
      onPointerOver={() => onHover(node)}
      onPointerOut={() => onHover(null)}
      rotation={node.type === "agent" ? [0, 0, Math.PI / 4] : [0, 0, 0]}
    >
      {getGeometry()}
      <meshStandardMaterial
        color={getColor()}
        emissive={getColor()}
        emissiveIntensity={node.status === "new" ? 0.5 : 0.2}
        metalness={0.3}
        roughness={0.4}
      />
    </mesh>
  );
}
