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

  useEffect(() => {
    if (originalGeometry) {
      // Clone the original geometry as the starting point
      const clonedGeometry = originalGeometry.clone();
      setCurrentGeometry(clonedGeometry);
    }
  }, [originalGeometry]);

  useEffect(() => {
    if (!currentGeometry || !currentOperation) return;

    // Simulate material removal by scaling down certain regions
    // In a real implementation, this would use CSG operations
    const positions = currentGeometry.attributes.position.array;
    const originalPositions = originalGeometry?.attributes.position.array;
    
    if (originalPositions) {
      for (let i = 0; i < positions.length; i += 3) {
        const x = originalPositions[i];
        const y = originalPositions[i + 1];
        const z = originalPositions[i + 2];
        
        // Simple material removal simulation based on operation type and progress
        let removalFactor = 1;
        
        if (currentOperation.type === 'roughing') {
          // Remove material progressively from outside
          const distance = Math.sqrt(x * x + y * y);
          if (distance > 0.5 * (1 - removalProgress * 0.3)) {
            removalFactor = 0.7;
          }
        } else if (currentOperation.type === 'drilling') {
          // Remove material in cylindrical regions
          const distance = Math.sqrt(x * x + y * y);
          if (distance < 0.1 && z > -0.2 * removalProgress) {
            removalFactor = 0;
          }
        }
        
        (positions as Float32Array)[i] = x * removalFactor;
        (positions as Float32Array)[i + 1] = y * removalFactor;
        (positions as Float32Array)[i + 2] = z * removalFactor;
      }
      
      currentGeometry.attributes.position.needsUpdate = true;
      currentGeometry.computeVertexNormals();
    }
  }, [removalProgress, currentOperation, currentGeometry, originalGeometry]);

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

// Helper functions
function generateMockToolpath(operation: any): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  
  switch (operation.type) {
    case 'roughing':
      // Generate spiral toolpath for roughing
      for (let i = 0; i <= 100; i++) {
        const angle = (i / 100) * Math.PI * 8;
        const radius = 1 - (i / 100) * 0.8;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0.1 - (i / 100) * 0.2
        ));
      }
      break;
      
    case 'finishing':
      // Generate contour toolpath for finishing
      for (let i = 0; i <= 50; i++) {
        const angle = (i / 50) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(angle) * 0.9,
          Math.sin(angle) * 0.9,
          0
        ));
      }
      break;
      
    case 'drilling':
      // Generate vertical drilling path
      for (let i = 0; i <= 20; i++) {
        points.push(new THREE.Vector3(0, 0, 0.1 - (i / 20) * 0.3));
      }
      break;
      
    case 'chamfering':
      // Generate chamfer toolpath
      for (let i = 0; i <= 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.cos(angle) * 0.8,
          Math.sin(angle) * 0.8,
          0.05
        ));
      }
      break;
  }
  
  return points;
}

function getDurationForOperation(operation: any): number {
  switch (operation.type) {
    case 'roughing': return 5; // 5 seconds
    case 'finishing': return 3;
    case 'drilling': return 2;
    case 'chamfering': return 2;
    default: return 3;
  }
}