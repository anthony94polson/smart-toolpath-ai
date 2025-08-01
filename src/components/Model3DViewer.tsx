import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Suspense, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import STLLoaderComponent from './STLLoader';
import STEPLoaderComponent from './STEPLoader';

interface Model3DViewerProps {
  geometry?: THREE.BufferGeometry;
  features: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    dimensions: { [key: string]: number };
    visible: boolean;
  }>;
  selectedFeatureIds: string[];
  onFeatureClick?: (featureId: string) => void;
  analysisResults?: any;
  uploadedFile?: File;
}

const Model3DViewer = ({ geometry, features, selectedFeatureIds, onFeatureClick, analysisResults, uploadedFile }: Model3DViewerProps) => {
  const [stlGeometry, setStlGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loadingError, setLoadingError] = useState<string>('');

  const handleSTLGeometryLoaded = useCallback((geometry: THREE.BufferGeometry) => {
    console.log('Model3DViewer: Received STL geometry');
    setStlGeometry(geometry);
    setLoadingError('');
  }, []);

  const handleLoadError = useCallback((error: string) => {
    console.log('Model3DViewer: Load error:', error);
    setLoadingError(error);
    console.error('STL loading error:', error);
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
      const dims = feature.dimensions;
      const scale = 0.8; // Make features slightly smaller for better visibility
      
      switch (feature.type) {
        case 'through_hole':
        case 'blind_hole':
          const radius = ((dims.diameter || dims.width) / 2) * scale;
          const depth = (dims.depth || dims.height || 5) * scale;
          return new THREE.CylinderGeometry(radius, radius, depth, 16);
          
        case 'rectangular_pocket':
        case 'rectangular_blind_slot':
        case 'rectangular_through_slot':
          return new THREE.BoxGeometry(
            (dims.width || 10) * scale, 
            (dims.height || 10) * scale, 
            (dims.depth || 5) * scale
          );
          
        case 'circular_end_pocket':
        case 'circular_through_slot':
          const circRadius = ((dims.diameter || dims.width) / 2) * scale;
          const circDepth = (dims.depth || dims.height || 5) * scale;
          return new THREE.CylinderGeometry(circRadius, circRadius, circDepth, 16);
          
        case 'triangular_pocket':
        case 'triangular_through_slot':
          const triGeometry = new THREE.CylinderGeometry(0, (dims.width / 2) * scale, (dims.depth || 5) * scale, 3);
          return triGeometry;
          
        case 'chamfer':
          return new THREE.BoxGeometry(
            (dims.width || 2) * scale,
            (dims.width || 2) * scale, 
            (dims.depth || 1) * scale
          );
          
        case 'round':
          const roundRadius = (dims.radius || dims.width / 2 || 2) * scale;
          return new THREE.SphereGeometry(roundRadius, 8, 6);
          
        // Legacy support
        case 'pocket':
          return new THREE.BoxGeometry(
            (dims.width || 15) * scale,
            (dims.length || dims.height || 15) * scale,
            (dims.depth || 5) * scale
          );
        case 'hole':
          return new THREE.CylinderGeometry(
            ((dims.diameter || dims.width) / 2 || 5) * scale,
            ((dims.diameter || dims.width) / 2 || 5) * scale,
            (dims.depth || 10) * scale,
            16
          );
        case 'slot':
          return new THREE.BoxGeometry(
            (dims.width || 20) * scale,
            (dims.length || dims.height || 8) * scale,
            (dims.depth || 8) * scale
          );
          
        default:
          return new THREE.BoxGeometry(
            (dims.width || 5) * scale,
            (dims.height || 5) * scale,
            (dims.depth || 3) * scale
          );
      }
    };

    const getFeatureColor = () => {
      if (isSelected) return '#ff6b6b'; // Red for selected
      
      const colorMap: { [key: string]: string } = {
        'through_hole': '#4dabf7',
        'blind_hole': '#339af0', 
        'rectangular_pocket': '#51cf66',
        'circular_end_pocket': '#40c057',
        'triangular_pocket': '#69db7c',
        'rectangular_through_slot': '#9775fa',
        'triangular_through_slot': '#845ef7',
        'circular_through_slot': '#7950f2',
        'chamfer': '#ffa94d',
        'round': '#ffd43b',
        'rectangular_blind_step': '#ff8787',
        'circular_blind_step': '#ffa8a8',
        // Legacy support
        'pocket': '#51cf66',
        'hole': '#4dabf7', 
        'slot': '#9775fa'
      };
      
      return colorMap[feature.type] || '#868e96';
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
      <group>
        {/* Feature highlight overlay */}
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
            opacity={isSelected ? 0.8 : 0.5}
            emissive={getFeatureColor()}
            emissiveIntensity={isSelected ? 0.4 : 0.2}
            wireframe={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        
        {/* Feature outline for better visibility */}
        <mesh position={getFeaturePosition()}>
          <primitive object={getFeatureGeometry()} />
          <meshBasicMaterial
            color={getFeatureColor()}
            wireframe={true}
            transparent
            opacity={isSelected ? 0.9 : 0.6}
          />
        </mesh>
      </group>
    );
  };

  return (
    <div className="w-full h-64 bg-muted rounded-lg overflow-hidden relative">
      {/* Debug info */}
      {uploadedFile && (
        <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs z-10">
          File: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)}KB)
          <br />Type: {uploadedFile.name.toLowerCase().endsWith('.step') || uploadedFile.name.toLowerCase().endsWith('.stp') ? 'STEP (CAD Model)' : 'STL (3D Model)'}
          <br />Features: {features.length} detected
        </div>
      )}
      
      {/* File Loader - handle both STL and STEP files */}
      {uploadedFile && (
        uploadedFile.name.toLowerCase().endsWith('.stl') ? (
          <STLLoaderComponent
            file={uploadedFile}
            onGeometryLoaded={handleSTLGeometryLoaded}
            onError={handleLoadError}
          />
        ) : (uploadedFile.name.toLowerCase().endsWith('.step') || uploadedFile.name.toLowerCase().endsWith('.stp')) ? (
          <STEPLoaderComponent
            file={uploadedFile}
            onGeometryLoaded={handleSTLGeometryLoaded}
            onError={handleLoadError}
          />
        ) : null
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
          
          {/* STL geometry */}
          {stlGeometry || geometry ? (
            <mesh position={[0, 0, 0]}>
              <primitive object={stlGeometry || geometry} />
              <primitive object={partMaterial} />
            </mesh>
          ) : (
            /* Fallback geometry if STL not loaded yet */
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
              isSelected={selectedFeatureIds.includes(feature.id)}
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