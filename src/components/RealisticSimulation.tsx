import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, RotateCcw, FastForward, Eye, EyeOff } from 'lucide-react';
import { MachiningOperation } from './ProfessionalToolpathGenerator';

interface RealisticSimulationProps {
  operations: MachiningOperation[];
  originalGeometry?: THREE.BufferGeometry;
  onSimulationComplete?: () => void;
}

interface SimulationState {
  isPlaying: boolean;
  speed: number;
  progress: number;
  currentOperationIndex: number;
  operationProgress: number;
  showToolpath: boolean;
  showTool: boolean;
  showChips: boolean;
}

// Enhanced tool component with accurate geometry and motion
const CuttingTool: React.FC<{ 
  operation: MachiningOperation; 
  progress: number; 
  isActive: boolean;
  showTool: boolean;
}> = ({ operation, progress, isActive, showTool }) => {
  const toolRef = useRef<THREE.Group>(null);
  const toolHolderRef = useRef<THREE.Mesh>(null);
  const [currentPosition, setCurrentPosition] = useState(new THREE.Vector3());

  useFrame(() => {
    if (!toolRef.current || !isActive || operation.toolpath.length === 0) return;
    
    const segmentIndex = Math.floor(progress * operation.toolpath.length);
    const segment = operation.toolpath[segmentIndex];
    
    if (segment) {
      const segmentProgress = (progress * operation.toolpath.length) % 1;
      const position = new THREE.Vector3().lerpVectors(
        segment.startPoint,
        segment.endPoint,
        segmentProgress
      );
      
      // Convert from mm to meters for visualization
      const scaledPosition = position.clone().multiplyScalar(0.001);
      toolRef.current.position.copy(scaledPosition);
      setCurrentPosition(scaledPosition);
      
      // Tool orientation based on cutting direction
      const direction = new THREE.Vector3().subVectors(segment.endPoint, segment.startPoint).normalize();
      if (direction.length() > 0) {
        toolRef.current.lookAt(scaledPosition.clone().add(direction));
      }
      
      // Realistic spindle rotation
      const rpm = operation.parameters.spindleSpeed;
      const rotationSpeed = (rpm / 60) * 2 * Math.PI; // rad/s
      toolRef.current.rotateZ(rotationSpeed * 0.016); // 60fps assumption
    }
  });

  const toolGeometry = useMemo(() => {
    const tool = operation.tool;
    const diameter = tool.diameter / 1000; // Convert mm to m
    const length = tool.length / 1000;
    
    switch (tool.type) {
      case 'drill':
        return (
          <>
            {/* Drill point */}
            <mesh position={[0, 0, -length/2]}>
              <coneGeometry args={[diameter/2, length*0.3, 12]} />
              <meshStandardMaterial 
                color="#FFD700" 
                metalness={0.9} 
                roughness={0.1}
                emissive="#444400"
                emissiveIntensity={0.1}
              />
            </mesh>
            {/* Drill body */}
            <mesh position={[0, 0, -length*0.15]}>
              <cylinderGeometry args={[diameter/2, diameter/2, length*0.7, 16]} />
              <meshStandardMaterial 
                color="#C0C0C0" 
                metalness={0.9} 
                roughness={0.1}
              />
            </mesh>
          </>
        );
      
      case 'endmill':
        return (
          <>
            {/* End mill cutting edge */}
            <mesh position={[0, 0, -length/2]}>
              <cylinderGeometry args={[diameter/2, diameter/2, length*0.6, 16]} />
              <meshStandardMaterial 
                color="#4169E1" 
                metalness={0.8} 
                roughness={0.2}
                emissive="#000044"
                emissiveIntensity={0.1}
              />
            </mesh>
            {/* Tool shank */}
            <mesh position={[0, 0, length*0.1]}>
              <cylinderGeometry args={[diameter/2*1.2, diameter/2*1.2, length*0.4, 12]} />
              <meshStandardMaterial 
                color="#808080" 
                metalness={0.9} 
                roughness={0.1}
              />
            </mesh>
          </>
        );
      
      case 'chamfer_mill':
        return (
          <>
            {/* Chamfer mill cutting edge */}
            <mesh position={[0, 0, -length/2]}>
              <coneGeometry args={[diameter/2, length*0.5, 8]} />
              <meshStandardMaterial 
                color="#FF6B35" 
                metalness={0.8} 
                roughness={0.2}
                emissive="#440000"
                emissiveIntensity={0.1}
              />
            </mesh>
          </>
        );
      
      default:
        return (
          <mesh position={[0, 0, -length/2]}>
            <cylinderGeometry args={[diameter/2, diameter/2, length, 12]} />
            <meshStandardMaterial color="#888888" metalness={0.7} roughness={0.3} />
          </mesh>
        );
    }
  }, [operation.tool]);

  if (!showTool || !isActive) return null;

  return (
    <group ref={toolRef}>
      {toolGeometry}
      
      {/* Tool holder */}
      <mesh ref={toolHolderRef} position={[0, 0, operation.tool.length / 2000]}>
        <cylinderGeometry args={[operation.tool.diameter / 1500, operation.tool.diameter / 1500, 0.03, 12]} />
        <meshStandardMaterial 
          color="#2C3E50" 
          metalness={0.9} 
          roughness={0.1} 
        />
      </mesh>
      
      {/* Tool info tooltip */}
      <Html position={[0, 0, 0.05]} style={{ pointerEvents: 'none' }}>
        <div className="bg-black/80 text-white text-xs p-2 rounded whitespace-nowrap">
          <div>{operation.tool.id}</div>
          <div>Ø{operation.tool.diameter}mm</div>
          <div>{operation.parameters.spindleSpeed} RPM</div>
          <div>{operation.parameters.feedrate} mm/min</div>
        </div>
      </Html>
    </group>
  );
};

// Progressive stock material removal with realistic visualization
const StockMaterial: React.FC<{ 
  originalGeometry?: THREE.BufferGeometry;
  operations: MachiningOperation[];
  currentOperationIndex: number;
  operationProgress: number;
}> = ({ originalGeometry, operations, currentOperationIndex, operationProgress }) => {
  const [stockGeometry, setStockGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [stockMaterial, setStockMaterial] = useState<THREE.Material | null>(null);

  // Generate stock block from original geometry
  useEffect(() => {
    if (!originalGeometry) {
      // Default stock block
      const defaultStock = new THREE.BoxGeometry(0.1, 0.08, 0.05);
      setStockGeometry(defaultStock);
      return;
    }

    originalGeometry.computeBoundingBox();
    const bbox = originalGeometry.boundingBox!;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Add 10% stock allowance
    const stockSize = size.clone().multiplyScalar(1.1);
    const stockBlock = new THREE.BoxGeometry(stockSize.x, stockSize.y, stockSize.z);
    
    // Position relative to original part
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    stockBlock.translate(center.x, center.y, center.z + stockSize.z * 0.05);
    
    setStockGeometry(stockBlock);
  }, [originalGeometry]);

  // Create material with realistic appearance
  useEffect(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#B0B0B0',
      metalness: 0.4,
      roughness: 0.6,
      transparent: false,
      opacity: 1,
    });
    setStockMaterial(material);
  }, []);

  // Apply progressive material removal
  useEffect(() => {
    if (!stockGeometry || !operations.length) return;

    // Create modified geometry for current machining state
    const modifiedGeometry = stockGeometry.clone();
    const positions = modifiedGeometry.attributes.position.array as Float32Array;
    
    // Apply material removal for completed operations
    for (let opIndex = 0; opIndex <= currentOperationIndex; opIndex++) {
      const operation = operations[opIndex];
      if (!operation || !operation.toolpath.length) continue;
      
      const removalProgress = opIndex < currentOperationIndex ? 1.0 : operationProgress;
      const toolRadius = operation.tool.diameter / 2000; // Convert mm to m
      
      // Apply removal based on toolpath
      const toolpathLength = operation.toolpath.length;
      const segmentsToProcess = Math.floor(toolpathLength * removalProgress);
      
      for (let segIndex = 0; segIndex < segmentsToProcess; segIndex++) {
        const segment = operation.toolpath[segIndex];
        if (!segment) continue;
        
        const toolPos = segment.startPoint.clone().multiplyScalar(0.001); // mm to m
        
        // Remove material around tool position
        for (let i = 0; i < positions.length; i += 3) {
          const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
          const distance = vertex.distanceTo(toolPos);
          
          if (distance <= toolRadius) {
            // For material removal, we displace vertices downward/inward
            const displacement = toolRadius - distance;
            const direction = new THREE.Vector3().subVectors(vertex, toolPos).normalize();
            
            // Apply different removal strategies based on operation type
            switch (operation.type) {
              case 'drilling':
                if (Math.abs(vertex.z - toolPos.z) < toolRadius) {
                  positions[i + 2] = Math.min(positions[i + 2], toolPos.z - toolRadius * 0.5);
                }
                break;
              
              case 'roughing':
                vertex.add(direction.multiplyScalar(displacement * 0.3));
                positions[i] = vertex.x;
                positions[i + 1] = vertex.y;
                positions[i + 2] = vertex.z;
                break;
              
              case 'finishing':
                vertex.add(direction.multiplyScalar(displacement * 0.1));
                positions[i] = vertex.x;
                positions[i + 1] = vertex.y;
                positions[i + 2] = vertex.z;
                break;
            }
          }
        }
      }
    }
    
    modifiedGeometry.attributes.position.needsUpdate = true;
    modifiedGeometry.computeVertexNormals();
    setStockGeometry(modifiedGeometry);
  }, [currentOperationIndex, operationProgress, operations]);

  if (!stockGeometry || !stockMaterial) return null;

  return (
    <>
      {/* Stock material */}
      <mesh geometry={stockGeometry} material={stockMaterial} castShadow receiveShadow />
      
      {/* Original part wireframe for reference */}
      {originalGeometry && (
        <mesh geometry={originalGeometry}>
          <meshBasicMaterial 
            color="hsl(var(--primary))" 
            wireframe 
            transparent 
            opacity={0.3}
          />
        </mesh>
      )}
    </>
  );
};

// Enhanced toolpath visualization with realistic appearance
const ToolpathVisualization: React.FC<{
  operations: MachiningOperation[];
  currentOperationIndex: number;
  operationProgress: number;
  showToolpath: boolean;
}> = ({ operations, currentOperationIndex, operationProgress, showToolpath }) => {
  const toolpathRefs = useRef<THREE.Line[]>([]);

  const toolpathLines = useMemo(() => {
    return operations.map((operation, opIndex) => {
      if (!operation.toolpath.length) return null;

      // Convert toolpath segments to points
      const points: THREE.Vector3[] = [];
      operation.toolpath.forEach(segment => {
        points.push(segment.startPoint.clone().multiplyScalar(0.001)); // mm to m
        points.push(segment.endPoint.clone().multiplyScalar(0.001));
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      
      // Color based on operation type and status
      let color = '#666666';
      let opacity = 0.3;
      let lineWidth = 1;
      
      const isCompleted = opIndex < currentOperationIndex;
      const isCurrent = opIndex === currentOperationIndex;
      const isUpcoming = opIndex > currentOperationIndex;

      if (isCompleted) {
        opacity = 0.8;
        lineWidth = 2;
        switch (operation.type) {
          case 'drilling': color = '#10B981'; break;
          case 'roughing': color = '#EF4444'; break;
          case 'finishing': color = '#3B82F6'; break;
          case 'chamfering': color = '#F59E0B'; break;
          default: color = '#6B7280';
        }
      } else if (isCurrent) {
        opacity = 1.0;
        lineWidth = 3;
        switch (operation.type) {
          case 'drilling': color = '#059669'; break;
          case 'roughing': color = '#DC2626'; break;
          case 'finishing': color = '#2563EB'; break;
          case 'chamfering': color = '#D97706'; break;
          default: color = '#374151';
        }
      }

      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        linewidth: lineWidth
      });

      return new THREE.Line(geometry, material);
    });
  }, [operations, currentOperationIndex]);

  if (!showToolpath) return null;

  return (
    <>
      {toolpathLines.map((line, index) => 
        line ? <primitive key={`toolpath-${index}`} object={line} /> : null
      )}
    </>
  );
};

// Chips and debris simulation for realism
const MachiningChips: React.FC<{
  operation: MachiningOperation;
  toolPosition: THREE.Vector3;
  isActive: boolean;
  showChips: boolean;
}> = ({ operation, toolPosition, isActive, showChips }) => {
  const chipsRef = useRef<THREE.InstancedMesh>(null);
  const [chipPositions, setChipPositions] = useState<THREE.Vector3[]>([]);

  useFrame(() => {
    if (!isActive || !showChips || !chipsRef.current) return;

    // Generate new chips based on material removal rate
    const mrr = operation.materialRemovalRate;
    const chipRate = mrr * 0.1; // Simplified chip generation rate
    
    if (Math.random() < chipRate / 60) { // 60fps
      const newChip = toolPosition.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01,
          Math.random() * 0.005
        )
      );
      
      setChipPositions(prev => [...prev.slice(-50), newChip]); // Keep last 50 chips
    }

    // Update chip positions (gravity + air resistance)
    setChipPositions(prev => 
      prev.map(pos => {
        pos.z -= 0.0001; // Gravity
        pos.x += (Math.random() - 0.5) * 0.0001; // Air turbulence
        pos.y += (Math.random() - 0.5) * 0.0001;
        return pos;
      }).filter(pos => pos.z > -0.05) // Remove chips that fall too far
    );
  });

  if (!showChips || !isActive) return null;

  return (
    <group>
      {chipPositions.map((pos, index) => (
        <mesh key={index} position={pos}>
          <sphereGeometry args={[0.0002, 4, 4]} />
          <meshBasicMaterial color="#FFD700" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
};

// Main simulation scene component
const SimulationScene: React.FC<{
  operations: MachiningOperation[];
  originalGeometry?: THREE.BufferGeometry;
  state: SimulationState;
  onStateChange: (newState: Partial<SimulationState>) => void;
}> = ({ operations, originalGeometry, state, onStateChange }) => {
  useFrame((_, delta) => {
    if (!state.isPlaying || !operations.length) return;

    const currentOp = operations[state.currentOperationIndex];
    if (!currentOp) return;

    const timeScale = state.speed;
    const operationDuration = currentOp.estimatedTime * 60; // Convert minutes to seconds
    const progressDelta = (delta * timeScale) / operationDuration;

    let newOperationProgress = state.operationProgress + progressDelta;
    let newOperationIndex = state.currentOperationIndex;

    if (newOperationProgress >= 1) {
      newOperationProgress = 0;
      newOperationIndex++;
      
      if (newOperationIndex >= operations.length) {
        newOperationIndex = operations.length - 1;
        newOperationProgress = 1;
        onStateChange({ isPlaying: false });
      }
    }

    const globalProgress = (newOperationIndex + newOperationProgress) / operations.length;
    
    onStateChange({
      operationProgress: newOperationProgress,
      currentOperationIndex: newOperationIndex,
      progress: globalProgress
    });
  });

  return (
    <>
      {/* Camera and controls */}
      <PerspectiveCamera makeDefault position={[0.15, 0.15, 0.15]} />
      <OrbitControls enablePan enableZoom enableRotate />
      
      {/* Enhanced lighting setup */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={1.0} 
        castShadow 
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-5, 5, 5]} intensity={0.5} />
      <pointLight position={[0, 0, 10]} intensity={0.3} />
      
      {/* Environment */}
      <Environment preset="warehouse" />
      
      {/* Machine bed/table */}
      <mesh position={[0, 0, -0.03]} receiveShadow>
        <boxGeometry args={[0.3, 0.3, 0.01]} />
        <meshStandardMaterial color="#404040" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Stock material with progressive removal */}
      <StockMaterial 
        originalGeometry={originalGeometry}
        operations={operations}
        currentOperationIndex={state.currentOperationIndex}
        operationProgress={state.operationProgress}
      />
      
      {/* Toolpath visualization */}
      <ToolpathVisualization 
        operations={operations}
        currentOperationIndex={state.currentOperationIndex}
        operationProgress={state.operationProgress}
        showToolpath={state.showToolpath}
      />
      
      {/* Current cutting tool */}
      {operations[state.currentOperationIndex] && (
        <CuttingTool 
          operation={operations[state.currentOperationIndex]}
          progress={state.operationProgress}
          isActive={state.isPlaying}
          showTool={state.showTool}
        />
      )}
      
      {/* Reference grid and axes */}
      <gridHelper args={[0.2, 20, '#444444', '#444444']} />
      <axesHelper args={[0.05]} />
    </>
  );
};

export const RealisticSimulation: React.FC<RealisticSimulationProps> = ({
  operations,
  originalGeometry,
  onSimulationComplete
}) => {
  const [state, setState] = useState<SimulationState>({
    isPlaying: false,
    speed: 1,
    progress: 0,
    currentOperationIndex: 0,
    operationProgress: 0,
    showToolpath: true,
    showTool: true,
    showChips: false
  });

  const handleStateChange = (newState: Partial<SimulationState>) => {
    setState(prev => ({ ...prev, ...newState }));
    
    if (newState.progress === 1 && onSimulationComplete) {
      onSimulationComplete();
    }
  };

  const handlePlayPause = () => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleReset = () => {
    setState(prev => ({
      ...prev,
      isPlaying: false,
      progress: 0,
      currentOperationIndex: 0,
      operationProgress: 0
    }));
  };

  const handleSpeedChange = (newSpeed: number[]) => {
    setState(prev => ({ ...prev, speed: newSpeed[0] }));
  };

  const currentOperation = operations[state.currentOperationIndex];
  const totalTime = operations.reduce((sum, op) => sum + op.estimatedTime, 0);

  return (
    <div className="w-full h-full flex flex-col">
      {/* 3D Simulation Canvas */}
      <div className="flex-1 min-h-[500px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden">
        <Canvas shadows>
          <SimulationScene 
            operations={operations}
            originalGeometry={originalGeometry}
            state={state}
            onStateChange={handleStateChange}
          />
        </Canvas>
      </div>
      
      {/* Simulation Controls */}
      <Card className="p-4 mt-4 space-y-4">
        {/* Main Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayPause}
              className="bg-primary/10 hover:bg-primary/20"
            >
              {state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {state.isPlaying ? 'Pause' : 'Play'}
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
          
          {/* View Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant={state.showToolpath ? "default" : "outline"}
              size="sm"
              onClick={() => setState(prev => ({ ...prev, showToolpath: !prev.showToolpath }))}
            >
              {state.showToolpath ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Toolpath
            </Button>
            
            <Button
              variant={state.showTool ? "default" : "outline"}
              size="sm"
              onClick={() => setState(prev => ({ ...prev, showTool: !prev.showTool }))}
            >
              {state.showTool ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Tool
            </Button>
          </div>
          
          {/* Speed Control */}
          <div className="flex items-center gap-2">
            <FastForward className="h-4 w-4" />
            <span className="text-sm">Speed:</span>
            <div className="w-24">
              <Slider
                value={[state.speed]}
                onValueChange={handleSpeedChange}
                max={10}
                min={0.1}
                step={0.1}
                className="w-full"
              />
            </div>
            <span className="text-sm font-mono">{state.speed.toFixed(1)}x</span>
          </div>
        </div>
        
        {/* Progress and Status */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-4">
              <span>Progress: {Math.round(state.progress * 100)}%</span>
              <Badge variant="outline">
                Operation {state.currentOperationIndex + 1}/{operations.length}
              </Badge>
              {currentOperation && (
                <Badge variant="secondary">
                  {currentOperation.name}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground">
              Total Time: {totalTime.toFixed(1)} min
            </div>
          </div>
          
          <Progress value={state.progress * 100} className="h-2" />
          
          {currentOperation && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tool: {currentOperation.tool.id}</span>
              <span>Feed: {currentOperation.parameters.feedrate} mm/min</span>
              <span>Speed: {currentOperation.parameters.spindleSpeed} RPM</span>
              <span>MRR: {currentOperation.materialRemovalRate.toFixed(1)} cm³/min</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};