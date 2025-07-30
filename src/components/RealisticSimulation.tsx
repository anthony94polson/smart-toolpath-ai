import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Eye, EyeOff, Settings } from 'lucide-react';

console.log('RealisticSimulation module loading...');

interface RealisticSimulationProps {
  geometry: THREE.BufferGeometry | null;
  operations?: any[]; // MachiningOperation array
  toolpaths?: any[]; // Legacy format support
  simulationTime: number;
}

// Convert MachiningOperations to visualization format
const prepareOperationsForVisualization = (operations: any[]) => {
  console.log(`🔄 Preparing ${operations.length} operations for visualization`);
  
  return operations.map(operation => {
    const toolpathPoints = [];
    
    // Convert toolpath segments to points
    if (operation.toolpath && operation.toolpath.length > 0) {
      operation.toolpath.forEach((segment: any) => {
        toolpathPoints.push({
          x: segment.startPoint.x,
          y: segment.startPoint.y,
          z: segment.startPoint.z
        });
        toolpathPoints.push({
          x: segment.endPoint.x,
          y: segment.endPoint.y,
          z: segment.endPoint.z
        });
      });
    }
    
    console.log(`Operation ${operation.id}: ${toolpathPoints.length} points generated`);
    
    return {
      id: operation.id,
      name: operation.type,
      type: operation.type,
      toolpaths: [{
        points: toolpathPoints,
        segments: operation.toolpath || [],
        toolDiameter: operation.tool.diameter,
        toolType: operation.tool.type
      }],
      visible: true,
      color: getOperationColor(operation.type),
      feature: operation.feature
    };
  });
};

// Legacy: Group toolpaths by operation type
const groupToolpathsByOperation = (toolpaths: any[]) => {
  const operations = new Map();
  
  toolpaths.forEach((toolpath, index) => {
    const operation = toolpath.operation;
    if (!operations.has(operation)) {
      operations.set(operation, {
        name: operation,
        toolpaths: [],
        visible: true,
        color: getOperationColor(operation)
      });
    }
    operations.get(operation).toolpaths.push({ ...toolpath, index });
  });
  
  return Array.from(operations.values());
};

const getOperationColor = (operation: string) => {
  const colors = {
    'rough': '#ef4444', // Red
    'finish': '#22c55e', // Green
    'drilling': '#3b82f6', // Blue
    'drill': '#3b82f6', // Blue
    'pocket': '#f59e0b', // Orange
    'pocketing': '#f59e0b', // Orange
    'slot': '#8b5cf6', // Purple
    'chamfer': '#06b6d4', // Cyan
    'counterbore': '#ec4899', // Pink
    'countersink': '#8b5cf6', // Purple
    'taper_hole': '#10b981', // Emerald
    'fillet': '#f97316', // Orange
    'island': '#84cc16' // Lime
  };
  return colors[operation.toLowerCase() as keyof typeof colors] || '#6b7280';
};

// 3D Model Component
const Model3D = ({ geometry }: { geometry: THREE.BufferGeometry | null }) => {
  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial 
        color="#e5e7eb" 
        side={THREE.DoubleSide}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  );
};

// Enhanced Toolpath Visualization Component
const ToolpathVisualization = ({ 
  operations, 
  visibleOperations 
}: { 
  operations: any[], 
  visibleOperations: Set<string> 
}) => {
  return (
    <>
      {operations.map((operation) => {
        if (!visibleOperations.has(operation.name)) return null;
        
        return (
          <group key={operation.id || operation.name}>
            {operation.toolpaths.map((toolpath: any, toolpathIndex: number) => {
              // Render individual toolpath segments for better visualization
              if (toolpath.segments && toolpath.segments.length > 0) {
                return toolpath.segments.map((segment: any, segmentIndex: number) => {
                  const startPoint = new THREE.Vector3(
                    segment.startPoint.x,
                    segment.startPoint.y,
                    segment.startPoint.z
                  );
                  const endPoint = new THREE.Vector3(
                    segment.endPoint.x,
                    segment.endPoint.y,
                    segment.endPoint.z
                  );
                  
                  // Different visualization for different segment types
                  const lineWidth = segment.type === 'rapid' ? 0.02 : 0.08;
                  const opacity = segment.type === 'rapid' ? 0.3 : 0.9;
                  const color = segment.type === 'rapid' ? '#888888' : operation.color;
                  
                  const points = [startPoint, endPoint];
                  const curve = new THREE.CatmullRomCurve3(points);
                  const geometry = new THREE.TubeGeometry(curve, 2, lineWidth, 6, false);
                  
                  return (
                    <mesh key={`${operation.id}-${toolpathIndex}-${segmentIndex}`} geometry={geometry}>
                      <meshStandardMaterial 
                        color={color}
                        emissive={color}
                        emissiveIntensity={segment.type === 'rapid' ? 0.0 : 0.3}
                        transparent
                        opacity={opacity}
                      />
                    </mesh>
                  );
                });
              } else {
                // Fallback to points-based rendering
                const points = toolpath.points?.map((point: any) => 
                  new THREE.Vector3(point.x, point.y, point.z)
                ) || [];
                
                if (points.length < 2) return null;
                
                const curve = new THREE.CatmullRomCurve3(points);
                const geometry = new THREE.TubeGeometry(
                  curve, 
                  Math.max(points.length * 2, 20), 
                  0.08, 
                  8, 
                  false
                );
                
                return (
                  <mesh key={`${operation.id}-${toolpathIndex}-fallback`} geometry={geometry}>
                    <meshStandardMaterial 
                      color={operation.color}
                      emissive={operation.color}
                      emissiveIntensity={0.3}
                      transparent
                      opacity={0.9}
                    />
                  </mesh>
                );
              }
            })}
          </group>
        );
      })}
    </>
  );
};

// Main 3D Scene
const Scene3D = ({ 
  geometry, 
  operations, 
  visibleOperations 
}: { 
  geometry: THREE.BufferGeometry | null,
  operations: any[],
  visibleOperations: Set<string>
}) => {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <pointLight position={[-10, -10, -5]} intensity={0.4} />

      {/* 3D Model */}
      <Model3D geometry={geometry} />

      {/* Toolpaths */}
      <ToolpathVisualization 
        operations={operations}
        visibleOperations={visibleOperations}
      />

      {/* Grid Helper */}
      <gridHelper args={[20, 20, '#444444', '#666666']} />

      {/* Controls */}
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
};

const RealisticSimulation: React.FC<RealisticSimulationProps> = ({
  geometry,
  operations: machiningOperations = [],
  toolpaths = [],
  simulationTime
}) => {
  console.log('RealisticSimulation: Received', machiningOperations.length, 'operations and', toolpaths.length, 'legacy toolpaths');
  
  // Use new operations format if available, otherwise fall back to legacy
  const operations = machiningOperations.length > 0 
    ? prepareOperationsForVisualization(machiningOperations)
    : groupToolpathsByOperation(toolpaths);
    
  const [visibleOperations, setVisibleOperations] = useState<Set<string>>(
    new Set(operations.map(op => op.name))
  );
  
  console.log('RealisticSimulation: Prepared', operations.length, 'operation groups for visualization');

  const toggleOperationVisibility = (operationName: string) => {
    setVisibleOperations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(operationName)) {
        newSet.delete(operationName);
      } else {
        newSet.add(operationName);
      }
      return newSet;
    });
  };

  const toggleAllOperations = () => {
    if (visibleOperations.size === operations.length) {
      setVisibleOperations(new Set());
    } else {
      setVisibleOperations(new Set(operations.map(op => op.name)));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            3D Toolpath Viewer
          </CardTitle>
          <CardDescription>
            View your 3D model with generated toolpaths grouped by operation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 3D Viewer */}
            <div className="lg:col-span-3">
              <div 
                className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg overflow-hidden border"
                style={{ height: '600px' }}
              >
                <Canvas
                  camera={{ position: [15, 15, 15], fov: 60 }}
                  shadows
                >
                  <Scene3D 
                    geometry={geometry}
                    operations={operations}
                    visibleOperations={visibleOperations}
                  />
                </Canvas>
              </div>
            </div>

            {/* Operations Panel */}
            <div className="space-y-4">
              {/* Operations Control */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Operations</CardTitle>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={toggleAllOperations}
                    >
                      {visibleOperations.size === operations.length ? 'Hide All' : 'Show All'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {operations.map((operation) => (
                      <div 
                        key={operation.name}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: operation.color }}
                          />
                          <div>
                            <div className="font-medium capitalize">
                              {operation.name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {operation.toolpaths.length} path{operation.toolpaths.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleOperationVisibility(operation.name)}
                        >
                          {visibleOperations.has(operation.name) ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Toolpath Statistics */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Operations:</span>
                    <Badge variant="outline">{operations.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Toolpaths:</span>
                    <Badge variant="outline">{toolpaths.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Estimated Time:</span>
                    <Badge variant="outline">
                      {Math.floor(simulationTime / 60)}:{(simulationTime % 60).toString().padStart(2, '0')}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Visible Operations:</span>
                    <Badge variant="outline">{visibleOperations.size}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Operation Details */}
              {operations.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Operation Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {operations.map((operation) => (
                        <div key={operation.name} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: operation.color }}
                            />
                            <span className="font-medium capitalize">{operation.name}</span>
                          </div>
                          {operation.toolpaths.map((toolpath: any, idx: number) => (
                            <div key={idx} className="ml-5 text-sm text-muted-foreground">
                              Tool: ⌀{toolpath.toolDiameter}mm {toolpath.toolType}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealisticSimulation;