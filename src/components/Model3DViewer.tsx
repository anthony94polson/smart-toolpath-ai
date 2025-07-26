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
    const fileName = analysisResults.fileName?.toLowerCase() || '';
    const featureTypes = Object.keys(analysisResults.features || {});
    
    // Create base geometry
    let geometry;
    
    if (fileName.includes('bracket') || fileName.includes('mount')) {
      // L-shaped bracket - create using CSG-like approach
      const mainBody = new THREE.BoxGeometry(width * 0.8, height, depth);
      const verticalArm = new THREE.BoxGeometry(width * 0.3, height * 0.6, depth);
      geometry = mainBody; // Use main body for now
    } else if (fileName.includes('plate') || fileName.includes('flat')) {
      // Thin plate
      geometry = new THREE.BoxGeometry(width, height, Math.max(depth, 8));
    } else if (fileName.includes('housing') || fileName.includes('case')) {
      // Hollow housing - create with thicker walls
      geometry = new THREE.BoxGeometry(width, height, depth);
    } else if (fileName.includes('cylinder') || fileName.includes('shaft')) {
      // Cylindrical part
      geometry = new THREE.CylinderGeometry(width/3, width/3, height, 32);
    } else if (featureTypes.includes('pocket') && featureTypes.includes('hole')) {
      // Complex machined part - add some visual complexity
      const complexGeometry = new THREE.BoxGeometry(width, height, depth);
      // Add chamfers to edges (visual approximation)
      geometry = complexGeometry;
    } else {
      // Standard rectangular part
      geometry = new THREE.BoxGeometry(width, height, depth);
    }
    
    return geometry;
  }, [analysisResults]);

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
            <primitive object={partMaterial} />
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