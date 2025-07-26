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

// Enhanced tool component with realistic models
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
    
    // Position the tool (convert mm to m)
    const scaledPoint = currentPoint.clone().multiplyScalar(0.001);
    toolRef.current.position.copy(scaledPoint);
    
    // Orient the tool towards the next point
    const scaledNext = nextPoint.clone().multiplyScalar(0.001);
    const direction = new THREE.Vector3().subVectors(scaledNext, scaledPoint).normalize();
    if (direction.length() > 0) {
      toolRef.current.lookAt(scaledPoint.clone().add(direction));
    }
    
    // Rotate the tool to simulate spinning
    toolRef.current.rotation.z += 0.3;
  });

  const { toolGeometry, toolMaterial } = useMemo(() => {
    const toolDiameter = (operation.tool?.diameter || 10) / 1000; // Convert mm to m
    const toolLength = (operation.tool?.length || 50) / 1000;
    
    let geometry, material;
    
    switch (operation.type) {
      case 'drilling':
        geometry = <coneGeometry args={[toolDiameter/2, toolLength, 8]} />;
        material = <meshStandardMaterial color="#ffd700" metalness={0.9} roughness={0.1} />;
        break;
      case 'chamfering':
        geometry = <coneGeometry args={[toolDiameter/2, toolLength, 6]} />;
        material = <meshStandardMaterial color="#ff6b35" metalness={0.8} roughness={0.2} />;
        break;
      case 'finishing':
        geometry = <cylinderGeometry args={[toolDiameter/2, toolDiameter/2, toolLength, 12]} />;
        material = <meshStandardMaterial color="#3498db" metalness={0.8} roughness={0.2} />;
        break;
      default: // roughing
        geometry = <cylinderGeometry args={[toolDiameter/2, toolDiameter/2, toolLength, 8]} />;
        material = <meshStandardMaterial color="#e74c3c" metalness={0.8} roughness={0.2} />;
    }
    
    return { toolGeometry: geometry, toolMaterial: material };
  }, [operation.type, operation.tool]);

  if (!isActive) return null;

  return (
    <group ref={toolRef}>
      <mesh>
        {toolGeometry}
        {toolMaterial}
      </mesh>
      {/* Tool holder */}
      <mesh position={[0, 0, (operation.tool?.length || 50) / 2000]}>
        <cylinderGeometry args={[(operation.tool?.diameter || 10) / 1500, (operation.tool?.diameter || 10) / 1500, 0.02, 8]} />
        <meshStandardMaterial color="#2c3e50" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
};

// Stock material component that shows progressive removal to reveal final part
const StockMaterial: React.FC<{ 
  stockGeometry?: THREE.BufferGeometry; 
  operations: Operation[];
  currentOperationIndex: number;
  operationProgress: number;
}> = ({ stockGeometry, operations, currentOperationIndex, operationProgress }) => {
  const stockRef = useRef<THREE.Mesh>(null);
  const [currentGeometry, setCurrentGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!stockGeometry) return;

    // Start with full stock geometry
    const newGeometry = stockGeometry.clone();
    const positions = newGeometry.attributes.position.array as Float32Array;
    
    // Apply progressive material removal for all completed operations
    for (let opIndex = 0; opIndex <= currentOperationIndex; opIndex++) {
      const operation = operations[opIndex];
      if (!operation) continue;
      
      // Calculate removal progress for this operation
      const removalAmount = opIndex < currentOperationIndex ? 1.0 : operationProgress;
      
      // Apply material removal based on toolpath
      operation.toolpath.forEach((toolPoint, pointIndex) => {
        const toolPos = toolPoint.clone().multiplyScalar(0.001); // Convert mm to m
        const toolRadius = (operation.tool?.diameter || 10) / 2000; // mm to m
        const currentProgress = pointIndex / operation.toolpath.length;
        
        if (currentProgress <= removalAmount) {
          // Remove material around this tool position
          for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            
            const vertex = new THREE.Vector3(x, y, z);
            const distance = vertex.distanceTo(toolPos);
            
            if (distance <= toolRadius) {
              // Move vertex out of view to simulate removal
              positions[i + 2] = -1000;
            }
          }
        }
      });
    }
    
    newGeometry.attributes.position.needsUpdate = true;
    newGeometry.computeVertexNormals();
    
    setCurrentGeometry(newGeometry);
  }, [stockGeometry, operations, currentOperationIndex, operationProgress]);

  if (!currentGeometry && !stockGeometry) {
    // Default stock block
    return (
      <mesh ref={stockRef}>
        <boxGeometry args={[0.08, 0.06, 0.04]} />
        <meshStandardMaterial 
          color="#a0a0a0" 
          metalness={0.3} 
          roughness={0.8} 
        />
      </mesh>
    );
  }

  return (
    <mesh ref={stockRef} geometry={currentGeometry || stockGeometry}>
      <meshStandardMaterial 
        color="#a0a0a0"
        metalness={0.3} 
        roughness={0.8} 
      />
    </mesh>
  );
};

// Enhanced toolpath visualization with better rendering
const ToolpathVisualization: React.FC<{ 
  operations: Operation[]; 
  currentOperationIndex: number;
  progress: number;
}> = ({ operations, currentOperationIndex, progress }) => {
  return (
    <>
      {operations.map((operation, index) => {
        if (operation.toolpath.length === 0) return null;

        // Convert toolpath points from mm to m
        const points = operation.toolpath.map(point => point.clone().multiplyScalar(0.001));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        const isCurrentOperation = index === currentOperationIndex;
        const isCompleted = index < currentOperationIndex;
        
        let color = '#6b7280'; // Default gray
        let opacity = 0.2;
        let lineWidth = 1;
        
        if (isCompleted) {
          opacity = 0.6;
          lineWidth = 2;
          switch (operation.type) {
            case 'roughing': color = '#ef4444'; break;
            case 'finishing': color = '#3b82f6'; break;
            case 'drilling': color = '#10b981'; break;
            case 'chamfering': color = '#f59e0b'; break;
          }
        } else if (isCurrentOperation) {
          opacity = 1.0;
          lineWidth = 3;
          switch (operation.type) {
            case 'roughing': color = '#ef4444'; break;
            case 'finishing': color = '#3b82f6'; break;
            case 'drilling': color = '#10b981'; break;
            case 'chamfering': color = '#f59e0b'; break;
          }
        }

        return (
          <primitive 
            key={operation.id} 
            object={new THREE.Line(
              geometry, 
              new THREE.LineBasicMaterial({ 
                color: color, 
                transparent: true, 
                opacity: opacity,
                linewidth: lineWidth
              })
            )} 
          />
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
  stockGeometry?: THREE.BufferGeometry;
}> = ({ operations, isPlaying, speed, onProgress, originalGeometry, stockGeometry }) => {
  const [globalProgress, setGlobalProgress] = useState(0);
  const [currentOperationIndex, setCurrentOperationIndex] = useState(0);
  const [operationProgress, setOperationProgress] = useState(0);

  useFrame((state, delta) => {
    if (!isPlaying || operations.length === 0) return;

    const progressDelta = (delta * speed) / (operations[currentOperationIndex]?.duration || 1);
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
      <PerspectiveCamera makeDefault position={[0.15, 0.15, 0.15]} />
      <OrbitControls enablePan enableZoom enableRotate />
      
      {/* Enhanced lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={0.7} castShadow />
      <directionalLight position={[-5, 5, 5]} intensity={0.4} />
      <pointLight position={[-10, -10, -5]} intensity={0.2} />
      
      {/* Environment */}
      <Environment preset="warehouse" />
      
      {/* Stock material with progressive removal */}
      <StockMaterial 
        stockGeometry={stockGeometry}
        operations={operations}
        currentOperationIndex={currentOperationIndex}
        operationProgress={operationProgress}
      />
      
      {/* Final part visualization (wireframe) */}
      {originalGeometry && (
        <mesh geometry={originalGeometry}>
          <meshStandardMaterial 
            color="hsl(var(--primary))" 
            transparent 
            opacity={0.3}
            wireframe
          />
        </mesh>
      )}
      
      {/* Enhanced toolpath visualization */}
      <ToolpathVisualization 
        operations={operations}
        currentOperationIndex={currentOperationIndex}
        progress={operationProgress}
      />
      
      {/* Current cutting tool with realistic model */}
      {operations[currentOperationIndex] && (
        <CuttingTool 
          operation={operations[currentOperationIndex]}
          progress={operationProgress}
          isActive={isPlaying}
        />
      )}
      
      {/* Reference grid */}
      <gridHelper args={[0.2, 20]} />
      <axesHelper args={[0.05]} />
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
  const [stockGeometry, setStockGeometry] = useState<THREE.BufferGeometry | null>(null);

  // Generate stock from bounding box
  useEffect(() => {
    if (originalGeometry) {
      originalGeometry.computeBoundingBox();
      const box = originalGeometry.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      
      // Add stock allowance (10% extra material)
      const stockSize = size.clone().multiplyScalar(1.1);
      const stockGeometry = new THREE.BoxGeometry(stockSize.x, stockSize.y, stockSize.z);
      
      // Position stock to contain the original geometry
      const center = new THREE.Vector3();
      box.getCenter(center);
      stockGeometry.translate(center.x, center.y, center.z);
      
      setStockGeometry(stockGeometry);
    }
  }, [originalGeometry]);

  // Generate realistic toolpaths based on actual geometry
  const operationsWithToolpaths = useMemo(() => {
    return operations.map(op => ({
      ...op,
      toolpath: generateRealisticToolpath(op, originalGeometry),
      duration: getDurationForOperation(op)
    }));
  }, [operations, originalGeometry]);

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
      <div className="flex-1 min-h-[500px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden">
        <Canvas shadows>
          <SimulationScene 
            operations={operationsWithToolpaths}
            isPlaying={isPlaying}
            speed={speed[0]}
            onProgress={handleProgress}
            originalGeometry={originalGeometry}
            stockGeometry={stockGeometry}
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
                max={5}
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
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Estimated Time: {operationsWithToolpaths.reduce((sum, op) => sum + op.duration, 0).toFixed(1)} min</span>
            <span>Current Tool: {operationsWithToolpaths[currentOperationIndex]?.tool?.type || 'None'}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Enhanced toolpath generation based on real geometry
function generateRealisticToolpath(operation: any, originalGeometry?: THREE.BufferGeometry): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const feature = operation.feature;
  
  if (!feature.boundaryVertices || feature.boundaryVertices.length === 0) {
    return generateFallbackToolpath(operation);
  }
  
  // Use actual feature geometry for toolpath generation
  const featureCenter = new THREE.Vector3(
    feature.position.x,
    feature.position.y,
    feature.position.z
  );
  
  switch (operation.type) {
    case 'roughing':
      // Adaptive clearing based on actual feature boundary
      if (feature.type === 'pocket') {
        const stepover = (operation.tool?.diameter || 10) * 0.7; // 70% stepover
        const depth = feature.dimensions.depth || 5;
        
        // Generate zigzag pattern within boundary
        const bounds = calculateFeatureBounds(feature.boundaryVertices);
        
        for (let z = featureCenter.z; z >= featureCenter.z - depth; z -= 2) {
          for (let y = bounds.min.y; y <= bounds.max.y; y += stepover) {
            const direction = Math.floor((y - bounds.min.y) / stepover) % 2 === 0 ? 1 : -1;
            const startX = direction > 0 ? bounds.min.x : bounds.max.x;
            const endX = direction > 0 ? bounds.max.x : bounds.min.x;
            
            for (let x = startX; direction > 0 ? x <= endX : x >= endX; x += direction * stepover/3) {
              if (isPointInFeature(new THREE.Vector3(x, y, z), feature)) {
                points.push(new THREE.Vector3(x, y, z));
              }
            }
          }
        }
      }
      break;
      
    case 'finishing':
      // Contour finishing around feature boundary
      if (feature.boundaryVertices) {
        const finishAllowance = 0.5; // 0.5mm finish allowance
        const offsetBoundary = offsetBoundary2D(feature.boundaryVertices, -finishAllowance);
        
        offsetBoundary.forEach(vertex => {
          points.push(vertex.clone());
        });
      }
      break;
      
    case 'drilling':
      // Realistic drilling cycle
      if (feature.type === 'hole') {
        const depth = feature.dimensions.depth || 10;
        const peckDepth = Math.min(depth / 3, 5); // Peck drilling
        
        // Rapid to start position
        points.push(new THREE.Vector3(featureCenter.x, featureCenter.y, featureCenter.z + 5));
        
        // Drilling cycle with pecks
        for (let currentDepth = 0; currentDepth < depth; currentDepth += peckDepth) {
          const targetZ = featureCenter.z - Math.min(currentDepth + peckDepth, depth);
          points.push(new THREE.Vector3(featureCenter.x, featureCenter.y, targetZ));
          
          // Retract for chip removal
          if (currentDepth + peckDepth < depth) {
            points.push(new THREE.Vector3(featureCenter.x, featureCenter.y, featureCenter.z + 2));
          }
        }
        
        // Final retract
        points.push(new THREE.Vector3(featureCenter.x, featureCenter.y, featureCenter.z + 10));
      }
      break;
      
    case 'chamfering':
      // Chamfer around edges
      if (feature.boundaryVertices) {
        feature.boundaryVertices.forEach(vertex => {
          points.push(vertex.clone());
        });
      }
      break;
  }
  
  return points.length > 0 ? points : generateFallbackToolpath(operation);
}

function generateFallbackToolpath(operation: any): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const feature = operation.feature;
  const featurePos = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
  
  // Simple fallback patterns
  switch (operation.type) {
    case 'drilling':
      points.push(
        new THREE.Vector3(featurePos.x, featurePos.y, featurePos.z + 5),
        new THREE.Vector3(featurePos.x, featurePos.y, featurePos.z - (feature.dimensions.depth || 10)),
        new THREE.Vector3(featurePos.x, featurePos.y, featurePos.z + 5)
      );
      break;
    default:
      // Simple rectangular pattern
      const size = (feature.dimensions.width || 20) / 2;
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        points.push(new THREE.Vector3(
          featurePos.x + Math.cos(angle) * size,
          featurePos.y + Math.sin(angle) * size,
          featurePos.z - 2
        ));
      }
  }
  
  return points;
}

function getDurationForOperation(operation: any): number {
  const feature = operation.feature;
  const volume = calculateFeatureVolume(feature);
  
  // Realistic material removal rates (mm³/min)
  const materialRemovalRates = {
    'roughing': 800,    // High removal rate
    'finishing': 200,   // Lower removal rate for quality
    'drilling': 300,    // Moderate rate
    'chamfering': 150   // Slow for precision
  };
  
  const rate = materialRemovalRates[operation.type] || 400;
  const baseMachiningTime = volume / rate;
  
  // Add realistic factors
  const setupTime = 3; // 3 minutes setup per operation
  const toolChangeTime = 1.5; // Tool change time
  const safetyMargin = 1.8; // 80% extra time for safety
  const rapidTraverseTime = 0.5; // Time for rapid moves
  
  return (baseMachiningTime + setupTime + toolChangeTime + rapidTraverseTime) * safetyMargin;
}

function calculateFeatureVolume(feature: any): number {
  switch (feature.type) {
    case 'hole':
      const radius = (feature.dimensions.diameter || 6) / 2;
      const depth = feature.dimensions.depth || 10;
      return Math.PI * radius * radius * depth;
    case 'pocket':
      return (feature.dimensions.width || 20) * 
             (feature.dimensions.length || 20) * 
             (feature.dimensions.depth || 5);
    case 'slot':
      return (feature.dimensions.width || 10) * 
             (feature.dimensions.length || 30) * 
             (feature.dimensions.depth || 5);
    default:
      return 1000; // Default volume
  }
}

// Helper functions for advanced toolpath generation
function calculateFeatureBounds(vertices: THREE.Vector3[]) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  
  vertices.forEach(vertex => {
    min.min(vertex);
    max.max(vertex);
  });
  
  return { min, max };
}

function isPointInFeature(point: THREE.Vector3, feature: any): boolean {
  // Simple point-in-polygon test (2D projection)
  const featureCenter = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
  const distance = point.distanceTo(featureCenter);
  const maxDistance = Math.max(feature.dimensions.width || 20, feature.dimensions.length || 20) / 2;
  
  return distance <= maxDistance;
}

function offsetBoundary2D(vertices: THREE.Vector3[], offset: number): THREE.Vector3[] {
  // Simple offset implementation - in production, use proper offset algorithms
  const center = vertices.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vertices.length);
  
  return vertices.map(vertex => {
    const direction = new THREE.Vector3().subVectors(vertex, center).normalize();
    return vertex.clone().add(direction.multiplyScalar(offset));
  });
}