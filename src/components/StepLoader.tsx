import { useEffect, useState } from 'react';
import * as THREE from 'three';

interface StepLoaderProps {
  file: File;
  onGeometryLoaded: (geometry: THREE.BufferGeometry[]) => void;
  onError: (error: string) => void;
}

const StepLoader = ({ file, onGeometryLoaded, onError }: StepLoaderProps) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadStepFile = async () => {
      console.log('StepLoader: Starting to load file:', file.name);
      setIsLoading(true);
      
      try {
        // For now, create realistic mock geometry based on file characteristics
        console.log('StepLoader: Creating geometry for file:', file.name, 'Size:', file.size);
        const geometries = await createRealisticGeometry(file);
        console.log('StepLoader: Generated geometries:', geometries.length);
        onGeometryLoaded(geometries);
      } catch (error) {
        console.error('STEP loading error:', error);
        onError(error instanceof Error ? error.message : 'Failed to load STEP file');
      } finally {
        setIsLoading(false);
      }
    };

    if (file) {
      loadStepFile();
    }
  }, [file, onGeometryLoaded, onError]);

  return null; // This is a logic component, no UI
};

// Create realistic geometry based on file characteristics
const createRealisticGeometry = async (file: File): Promise<THREE.BufferGeometry[]> => {
  return new Promise((resolve) => {
    const fileName = file.name.toLowerCase();
    const fileSize = file.size;
    const geometries: THREE.BufferGeometry[] = [];

    // Read file content to determine complexity
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      
      // Analyze STEP content for better geometry generation
      const hasComplexFeatures = content?.includes('ADVANCED_FACE') || content?.includes('B_SPLINE');
      const hasHoles = content?.includes('CIRCLE') || content?.includes('CYLINDRICAL_SURFACE');
      const hasPockets = content?.includes('FACE_BOUND') && content?.includes('EDGE_LOOP');
      
      // Generate main body geometry
      let mainGeometry: THREE.BufferGeometry;
      
      if (fileName.includes('bracket')) {
        // L-bracket geometry
        const width = 80 + Math.random() * 40;
        const height = 60 + Math.random() * 30;
        const thickness = 8 + Math.random() * 7;
        
        // Create L-shape using BoxGeometry (simplified)
        mainGeometry = new THREE.BoxGeometry(width, height * 0.7, thickness);
        
        // Add vertical arm
        const armGeometry = new THREE.BoxGeometry(width * 0.4, height, thickness);
        geometries.push(armGeometry);
        
      } else if (fileName.includes('plate') || fileName.includes('flat')) {
        // Flat plate
        const width = 100 + Math.random() * 100;
        const height = 80 + Math.random() * 80;
        const thickness = 5 + Math.random() * 10;
        mainGeometry = new THREE.BoxGeometry(width, height, thickness);
        
      } else if (fileName.includes('housing') || fileName.includes('case')) {
        // Housing with internal cavity
        const width = 90 + Math.random() * 60;
        const height = 70 + Math.random() * 50;
        const depth = 40 + Math.random() * 30;
        mainGeometry = new THREE.BoxGeometry(width, height, depth);
        
        // Add internal cavity (represented as a smaller box)
        const cavityGeometry = new THREE.BoxGeometry(width * 0.8, height * 0.8, depth * 0.9);
        geometries.push(cavityGeometry);
        
      } else if (fileName.includes('cylinder') || fileName.includes('shaft')) {
        // Cylindrical part
        const radius = 15 + Math.random() * 25;
        const height = 80 + Math.random() * 80;
        mainGeometry = new THREE.CylinderGeometry(radius, radius, height, 32);
        
      } else {
        // Generic part based on file size and complexity
        const complexity = fileSize > 5000000 ? 'high' : fileSize > 1000000 ? 'medium' : 'low';
        
        if (complexity === 'high') {
          // Complex multi-feature part
          const width = 120 + Math.random() * 80;
          const height = 80 + Math.random() * 60;
          const depth = 30 + Math.random() * 40;
          mainGeometry = new THREE.BoxGeometry(width, height, depth);
          
          // Add multiple features
          if (hasHoles) {
            for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
              const holeRadius = 3 + Math.random() * 8;
              const holeDepth = depth * 0.8;
              const holeGeometry = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
              geometries.push(holeGeometry);
            }
          }
          
          if (hasPockets) {
            for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
              const pocketWidth = 20 + Math.random() * 30;
              const pocketHeight = 15 + Math.random() * 25;
              const pocketDepth = 5 + Math.random() * 10;
              const pocketGeometry = new THREE.BoxGeometry(pocketWidth, pocketHeight, pocketDepth);
              geometries.push(pocketGeometry);
            }
          }
        } else {
          // Simple part
          const width = 80 + Math.random() * 40;
          const height = 60 + Math.random() * 30;
          const depth = 20 + Math.random() * 20;
          mainGeometry = new THREE.BoxGeometry(width, height, depth);
        }
      }
      
      geometries.unshift(mainGeometry); // Add main geometry first
      resolve(geometries);
    };
    
    reader.readAsText(file.slice(0, 50000)); // Read first 50KB to analyze structure
  });
};

export default StepLoader;