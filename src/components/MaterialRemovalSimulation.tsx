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
  detectedFeatures?: any[];
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
  detectedFeatures,
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

  // Generate realistic toolpaths based on actual geometry and detected features
  const operationsWithToolpaths = useMemo(() => {
    return operations.map(op => ({
      ...op,
      toolpath: generateRealisticToolpath(op, originalGeometry, detectedFeatures),
      duration: getDurationForOperation(op)
    }));
  }, [operations, originalGeometry, detectedFeatures]);

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

// Enhanced toolpath generation based on real geometry and detected features
function generateRealisticToolpath(
  operation: any, 
  originalGeometry?: THREE.BufferGeometry, 
  detectedFeatures?: any[]
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const feature = operation.feature;
  const tool = operation.tool;
  
  if (!feature) {
    return generateFallbackToolpath(operation);
  }
  
  // Use actual STL bounding box for realistic scaling
  let scalingFactor = 1;
  if (originalGeometry) {
    originalGeometry.computeBoundingBox();
    const box = originalGeometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    // Scale toolpath to match actual part size
    scalingFactor = Math.max(size.x, size.y, size.z) / 100; // Normalize to reasonable scale
  }
  
  const featureCenter = new THREE.Vector3(
    (feature.position.x || 0) * scalingFactor,
    (feature.position.y || 0) * scalingFactor,
    (feature.position.z || 0) * scalingFactor
  );
  
  const toolDiameter = (tool?.diameter || 10) * scalingFactor;
  const safeHeight = 25 * scalingFactor; // mm above part
  const retractHeight = 5 * scalingFactor; // mm above part
  
  switch (operation.type) {
    case 'roughing':
      if (feature.type === 'pocket') {
        return generatePocketRoughingToolpath(feature, toolDiameter, safeHeight, retractHeight);
      }
      break;
      
    case 'finishing':
      if (feature.type === 'pocket') {
        return generatePocketFinishingToolpath(feature, toolDiameter, safeHeight, retractHeight);
      }
      break;
      
    case 'drilling':
      if (feature.type === 'hole') {
        return generateDrillingToolpath(feature, toolDiameter, safeHeight, retractHeight);
      }
      break;
      
    case 'chamfering':
      return generateChamferToolpath(feature, toolDiameter, safeHeight, retractHeight);
  }
  
  return generateFallbackToolpath(operation);
}

// Generate adaptive clearing toolpath for pocket roughing
function generatePocketRoughingToolpath(
  feature: any, 
  toolDiameter: number, 
  safeHeight: number, 
  retractHeight: number
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  
  // Use boundary vertices if available for more accurate toolpaths
  const width = feature.dimensions.width || 20;
  const length = feature.dimensions.length || 20;
  const depth = feature.dimensions.depth || 10;
  const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
  
  const stepover = toolDiameter * 0.6; // 60% stepover
  const stepdown = toolDiameter * 0.5; // 50% stepdown
  const numPasses = Math.ceil(depth / stepdown);
  
  // Rapid to safe position
  points.push(new THREE.Vector3(center.x, center.y, center.z + safeHeight));
  points.push(new THREE.Vector3(center.x, center.y, center.z + retractHeight));
  
  for (let pass = 0; pass < numPasses; pass++) {
    const currentDepth = Math.min((pass + 1) * stepdown, depth);
    const zLevel = center.z - currentDepth;
    
    // Plunge to depth
    if (pass === 0) {
      points.push(new THREE.Vector3(center.x, center.y, zLevel));
    }
    
    // Trochoidal milling pattern
    const maxRadius = Math.min(width, length) / 2 - toolDiameter / 2;
    const trochoidRadius = toolDiameter * 0.15;
    
    for (let angle = 0; angle < Math.PI * 6; angle += 0.3) {
      const spiralRadius = maxRadius * (1 - angle / (Math.PI * 6));
      const mainX = center.x + Math.cos(angle) * spiralRadius;
      const mainY = center.y + Math.sin(angle) * spiralRadius;
      
      // Add trochoidal motion
      const trochX = mainX + Math.cos(angle * 8) * trochoidRadius;
      const trochY = mainY + Math.sin(angle * 8) * trochoidRadius;
      
      points.push(new THREE.Vector3(trochX, trochY, zLevel));
    }
    
    // Move to next level if needed
    if (pass < numPasses - 1) {
      points.push(new THREE.Vector3(center.x, center.y, center.z + retractHeight));
    }
  }
  
  // Final retract
  points.push(new THREE.Vector3(center.x, center.y, center.z + safeHeight));
  
  return points;
}

// Generate contour finishing toolpath
function generatePocketFinishingToolpath(
  feature: any, 
  toolDiameter: number, 
  safeHeight: number, 
  retractHeight: number
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const width = feature.dimensions.width || 20;
  const length = feature.dimensions.length || 20;
  const depth = feature.dimensions.depth || 10;
  const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
  
  // Use boundary vertices if available
  let boundary: THREE.Vector3[] = [];
  if (feature.boundaryVertices && feature.boundaryVertices.length > 0) {
    boundary = feature.boundaryVertices.map((v: THREE.Vector3) => v.clone());
  } else {
    // Generate rectangular boundary
    const halfWidth = width / 2 - toolDiameter / 2;
    const halfLength = length / 2 - toolDiameter / 2;
    boundary = [
      new THREE.Vector3(center.x - halfWidth, center.y - halfLength, center.z),
      new THREE.Vector3(center.x + halfWidth, center.y - halfLength, center.z),
      new THREE.Vector3(center.x + halfWidth, center.y + halfLength, center.z),
      new THREE.Vector3(center.x - halfWidth, center.y + halfLength, center.z)
    ];
  }
  
  const finalDepth = center.z - depth;
  
  // Rapid to start
  points.push(new THREE.Vector3(boundary[0].x, boundary[0].y, center.z + safeHeight));
  points.push(new THREE.Vector3(boundary[0].x, boundary[0].y, center.z + retractHeight));
  
  // Plunge to depth
  points.push(new THREE.Vector3(boundary[0].x, boundary[0].y, finalDepth));
  
  // Follow boundary contour
  boundary.forEach(vertex => {
    points.push(new THREE.Vector3(vertex.x, vertex.y, finalDepth));
  });
  
  // Close the loop
  points.push(new THREE.Vector3(boundary[0].x, boundary[0].y, finalDepth));
  
  // Retract
  points.push(new THREE.Vector3(boundary[0].x, boundary[0].y, center.z + safeHeight));
  
  return points;
}

// Generate drilling toolpath with peck cycle
function generateDrillingToolpath(
  feature: any, 
  toolDiameter: number, 
  safeHeight: number, 
  retractHeight: number
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const diameter = feature.dimensions.diameter || toolDiameter;
  const depth = feature.dimensions.depth || diameter * 2;
  const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
  
  const peckDepth = Math.min(toolDiameter * 3, depth / 3); // Conservative peck depth
  const numPecks = Math.ceil(depth / peckDepth);
  
  // Rapid to position
  points.push(new THREE.Vector3(center.x, center.y, center.z + safeHeight));
  points.push(new THREE.Vector3(center.x, center.y, center.z + retractHeight));
  
  // Peck drilling cycle
  for (let peck = 0; peck < numPecks; peck++) {
    const targetDepth = Math.min((peck + 1) * peckDepth, depth);
    const drillZ = center.z - targetDepth;
    
    // Drill down
    points.push(new THREE.Vector3(center.x, center.y, drillZ));
    
    // Retract for chip evacuation (except on final peck)
    if (peck < numPecks - 1) {
      points.push(new THREE.Vector3(center.x, center.y, center.z + retractHeight));
    }
  }
  
  // Final retract
  points.push(new THREE.Vector3(center.x, center.y, center.z + safeHeight));
  
  return points;
}

// Generate chamfer toolpath
function generateChamferToolpath(
  feature: any, 
  toolDiameter: number, 
  safeHeight: number, 
  retractHeight: number
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const chamferWidth = feature.dimensions.width || 2;
  const diameter = feature.dimensions.diameter || 20;
  const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
  
  const radius = diameter / 2;
  const numPoints = 32;
  
  // Generate circular chamfer path
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    const z = center.z - chamferWidth;
    
    if (i === 0) {
      // Rapid to start
      points.push(new THREE.Vector3(x, y, center.z + safeHeight));
      points.push(new THREE.Vector3(x, y, center.z + retractHeight));
    }
    
    points.push(new THREE.Vector3(x, y, z));
  }
  
  // Retract
  const lastPoint = points[points.length - 1];
  points.push(new THREE.Vector3(lastPoint.x, lastPoint.y, center.z + safeHeight));
  
  return points;
}

// Simple fallback toolpath for when detailed geometry isn't available
function generateFallbackToolpath(operation: any): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const center = new THREE.Vector3(0, 0, 0);
  
  // Generate a basic spiral pattern
  const numPoints = 30;
  const maxRadius = 20;
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = t * Math.PI * 4; // 2 full rotations
    const radius = maxRadius * (1 - t); // Spiral inward
    
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    const z = center.z - t * 15; // Descend 15mm
    
    points.push(new THREE.Vector3(x, y, z));
  }
  
  return points;
}

// Calculate realistic duration for each operation based on actual geometry
function getDurationForOperation(operation: any): number {
  const feature = operation.feature;
  const tool = operation.tool;
  
  if (!feature) return 2;
  
  let duration = 0;
  const toolDiameter = tool?.diameter || 10;
  
  switch (operation.type) {
    case 'roughing':
      // Calculate based on material removal volume and rates
      const volume = calculateFeatureVolume(feature);
      const materialRemovalRate = 2.5; // cm³/min for aluminum
      const roughingEfficiency = 0.7; // Account for stepover/stepdown
      duration = (volume / materialRemovalRate) / roughingEfficiency;
      break;
      
    case 'finishing':
      // Based on cutting length and feedrate
      const perimeter = calculateFeaturePerimeter(feature);
      const finishingFeedrate = toolDiameter * 0.1; // mm/tooth * flutes * RPM
      const spindleSpeed = Math.min(3000, 150000 / toolDiameter);
      const actualFeedrate = finishingFeedrate * 2 * spindleSpeed; // 2 flutes
      duration = perimeter / actualFeedrate; // minutes
      break;
      
    case 'drilling':
      const diameter = feature.dimensions.diameter || toolDiameter;
      const depth = feature.dimensions.depth || diameter * 2;
      const drillingFeedrate = 0.05 * diameter; // mm/rev
      const drillSpindleSpeed = Math.min(2000, 100000 / diameter);
      const pecks = Math.ceil(depth / (diameter * 3)); // Peck drilling
      const totalDepth = depth * (1 + pecks * 0.3); // Account for retracts
      duration = totalDepth / (drillingFeedrate * drillSpindleSpeed / 60) + pecks * 0.1;
      break;
      
    case 'chamfering':
      const chamferLength = calculateFeaturePerimeter(feature);
      const chamferFeedrate = 500; // mm/min for chamfering
      duration = chamferLength / chamferFeedrate + 0.5; // Add setup time
      break;
      
    default:
      duration = 2;
  }
  
  // Add realistic overhead: tool approach, safety checks, etc.
  duration += 0.5;
  
  // Realistic operation time range: 0.5 to 25 minutes
  return Math.max(0.5, Math.min(25, duration));
}

// Enhanced volume calculation with realistic dimensions
function calculateFeatureVolume(feature: any): number {
  if (!feature || !feature.dimensions) return 1; // Default 1 cm³
  
  switch (feature.type) {
    case 'pocket':
      const width = feature.dimensions.width || 20;
      const length = feature.dimensions.length || 20;
      const depth = feature.dimensions.depth || 10;
      return (width * length * depth) / 1000; // mm³ to cm³
      
    case 'hole':
      const diameter = feature.dimensions.diameter || 10;
      const holeDepth = feature.dimensions.depth || diameter * 2.5;
      const radius = diameter / 2;
      return (Math.PI * radius * radius * holeDepth) / 1000;
      
    case 'slot':
      const slotLength = feature.dimensions.length || 30;
      const slotWidth = feature.dimensions.width || 10;
      const slotDepth = feature.dimensions.depth || 8;
      return (slotLength * slotWidth * slotDepth) / 1000;
      
    case 'step':
      const stepWidth = feature.dimensions.width || 25;
      const stepLength = feature.dimensions.length || 25;
      const stepDepth = feature.dimensions.depth || 5;
      return (stepWidth * stepLength * stepDepth) / 1000;
      
    case 'chamfer':
      // Chamfer volume is small - just the material removed
      const chamferSize = feature.dimensions.width || 2;
      const chamferPerimeter = calculateFeaturePerimeter(feature);
      return (chamferPerimeter * chamferSize * chamferSize * 0.5) / 1000;
      
    default:
      return 2; // Default 2 cm³
  }
}

// Enhanced perimeter calculation
function calculateFeaturePerimeter(feature: any): number {
  if (!feature || !feature.dimensions) return 50; // Default 50mm
  
  switch (feature.type) {
    case 'pocket':
      const width = feature.dimensions.width || 20;
      const length = feature.dimensions.length || 20;
      return 2 * (width + length);
      
    case 'hole':
      const diameter = feature.dimensions.diameter || 10;
      return Math.PI * diameter;
      
    case 'slot':
      const slotLength = feature.dimensions.length || 30;
      const slotWidth = feature.dimensions.width || 10;
      // Slot perimeter is 2 lengths + 2 semicircles (width)
      return 2 * slotLength + Math.PI * slotWidth;
      
    case 'step':
      const stepWidth = feature.dimensions.width || 25;
      const stepLength = feature.dimensions.length || 25;
      return 2 * (stepWidth + stepLength);
      
    case 'chamfer':
      // Assume chamfer around a circular or rectangular feature
      if (feature.dimensions.diameter) {
        return Math.PI * feature.dimensions.diameter;
      } else {
        const chamferWidth = feature.dimensions.width || 20;
        const chamferLength = feature.dimensions.length || chamferWidth;
        return 2 * (chamferWidth + chamferLength);
      }
      
    default:
      return 60; // Default perimeter
  }
}