import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { Suspense, useMemo, useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';

interface Model3DViewerProps {
  geometry?: THREE.BufferGeometry;
  features: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    dimensions: { [key: string]: number };
    faceIds?: number[];
    visible: boolean;
  }>;
  selectedFeatureIds: string[];
  onFeatureClick?: (featureId: string) => void;
  analysisResults?: any;
  uploadedFile?: File;
}

const Model3DViewer = ({ geometry, features, selectedFeatureIds, onFeatureClick, analysisResults, uploadedFile }: Model3DViewerProps) => {
  const [coloredGeometry, setColoredGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [loadingError, setLoadingError] = useState<string>('');

  // Create material that shows the part more realistically
  const partMaterial = useMemo(() => {
    const material = analysisResults?.materials?.toLowerCase() || '';
    
    if (material.includes('aluminum')) {
      return new THREE.MeshStandardMaterial({
        color: "#c0c0c0",
        metalness: 0.8,
        roughness: 0.3,
        vertexColors: true
      });
    } else if (material.includes('steel') || material.includes('stainless')) {
      return new THREE.MeshStandardMaterial({
        color: "#8a8a8a", 
        metalness: 0.9,
        roughness: 0.2,
        vertexColors: true
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

  // Assign per-vertex colors based on feature faceIds
  const getFeatureColor = useCallback((type: string, selected: boolean) => {
    const colorMap: Record<string, string> = {
      through_hole: '#4dabf7',
      blind_hole: '#339af0',
      rectangular_pocket: '#51cf66',
      circular_end_pocket: '#40c057',
      triangular_pocket: '#69db7c',
      rectangular_through_slot: '#9775fa',
      triangular_through_slot: '#845ef7',
      circular_through_slot: '#7950f2',
      chamfer: '#ffa94d',
      round: '#ffd43b',
      pocket: '#51cf66',
      hole: '#4dabf7',
      slot: '#9775fa'
    };
    const hex = colorMap[type] || '#868e96';
    const c = new THREE.Color(hex);
    if (selected) c.offsetHSL(0, 0.2, 0.1);
    return c;
  }, []);

  useEffect(() => {
    if (!geometry) { setColoredGeometry(null); return; }
    const geom = geometry.clone();
    const pos = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) { setColoredGeometry(geom); return; }
    const indexAttr = geom.getIndex();
    const vertexCount = pos.count;
    const colors = new Float32Array(vertexCount * 3);

    // Base neutral color
    const base = new THREE.Color('#a0a0a0');
    for (let i = 0; i < vertexCount; i++) {
      colors[3*i] = base.r; colors[3*i+1] = base.g; colors[3*i+2] = base.b;
    }

    if (indexAttr) {
      const selectedSet = new Set(selectedFeatureIds);
      features.forEach(f => {
        const color = getFeatureColor(f.type, selectedSet.has(f.id));
        (f.faceIds || []).forEach((faceIdx: number) => {
          const a = indexAttr.getX(3 * faceIdx);
          const b = indexAttr.getX(3 * faceIdx + 1);
          const cIdx = indexAttr.getX(3 * faceIdx + 2);
          [a, b, cIdx].forEach(v => {
            colors[3*v] = color.r; colors[3*v+1] = color.g; colors[3*v+2] = color.b;
          });
        });
      });
    }

    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    setColoredGeometry(geom);
  }, [geometry, features, selectedFeatureIds, getFeatureColor]);

  return (
    <div className="w-full h-64 bg-muted rounded-lg overflow-hidden relative">
      
      
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
          
          {(coloredGeometry || geometry) ? (
            <mesh position={[0, 0, 0]}>
              <primitive object={coloredGeometry || geometry} />
              <primitive object={partMaterial} />
            </mesh>
          ) : (
            /* Show message when no geometry is loaded */
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[10, 10, 10]} />
              <meshStandardMaterial color="#cccccc" wireframe={true} />
            </mesh>
          )}
          
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