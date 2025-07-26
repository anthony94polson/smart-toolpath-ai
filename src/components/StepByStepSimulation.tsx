import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Pause, 
  RotateCcw, 
  Eye,
  Timer,
  Zap,
  Activity
} from 'lucide-react';
import { Operation, ToolpathSegment } from './ProductionToolpathGenerator';

interface StepByStepSimulationProps {
  operations: Operation[];
  originalGeometry?: THREE.BufferGeometry;
  onComplete?: () => void;
}

interface SimulationState {
  currentOperationIndex: number;
  currentSegmentIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  materialRemoved: number;
  totalTime: number;
}

// Tool visualization component
const CuttingTool: React.FC<{ 
  operation: Operation; 
  segmentIndex: number;
  progress: number;
  visible: boolean;
}> = ({ operation, segmentIndex, progress, visible }) => {
  const toolRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (!toolRef.current || !visible || !operation.toolpath[segmentIndex]) return;
    
    const segment = operation.toolpath[segmentIndex];
    const position = new THREE.Vector3().lerpVectors(
      segment.startPoint, 
      segment.endPoint, 
      progress
    );
    
    toolRef.current.position.copy(position);
    
    // Rotate tool for spindle effect
    if (operation.type !== 'drilling') {
      toolRef.current.rotation.z += 0.3;
    }
  });

  const { geometry, material } = useMemo(() => {
    const tool = operation.tool;
    let geom, mat;
    
    switch (tool.type) {
      case 'drill':
        geom = new THREE.ConeGeometry(tool.diameter / 2000, tool.length / 1000, 8);
        mat = new THREE.MeshStandardMaterial({ 
          color: '#ffd700', 
          metalness: 0.8, 
          roughness: 0.2 
        });
        break;
      case 'chamfer':
        geom = new THREE.ConeGeometry(tool.diameter / 2000, tool.length / 1000, 6);
        mat = new THREE.MeshStandardMaterial({ 
          color: '#ff6b35', 
          metalness: 0.7, 
          roughness: 0.3 
        });
        break;
      default: // endmill
        geom = new THREE.CylinderGeometry(tool.diameter / 2000, tool.diameter / 2000, tool.length / 1000, 12);
        mat = new THREE.MeshStandardMaterial({ 
          color: operation.type === 'roughing' ? '#e74c3c' : '#3498db', 
          metalness: 0.8, 
          roughness: 0.2 
        });
    }
    
    return { geometry: geom, material: mat };
  }, [operation.tool, operation.type]);

  if (!visible) return null;

  return (
    <group ref={toolRef}>
      <mesh geometry={geometry} material={material} />
      {/* Tool holder */}
      <mesh position={[0, 0, operation.tool.length / 2000]}>
        <cylinderGeometry args={[operation.tool.diameter / 1500, operation.tool.diameter / 1500, 0.02, 8]} />
        <meshStandardMaterial color="#2c3e50" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
};

// Enhanced workpiece with realistic material removal
const Workpiece: React.FC<{ 
  originalGeometry?: THREE.BufferGeometry;
  operations: Operation[];
  currentOperationIndex: number;
  currentSegmentIndex: number;
  progress: number;
}> = ({ originalGeometry, operations, currentOperationIndex, currentSegmentIndex, progress }) => {
  const workpieceRef = useRef<THREE.Mesh>(null);
  const [modifiedGeometry, setModifiedGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!originalGeometry) return;
    
    // Clone and modify geometry based on completed operations
    const newGeometry = originalGeometry.clone();
    
    // Apply material removal for completed operations
    for (let i = 0; i <= currentOperationIndex; i++) {
      const operation = operations[i];
      if (!operation) continue;
      
      const removalAmount = i < currentOperationIndex ? 1.0 : 
                           (currentSegmentIndex + progress) / operation.toolpath.length;
      
      // Apply material removal for this operation
      const positions = newGeometry.attributes.position.array as Float32Array;
      const feature = operation.feature;
      
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        const distance = Math.sqrt(
          Math.pow(x - feature.position.x / 1000, 2) + 
          Math.pow(y - feature.position.y / 1000, 2)
        );
        
        let shouldRemove = false;
        
        switch (feature.type) {
          case 'pocket':
            shouldRemove = distance < (feature.dimensions.width / 2000) && 
                          z > (feature.position.z - feature.dimensions.depth) / 1000;
            break;
          case 'hole':
            shouldRemove = distance < (feature.dimensions.diameter / 2000) && 
                          z > (feature.position.z - feature.dimensions.depth) / 1000;
            break;
          default:
            shouldRemove = distance < (operation.tool.diameter / 2000);
        }
        
        if (shouldRemove && Math.random() < removalAmount) {
          positions[i + 2] = -1000; // Move below visible area
        }
      }
      
      newGeometry.attributes.position.needsUpdate = true;
      newGeometry.computeVertexNormals();
    }
    
    setModifiedGeometry(newGeometry);
  }, [originalGeometry, operations, currentOperationIndex, currentSegmentIndex, progress]);


  if (!modifiedGeometry && !originalGeometry) {
    // Realistic stock material dimensions
    return (
      <mesh ref={workpieceRef}>
        <boxGeometry args={[0.06, 0.04, 0.02]} />
        <meshStandardMaterial 
          color="hsl(var(--muted))" 
          metalness={0.3} 
          roughness={0.7} 
        />
      </mesh>
    );
  }

  return (
    <mesh ref={workpieceRef} geometry={modifiedGeometry || originalGeometry}>
      <meshStandardMaterial 
        color="hsl(var(--muted))"
        metalness={0.3} 
        roughness={0.7} 
        transparent
        opacity={0.9}
      />
    </mesh>
  );
};

// Toolpath visualization with current segment highlighting
const ToolpathVisualization: React.FC<{ 
  operations: Operation[];
  currentOperationIndex: number;
  currentSegmentIndex: number;
  showCompleted: boolean;
  showCurrent: boolean;
  showUpcoming: boolean;
}> = ({ operations, currentOperationIndex, currentSegmentIndex, showCompleted, showCurrent, showUpcoming }) => {
  
  const createLineGeometry = (segments: ToolpathSegment[]) => {
    const points: THREE.Vector3[] = [];
    
    segments.forEach(segment => {
      points.push(segment.startPoint.clone().multiplyScalar(0.001)); // Convert mm to m
      points.push(segment.endPoint.clone().multiplyScalar(0.001));
    });
    
    return new THREE.BufferGeometry().setFromPoints(points);
  };

  const getOperationColor = (operation: Operation, alpha: number = 1) => {
    const colors = {
      'roughing': `rgba(231, 76, 60, ${alpha})`,
      'finishing': `rgba(52, 152, 219, ${alpha})`,
      'drilling': `rgba(46, 204, 113, ${alpha})`,
      'chamfering': `rgba(241, 196, 15, ${alpha})`
    };
    return colors[operation.type] || `rgba(149, 165, 166, ${alpha})`;
  };

  return (
    <>
      {operations.map((operation, opIndex) => {
        if (!operation.toolpath.length) return null;
        
        let visible = false;
        let alpha = 0.3;
        
        if (opIndex < currentOperationIndex && showCompleted) {
          visible = true;
          alpha = 0.6;
        } else if (opIndex === currentOperationIndex && showCurrent) {
          visible = true;
          alpha = 1.0;
        } else if (opIndex > currentOperationIndex && showUpcoming) {
          visible = true;
          alpha = 0.2;
        }
        
        if (!visible) return null;
        
        const geometry = createLineGeometry(operation.toolpath);
        const color = getOperationColor(operation, alpha);
        
        return (
          <primitive 
            key={`toolpath-${operation.id}`}
            object={new THREE.LineSegments(
              geometry,
              new THREE.LineBasicMaterial({ 
                color: color,
                transparent: true,
                opacity: alpha,
                linewidth: opIndex === currentOperationIndex ? 3 : 1
              })
            )}
          />
        );
      })}
    </>
  );
};

// Main simulation scene
const SimulationScene: React.FC<{
  operations: Operation[];
  state: SimulationState;
  originalGeometry?: THREE.BufferGeometry;
  toolpathVisibility: { completed: boolean; current: boolean; upcoming: boolean };
}> = ({ operations, state, originalGeometry, toolpathVisibility }) => {
  const [segmentProgress, setSegmentProgress] = useState(0);
  
  useFrame((frameState, delta) => {
    if (!state.isPlaying || !operations[state.currentOperationIndex]) return;
    
    const progressDelta = delta * state.playbackSpeed;
    setSegmentProgress(prev => Math.min(1, prev + progressDelta));
  });

  const currentOperation = operations[state.currentOperationIndex];
  
  return (
    <>
      <PerspectiveCamera makeDefault position={[0.2, 0.2, 0.2]} />
      <OrbitControls enablePan enableZoom enableRotate />
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[1, 1, 0.5]} intensity={0.8} castShadow />
      <pointLight position={[-1, -1, -0.5]} intensity={0.3} />
      
      {/* Environment */}
      <Environment preset="warehouse" />
      
      {/* Workpiece */}
      <Workpiece 
        originalGeometry={originalGeometry}
        operations={operations}
        currentOperationIndex={state.currentOperationIndex}
        currentSegmentIndex={state.currentSegmentIndex}
        progress={segmentProgress}
      />
      
      {/* Toolpath visualization */}
      <ToolpathVisualization 
        operations={operations}
        currentOperationIndex={state.currentOperationIndex}
        currentSegmentIndex={state.currentSegmentIndex}
        showCompleted={toolpathVisibility.completed}
        showCurrent={toolpathVisibility.current}
        showUpcoming={toolpathVisibility.upcoming}
      />
      
      {/* Current cutting tool */}
      {currentOperation && (
        <CuttingTool 
          operation={currentOperation}
          segmentIndex={state.currentSegmentIndex}
          progress={segmentProgress}
          visible={true}
        />
      )}
      
      {/* Grid for reference */}
      <gridHelper args={[0.2, 20]} />
      <axesHelper args={[0.05]} />
    </>
  );
};

export const StepByStepSimulation: React.FC<StepByStepSimulationProps> = ({
  operations,
  originalGeometry,
  onComplete
}) => {
  const [state, setState] = useState<SimulationState>({
    currentOperationIndex: 0,
    currentSegmentIndex: 0,
    isPlaying: false,
    playbackSpeed: 1,
    materialRemoved: 0,
    totalTime: 0
  });
  
  const [toolpathVisibility, setToolpathVisibility] = useState({
    completed: true,
    current: true,
    upcoming: false
  });

  const currentOperation = operations[state.currentOperationIndex];
  const totalOperations = operations.length;
  const operationProgress = currentOperation ? 
    (state.currentSegmentIndex / currentOperation.toolpath.length) * 100 : 0;

  const nextStep = () => {
    if (!currentOperation) return;
    
    if (state.currentSegmentIndex < currentOperation.toolpath.length - 1) {
      setState(prev => ({
        ...prev,
        currentSegmentIndex: prev.currentSegmentIndex + 1
      }));
    } else if (state.currentOperationIndex < operations.length - 1) {
      setState(prev => ({
        ...prev,
        currentOperationIndex: prev.currentOperationIndex + 1,
        currentSegmentIndex: 0
      }));
    } else {
      // Simulation complete
      onComplete?.();
    }
  };

  const prevStep = () => {
    if (state.currentSegmentIndex > 0) {
      setState(prev => ({
        ...prev,
        currentSegmentIndex: prev.currentSegmentIndex - 1
      }));
    } else if (state.currentOperationIndex > 0) {
      setState(prev => {
        const prevOp = operations[prev.currentOperationIndex - 1];
        return {
          ...prev,
          currentOperationIndex: prev.currentOperationIndex - 1,
          currentSegmentIndex: prevOp ? prevOp.toolpath.length - 1 : 0
        };
      });
    }
  };

  const reset = () => {
    setState(prev => ({
      ...prev,
      currentOperationIndex: 0,
      currentSegmentIndex: 0,
      isPlaying: false
    }));
  };

  const togglePlayback = () => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'roughing': return '🔨';
      case 'finishing': return '✨';
      case 'drilling': return '⚫';
      case 'chamfering': return '◣';
      default: return '🔧';
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* 3D Canvas */}
      <div className="flex-1 min-h-[500px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden">
        <Canvas shadows camera={{ position: [0.2, 0.2, 0.2] }}>
          <SimulationScene 
            operations={operations}
            state={state}
            originalGeometry={originalGeometry}
            toolpathVisibility={toolpathVisibility}
          />
        </Canvas>
      </div>
      
      {/* Controls and Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Step Controls */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Step Control
          </h3>
          
          <div className="flex items-center justify-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={prevStep}
              disabled={state.currentOperationIndex === 0 && state.currentSegmentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={togglePlayback}
            >
              {state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={nextStep}
              disabled={
                state.currentOperationIndex === operations.length - 1 && 
                currentOperation && 
                state.currentSegmentIndex >= currentOperation.toolpath.length - 1
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Operation:</span>
              <span>{state.currentOperationIndex + 1} / {totalOperations}</span>
            </div>
            <Progress value={(state.currentOperationIndex / totalOperations) * 100} className="h-2" />
            
            <div className="flex justify-between text-sm">
              <span>Step:</span>
              <span>{state.currentSegmentIndex + 1} / {currentOperation?.toolpath.length || 0}</span>
            </div>
            <Progress value={operationProgress} className="h-2" />
          </div>
        </Card>

        {/* Current Operation */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Current Operation
          </h3>
          
          {currentOperation ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getOperationIcon(currentOperation.type)}</span>
                <div>
                  <h4 className="font-medium">{currentOperation.name}</h4>
                  <p className="text-sm text-muted-foreground">{currentOperation.tool.id}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Feedrate:</span>
                  <p className="font-medium">{Math.round(currentOperation.parameters.feedrate)} mm/min</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Spindle:</span>
                  <p className="font-medium">{Math.round(currentOperation.parameters.spindleSpeed)} RPM</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Time:</span>
                  <p className="font-medium">{currentOperation.estimatedTime.toFixed(1)} min</p>
                </div>
                <div>
                  <span className="text-muted-foreground">MRR:</span>
                  <p className="font-medium">{currentOperation.materialRemovalRate.toFixed(1)} cm³/min</p>
                </div>
              </div>
              
              <Badge variant="outline" className="w-full justify-center">
                {currentOperation.feature.type.toUpperCase()} - 
                {Object.entries(currentOperation.feature.dimensions)
                  .map(([key, value]) => `${key}: ${value}mm`)
                  .join(', ')
                }
              </Badge>
            </div>
          ) : (
            <p className="text-muted-foreground">No operation selected</p>
          )}
        </Card>

        {/* Visualization Controls */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Visualization
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Completed Paths</span>
              <Button
                variant={toolpathVisibility.completed ? "default" : "outline"}
                size="sm"
                onClick={() => setToolpathVisibility(prev => ({
                  ...prev,
                  completed: !prev.completed
                }))}
              >
                {toolpathVisibility.completed ? "Hide" : "Show"}
              </Button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm">Current Path</span>
              <Button
                variant={toolpathVisibility.current ? "default" : "outline"}
                size="sm"
                onClick={() => setToolpathVisibility(prev => ({
                  ...prev,
                  current: !prev.current
                }))}
              >
                {toolpathVisibility.current ? "Hide" : "Show"}
              </Button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm">Upcoming Paths</span>
              <Button
                variant={toolpathVisibility.upcoming ? "default" : "outline"}
                size="sm"
                onClick={() => setToolpathVisibility(prev => ({
                  ...prev,
                  upcoming: !prev.upcoming
                }))}
              >
                {toolpathVisibility.upcoming ? "Hide" : "Show"}
              </Button>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">Playback Speed</span>
            </div>
            <div className="flex gap-1">
              {[0.5, 1, 2, 4].map(speed => (
                <Button
                  key={speed}
                  variant={state.playbackSpeed === speed ? "default" : "outline"}
                  size="sm"
                  onClick={() => setState(prev => ({ ...prev, playbackSpeed: speed }))}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};