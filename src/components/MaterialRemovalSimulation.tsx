import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Play, Pause, Square, RotateCcw, Zap } from 'lucide-react';

interface Operation {
  id: string;
  type: 'roughing' | 'finishing' | 'drilling' | 'chamfering';
  name: string;
  tool: any;
  feature: any;
  duration: number;
  toolpath: THREE.Vector3[];
}

interface MaterialRemovalSimulationProps {
  operations: Operation[];
  originalGeometry?: THREE.BufferGeometry;
  onSimulationComplete?: () => void;
}

// Tool component that shows the cutting tool moving along the path
const CuttingTool: React.FC<{ 
  operation: Operation; 
  progress: number; 
  isActive: boolean 
}> = ({ operation, progress, isActive }) => {
  const toolRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (!toolRef.current || !isActive || operation.toolpath.length === 0) return;
    
    const pathIndex = Math.floor(progress * (operation.toolpath.length - 1));
    const currentPoint = operation.toolpath[pathIndex];
    const nextPoint = operation.toolpath[Math.min(pathIndex + 1, operation.toolpath.length - 1)];
    
    // Position the tool
    toolRef.current.position.copy(currentPoint);
    
    // Orient the tool towards the next point
    const direction = new THREE.Vector3().subVectors(nextPoint, currentPoint).normalize();
    toolRef.current.lookAt(currentPoint.clone().add(direction));
    
    // Rotate the tool to simulate spinning
    toolRef.current.rotation.z += 0.2;
  });

  const toolGeometry = useMemo(() => {
    switch (operation.type) {
      case 'drilling':
        return <cylinderGeometry args={[0.01, 0.02, 0.1, 8]} />;
      case 'chamfering':
        return <coneGeometry args={[0.02, 0.08, 6]} />;
      default:
        return <boxGeometry args={[0.02, 0.02, 0.1]} />;
    }
  }, [operation.type]);

  const toolColor = useMemo(() => {
    switch (operation.type) {
      case 'roughing': return '#ef4444';
      case 'finishing': return '#3b82f6';
      case 'drilling': return '#10b981';
      case 'chamfering': return '#f59e0b';
      default: return '#6b7280';
    }
  }, [operation.type]);

  if (!isActive) return null;

  return (
    <group ref={toolRef}>
      {toolGeometry}
      <meshStandardMaterial color={toolColor} metalness={0.8} roughness={0.2} />
    </group>
  );
};

// Workpiece component that shows progressive material removal
const Workpiece: React.FC<{ 
  originalGeometry?: THREE.BufferGeometry; 
  removalProgress: number;
  currentOperation?: Operation;
}> = ({ originalGeometry, removalProgress, currentOperation }) => {
  const workpieceRef = useRef<THREE.Mesh>(null);
  const [currentGeometry, setCurrentGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [baseGeometry, setBaseGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (originalGeometry) {
      const clonedGeometry = originalGeometry.clone();
      setBaseGeometry(clonedGeometry);
      setCurrentGeometry(clonedGeometry.clone());
    }
  }, [originalGeometry]);

  useEffect(() => {
    if (!baseGeometry || !currentOperation) return;

    // Create realistic material removal based on operation type
    const newGeometry = baseGeometry.clone();
    const positions = newGeometry.attributes.position.array as Float32Array;
    const feature = currentOperation.feature;
    
    // Convert feature position from mm to meters (Three.js units)
    const featurePos = new THREE.Vector3(
      feature.position.x / 1000,
      feature.position.y / 1000, 
      feature.position.z / 1000
    );
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const vertex = new THREE.Vector3(x, y, z);
      let shouldRemove = false;
      
      switch (feature.type) {
        case 'hole':
          const drillRadius = (feature.dimensions.diameter || 6) / 2000; // mm to m
          const drillDepth = (feature.dimensions.depth || 10) / 1000;
          const distanceFromAxis = Math.sqrt(
            Math.pow(x - featurePos.x, 2) + 
            Math.pow(y - featurePos.y, 2)
          );
          
          shouldRemove = distanceFromAxis <= drillRadius && 
                        z >= featurePos.z - drillDepth * removalProgress &&
                        z <= featurePos.z;
          break;
          
        case 'pocket':
          const pocketWidth = (feature.dimensions.width || 20) / 2000;
          const pocketLength = (feature.dimensions.length || 20) / 2000;
          const pocketDepth = (feature.dimensions.depth || 5) / 1000;
          
          const withinPocketX = Math.abs(x - featurePos.x) <= pocketWidth / 2;
          const withinPocketY = Math.abs(y - featurePos.y) <= pocketLength / 2;
          const withinPocketZ = z >= featurePos.z - pocketDepth * removalProgress &&
                                z <= featurePos.z;
          
          shouldRemove = withinPocketX && withinPocketY && withinPocketZ;
          break;
          
        case 'slot':
          const slotWidth = (feature.dimensions.width || 10) / 2000;
          const slotLength = (feature.dimensions.length || 30) / 2000;
          const slotDepth = (feature.dimensions.depth || 5) / 1000;
          
          const withinSlotX = Math.abs(x - featurePos.x) <= slotWidth / 2;
          const withinSlotY = Math.abs(y - featurePos.y) <= slotLength / 2;
          const withinSlotZ = z >= featurePos.z - slotDepth * removalProgress &&
                             z <= featurePos.z;
          
          shouldRemove = withinSlotX && withinSlotY && withinSlotZ;
          break;
          
        default:
          // Generic material removal for other features
          const toolRadius = (currentOperation.tool?.diameter || 10) / 2000;
          const distance = vertex.distanceTo(featurePos);
          shouldRemove = distance <= toolRadius && Math.random() < removalProgress;
      }
      
      if (shouldRemove) {
        // Move vertex below the work surface to simulate removal
        positions[i + 2] = featurePos.z - 0.1;
      }
    }
    
    newGeometry.attributes.position.needsUpdate = true;
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    
    setCurrentGeometry(newGeometry);
  }, [removalProgress, currentOperation, baseGeometry]);

  if (!currentGeometry) {
    // Fallback geometry if no STL is loaded
    return (
      <mesh ref={workpieceRef}>
        <boxGeometry args={[2, 1, 0.5]} />
        <meshStandardMaterial 
          color="hsl(var(--muted))" 
          metalness={0.7} 
          roughness={0.3} 
          transparent
          opacity={0.9}
        />
      </mesh>
    );
  }

  return (
    <mesh ref={workpieceRef} geometry={currentGeometry}>
      <meshStandardMaterial 
        color="hsl(var(--muted))"
        metalness={0.7} 
        roughness={0.3} 
        transparent
        opacity={0.9}
      />
    </mesh>
  );
};

// Toolpath visualization component
const ToolpathVisualization: React.FC<{ 
  operations: Operation[]; 
  currentOperationIndex: number;
  progress: number;
}> = ({ operations, currentOperationIndex, progress }) => {
  const pathRefs = useRef<THREE.Line[]>([]);

  return (
    <>
      {operations.map((operation, index) => {
        if (operation.toolpath.length === 0) return null;

        const points = operation.toolpath;
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        const isCurrentOperation = index === currentOperationIndex;
        const isCompleted = index < currentOperationIndex;
        
        let color = '#6b7280'; // Default gray
        let opacity = 0.3;
        
        if (isCompleted) {
          opacity = 0.8;
          switch (operation.type) {
            case 'roughing': color = '#ef4444'; break;
            case 'finishing': color = '#3b82f6'; break;
            case 'drilling': color = '#10b981'; break;
            case 'chamfering': color = '#f59e0b'; break;
          }
        } else if (isCurrentOperation) {
          opacity = 1.0;
          switch (operation.type) {
            case 'roughing': color = '#ef4444'; break;
            case 'finishing': color = '#3b82f6'; break;
            case 'drilling': color = '#10b981'; break;
            case 'chamfering': color = '#f59e0b'; break;
          }
        }

        return (
          <primitive key={operation.id} object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ 
            color: color, 
            transparent: true, 
            opacity: opacity 
          }))} />
        );
      })}
    </>
  );
};

// Main 3D scene component
const SimulationScene: React.FC<{
  operations: Operation[];
  isPlaying: boolean;
  speed: number;
  onProgress: (progress: number, operationIndex: number) => void;
  originalGeometry?: THREE.BufferGeometry;
}> = ({ operations, isPlaying, speed, onProgress, originalGeometry }) => {
  const [globalProgress, setGlobalProgress] = useState(0);
  const [currentOperationIndex, setCurrentOperationIndex] = useState(0);
  const [operationProgress, setOperationProgress] = useState(0);

  useFrame((state, delta) => {
    if (!isPlaying || operations.length === 0) return;

    const progressDelta = (delta * speed) / operations[currentOperationIndex]?.duration || 1;
    const newOperationProgress = operationProgress + progressDelta;

    if (newOperationProgress >= 1) {
      // Move to next operation
      if (currentOperationIndex < operations.length - 1) {
        setCurrentOperationIndex(currentOperationIndex + 1);
        setOperationProgress(0);
      } else {
        // Simulation complete
        setOperationProgress(1);
      }
    } else {
      setOperationProgress(newOperationProgress);
    }

    // Calculate global progress
    const newGlobalProgress = (currentOperationIndex + operationProgress) / operations.length;
    setGlobalProgress(newGlobalProgress);
    onProgress(newGlobalProgress, currentOperationIndex);
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[3, 3, 3]} />
      <OrbitControls enablePan enableZoom enableRotate />
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <pointLight position={[-10, -10, -5]} intensity={0.3} />
      
      {/* Environment */}
      <Environment preset="warehouse" />
      
      {/* Workpiece with material removal */}
      <Workpiece 
        originalGeometry={originalGeometry}
        removalProgress={operationProgress}
        currentOperation={operations[currentOperationIndex]}
      />
      
      {/* Toolpath visualization */}
      <ToolpathVisualization 
        operations={operations}
        currentOperationIndex={currentOperationIndex}
        progress={operationProgress}
      />
      
      {/* Current cutting tool */}
      {operations[currentOperationIndex] && (
        <CuttingTool 
          operation={operations[currentOperationIndex]}
          progress={operationProgress}
          isActive={isPlaying}
        />
      )}
      
      {/* Grid for reference */}
      <gridHelper args={[10, 10]} />
    </>
  );
};

export const MaterialRemovalSimulation: React.FC<MaterialRemovalSimulationProps> = ({
  operations,
  originalGeometry,
  onSimulationComplete
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState([1]);
  const [progress, setProgress] = useState(0);
  const [currentOperationIndex, setCurrentOperationIndex] = useState(0);

  // Generate mock toolpaths for operations
  const operationsWithToolpaths = useMemo(() => {
    return operations.map(op => ({
      ...op,
      toolpath: generateMockToolpath(op),
      duration: getDurationForOperation(op)
    }));
  }, [operations]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentOperationIndex(0);
  };

  const handleProgress = (newProgress: number, operationIndex: number) => {
    setProgress(newProgress);
    setCurrentOperationIndex(operationIndex);
    
    if (newProgress >= 1 && onSimulationComplete) {
      onSimulationComplete();
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* 3D Canvas */}
      <div className="flex-1 min-h-[400px] bg-gray-50 rounded-lg overflow-hidden">
        <Canvas shadows>
          <SimulationScene 
            operations={operationsWithToolpaths}
            isPlaying={isPlaying}
            speed={speed[0]}
            onProgress={handleProgress}
            originalGeometry={originalGeometry}
          />
        </Canvas>
      </div>
      
      {/* Controls */}
      <Card className="p-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayPause}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="text-sm">Speed:</span>
            <div className="w-24">
              <Slider
                value={speed}
                onValueChange={setSpeed}
                max={3}
                min={0.1}
                step={0.1}
                className="w-full"
              />
            </div>
            <span className="text-sm">{speed[0]}x</span>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress: {Math.round(progress * 100)}%</span>
            <span>
              Operation: {currentOperationIndex + 1}/{operationsWithToolpaths.length}
              {operationsWithToolpaths[currentOperationIndex] && 
                ` - ${operationsWithToolpaths[currentOperationIndex].name}`
              }
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

// Helper functions for realistic toolpath generation
function generateMockToolpath(operation: any): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const feature = operation.feature;
  
  // Convert positions from mm to meters for Three.js
  const featurePos = new THREE.Vector3(
    feature.position.x / 1000,
    feature.position.y / 1000,
    feature.position.z / 1000
  );
  
  switch (operation.type) {
    case 'roughing':
      // Generate adaptive clearing pattern
      const pocketWidth = (feature.dimensions.width || 20) / 2000;
      const pocketLength = (feature.dimensions.length || 20) / 2000;
      const stepover = (operation.tool?.diameter || 10) / 3000; // Conservative stepover
      
      for (let y = -pocketLength/2; y <= pocketLength/2; y += stepover) {
        const direction = Math.floor((y + pocketLength/2) / stepover) % 2 === 0 ? 1 : -1;
        const startX = direction > 0 ? -pocketWidth/2 : pocketWidth/2;
        const endX = direction > 0 ? pocketWidth/2 : -pocketWidth/2;
        
        for (let x = startX; direction > 0 ? x <= endX : x >= endX; x += direction * stepover/2) {
          points.push(new THREE.Vector3(
            featurePos.x + x,
            featurePos.y + y,
            featurePos.z - 0.002 // 2mm cutting depth
          ));
        }
      }
      break;
      
    case 'finishing':
      // Generate contour finishing passes
      const contourRadius = Math.min(
        (feature.dimensions.width || 20) / 2000,
        (feature.dimensions.length || 20) / 2000
      ) * 0.9;
      
      for (let i = 0; i <= 100; i++) {
        const angle = (i / 100) * Math.PI * 2;
        points.push(new THREE.Vector3(
          featurePos.x + Math.cos(angle) * contourRadius,
          featurePos.y + Math.sin(angle) * contourRadius,
          featurePos.z - 0.001
        ));
      }
      break;
      
    case 'drilling':
      // Generate realistic drilling cycle
      const drillDepth = (feature.dimensions.depth || 10) / 1000;
      const peckDepth = 0.002; // 2mm pecks
      
      for (let depth = 0; depth <= drillDepth; depth += peckDepth) {
        // Drill down
        points.push(new THREE.Vector3(featurePos.x, featurePos.y, featurePos.z - depth));
        // Retract for chip clearing
        if (depth < drillDepth) {
          points.push(new THREE.Vector3(featurePos.x, featurePos.y, featurePos.z + 0.002));
        }
      }
      break;
      
    case 'chamfering':
      // Generate chamfer toolpath
      const chamferSize = (feature.dimensions.size || 2) / 2000;
      const perimeter = feature.dimensions.perimeter || 100;
      
      for (let i = 0; i <= perimeter; i++) {
        const angle = (i / perimeter) * Math.PI * 2;
        const radius = (Math.min(feature.dimensions.width, feature.dimensions.length) || 20) / 2000;
        
        points.push(new THREE.Vector3(
          featurePos.x + Math.cos(angle) * radius,
          featurePos.y + Math.sin(angle) * radius,
          featurePos.z + chamferSize
        ));
      }
      break;
  }
  
  return points;
}

function getDurationForOperation(operation: any): number {
  // Realistic machining time calculation
  const feature = operation.feature;
  const volume = calculateFeatureVolume(feature);
  const mrr = 100; // 100 mm³/min for conservative estimate
  
  // Base time from volume and MRR
  let baseTime = volume / mrr * 60; // Convert to seconds
  
  // Add operation-specific factors
  const operationFactors = {
    'roughing': 2.5,    // Heavy material removal
    'finishing': 1.8,   // Precision work
    'drilling': 1.2,    // Standard drilling
    'chamfering': 1.0   // Quick edge work
  };
  
  const factor = operationFactors[operation.type as keyof typeof operationFactors] || 1.5;
  
  // Add setup and safety time
  const setupTime = 45; // 45 seconds setup per operation
  const safetyTime = 15; // 15 seconds for retracts and rapids
  
  return baseTime * factor + setupTime + safetyTime;
}

function calculateFeatureVolume(feature: any): number {
  switch (feature.type) {
    case 'pocket':
      return (feature.dimensions.width || 20) * 
             (feature.dimensions.length || 20) * 
             (feature.dimensions.depth || 5);
    case 'hole':
      const radius = (feature.dimensions.diameter || 6) / 2;
      return Math.PI * radius * radius * (feature.dimensions.depth || 10);
    case 'slot':
      return (feature.dimensions.width || 10) * 
             (feature.dimensions.length || 30) * 
             (feature.dimensions.depth || 5);
    case 'chamfer':
      return Math.pow(feature.dimensions.size || 2, 2) * 
             (feature.dimensions.perimeter || 100) / 4;
    default:
      return 500; // mm³
  }
}