import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Suspense, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import StepLoader from './StepLoader';

interface Model3DViewerProps {
  features: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    dimensions: { [key: string]: number };
    visible: boolean;
  }>;
  selectedFeatures: string[];
  onFeatureClick?: (featureId: string) => void;
  analysisResults?: any;
  uploadedFile?: File;
}

const Model3DViewer = ({ features, selectedFeatures, onFeatureClick, analysisResults, uploadedFile }: Model3DViewerProps) => {
  const [loadedGeometries, setLoadedGeometries] = useState<THREE.BufferGeometry[]>([]);
  const [loadingError, setLoadingError] = useState<string>('');

  const handleGeometryLoaded = useCallback((geometries: THREE.BufferGeometry[]) => {
    console.log('Model3DViewer: Received geometries:', geometries.length);
    setLoadedGeometries(geometries);
    setLoadingError('');
  }, []);

  const handleLoadError = useCallback((error: string) => {
    console.log('Model3DViewer: Load error:', error);
    setLoadingError(error);
    console.error('STEP loading error:', error);
    // Fallback to basic geometry
    const fallbackGeometry = new THREE.BoxGeometry(120, 80, 25);
    setLoadedGeometries([fallbackGeometry]);
  }, []);

  // Create material that shows the part more realistically
  const partMaterial = useMemo(() => {
    const material = analysisResults?.materials?.toLowerCase() || '';
    
    if (material.includes('aluminum')) {
      return new THREE.MeshStandardMaterial({
        color: "#c0c0c0",
        metalness: 0.8,
        roughness: 0.3,
        transparent: true,
        opacity: 0.8
      });
    } else if (material.includes('steel') || material.includes('stainless')) {
      return new THREE.MeshStandardMaterial({
        color: "#8a8a8a", 
        metalness: 0.9,
        roughness: 0.2,
        transparent: true,
        opacity: 0.8
      });
    } else {
      return new THREE.MeshStandardMaterial({
        color: "#a0a0a0",
        metalness: 0.6,
        roughness: 0.4,
        transparent: true,
        opacity: 0.8
      });
    }
  }, [analysisResults]);

  const Feature3D = ({ feature, isSelected }: { feature: any; isSelected: boolean }) => {
    const getFeatureGeometry = () => {
      switch (feature.type) {
        case 'pocket':
          return new THREE.BoxGeometry(
            feature.dimensions.width,
            feature.dimensions.length,
            feature.dimensions.depth
          );
        case 'hole':
          return new THREE.CylinderGeometry(
            feature.dimensions.diameter / 2,
            feature.dimensions.diameter / 2,
            feature.dimensions.depth,
            16
          );
        case 'slot':
          return new THREE.BoxGeometry(
            feature.dimensions.width,
            feature.dimensions.length,
            feature.dimensions.depth
          );
        case 'chamfer':
          return new THREE.ConeGeometry(
            feature.dimensions.size || 3,
            feature.dimensions.size || 3,
            8
          );
        default:
          return new THREE.SphereGeometry(2);
      }
    };

    const getFeatureColor = () => {
      if (isSelected) return '#3b82f6'; // blue for selected
      switch (feature.type) {
        case 'pocket': return '#ef4444'; // red
        case 'hole': return '#10b981'; // green  
        case 'slot': return '#f59e0b'; // yellow
        case 'chamfer': return '#8b5cf6'; // purple
        case 'step': return '#ec4899'; // pink
        default: return '#6b7280'; // gray
      }
    };

    const getFeaturePosition = (): [number, number, number] => {
      // Get part dimensions for proper positioning
      const partWidth = analysisResults?.geometry?.boundingBox?.x ? parseFloat(analysisResults.geometry.boundingBox.x) : 120;
      const partHeight = analysisResults?.geometry?.boundingBox?.y ? parseFloat(analysisResults.geometry.boundingBox.y) : 80;
      
      // Convert feature position to be relative to part center
      return [
        feature.position.x - partWidth/2,
        feature.position.y - partHeight/2,
        feature.position.z + (feature.dimensions.depth || 0)/2
      ];
    };

    if (!feature.visible) return null;

    return (
      <mesh
        position={getFeaturePosition()}
        onClick={() => onFeatureClick?.(feature.id)}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <primitive object={getFeatureGeometry()} />
        <meshStandardMaterial
          color={getFeatureColor()}
          transparent
          opacity={isSelected ? 0.9 : 0.7}
          emissive={getFeatureColor()}
          emissiveIntensity={isSelected ? 0.3 : 0.1}
          wireframe={false}
        />
        {/* Add wireframe outline for better visibility */}
        <mesh>
          <primitive object={getFeatureGeometry()} />
          <meshBasicMaterial
            color={getFeatureColor()}
            wireframe={true}
            transparent
            opacity={0.5}
          />
        </mesh>
      </mesh>
    );
  };

  return (
    <div className="w-full h-64 bg-muted rounded-lg overflow-hidden relative">
      {/* Debug info */}
      {uploadedFile && (
        <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs z-10">
          File: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)}KB)
          <br />Geometries: {loadedGeometries.length}
        </div>
      )}
      
      {/* STEP File Loader */}
      {uploadedFile && (
        <StepLoader
          file={uploadedFile}
          onGeometryLoaded={handleGeometryLoaded}
          onError={handleLoadError}
        />
      )}
      
      <Canvas>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[100, 100, 100]} />
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
          
          {/* Lighting */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <pointLight position={[-10, -10, -5]} intensity={0.5} />
          
          {/* Environment */}
          <Environment preset="studio" />
          
          {/* Main part geometries from STEP file */}
          {loadedGeometries.map((geometry, index) => (
            <mesh key={index} position={index === 0 ? [0, 0, 0] : [Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 10]}>
              <primitive object={geometry} />
              <primitive object={partMaterial} />
            </mesh>
          ))}
          
          {/* Fallback if no geometries loaded */}
          {loadedGeometries.length === 0 && (
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[120, 80, 25]} />
              <primitive object={partMaterial} />
            </mesh>
          )}
          
          {/* Features */}
          {features.map((feature) => (
            <Feature3D
              key={feature.id}
              feature={feature}
              isSelected={selectedFeatures.includes(feature.id)}
            />
          ))}
        </Suspense>
      </Canvas>
      
      {loadingError && (
        <div className="absolute bottom-2 left-2 bg-destructive/90 text-destructive-foreground px-2 py-1 rounded text-xs">
          {loadingError}
        </div>
      )}
    </div>
  );
};

export default Model3DViewer;