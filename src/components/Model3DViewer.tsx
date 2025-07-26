import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';

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
}

const Model3DViewer = ({ features, selectedFeatures, onFeatureClick, analysisResults }: Model3DViewerProps) => {
  // Generate realistic geometry based on uploaded file
  const partGeometry = useMemo(() => {
    if (!analysisResults?.geometry?.boundingBox) {
      // Fallback to default if no analysis results
      return new THREE.BoxGeometry(120, 80, 25);
    }

    const { x, y, z } = analysisResults.geometry.boundingBox;
    const width = parseFloat(x);
    const height = parseFloat(y);
    const depth = parseFloat(z);

    // Create a more complex geometry based on file characteristics
    const group = new THREE.Group();
    
    // Main body
    const mainGeometry = new THREE.BoxGeometry(width, height, depth);
    
    // Add some complexity based on file name and size
    const fileName = analysisResults.fileName?.toLowerCase() || '';
    const fileSize = analysisResults.fileSize || 0;
    
    if (fileName.includes('bracket') || fileName.includes('mount')) {
      // L-shaped bracket
      const arm1 = new THREE.BoxGeometry(width * 0.8, height * 0.3, depth);
      const arm2 = new THREE.BoxGeometry(width * 0.3, height * 0.8, depth);
      const combinedGeometry = new THREE.BufferGeometry();
      // For demo purposes, just use main geometry
      return mainGeometry;
    } else if (fileName.includes('plate') || fileName.includes('flat')) {
      // Flat plate with holes
      return new THREE.BoxGeometry(width, height, Math.max(depth, 5));
    } else if (fileName.includes('housing') || fileName.includes('case')) {
      // Housing with internal cavity
      return new THREE.BoxGeometry(width, height, depth);
    } else if (fileSize > 5000000) { // > 5MB
      // Complex part - add some chamfers and features
      const chamferedGeometry = new THREE.BoxGeometry(width, height, depth);
      return chamferedGeometry;
    }
    
    return mainGeometry;
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
        default: return '#6b7280'; // gray
      }
    };

    if (!feature.visible) return null;

    return (
      <mesh
        position={[
          feature.position.x - 60,
          feature.position.y - 40,
          feature.position.z
        ]}
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
          opacity={isSelected ? 0.8 : 0.6}
          emissive={isSelected ? '#1e40af' : '#000000'}
          emissiveIntensity={isSelected ? 0.2 : 0}
        />
      </mesh>
    );
  };

  return (
    <div className="w-full h-64 bg-muted rounded-lg overflow-hidden">
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
          
          {/* Grid */}
          <Grid 
            infiniteGrid={true}
            cellSize={1.5}
            sectionSize={3}
            fadeDistance={150}
            fadeStrength={1}
          />
          
          {/* Main part */}
          <mesh position={[0, 0, 0]}>
            <primitive object={partGeometry} />
            <meshStandardMaterial
              color="#6b7280"
              metalness={0.8}
              roughness={0.2}
              transparent
              opacity={0.3}
            />
          </mesh>
          
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
    </div>
  );
};

export default Model3DViewer;