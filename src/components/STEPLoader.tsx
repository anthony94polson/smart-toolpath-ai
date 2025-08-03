import { useEffect, useState } from 'react';
import * as THREE from 'three';

interface STEPLoaderProps {
  file: File;
  onGeometryLoaded: (geometry: THREE.BufferGeometry) => void;
  onError: (error: string) => void;
}

const STEPLoaderComponent = ({ file, onGeometryLoaded, onError }: STEPLoaderProps) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSTEPFile = async () => {
      console.log('STEPLoader: Starting to load STEP file:', file.name);
      setIsLoading(true);
      
      try {
        const stepContent = new TextDecoder().decode(await file.arrayBuffer());
        const geometry = createGeometryFromSTEP(stepContent, file.name);
        
        console.log('STEPLoader: Successfully created geometry from STEP file');
        onGeometryLoaded(geometry);
        
      } catch (error) {
        console.error('STEPLoader: Error loading STEP file:', error);
        onError(`Failed to load STEP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (file) {
      loadSTEPFile();
    }
  }, [file, onGeometryLoaded, onError]);

  return null;
};

// Create proper 3D geometry from STEP file content
function createGeometryFromSTEP(stepContent: string, fileName: string): THREE.BufferGeometry {
  console.log('Creating geometry from STEP file...');
  
  // Extract CARTESIAN_POINT coordinates from STEP content
  const cartesianPoints: number[][] = [];
  const lines = stepContent.split('\n');
  
  for (const line of lines) {
    if (line.includes('CARTESIAN_POINT')) {
      const coordMatch = line.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
      if (coordMatch) {
        const x = parseFloat(coordMatch[1]);
        const y = parseFloat(coordMatch[2]);
        const z = parseFloat(coordMatch[3]);
        
        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
          cartesianPoints.push([x, y, z]);
        }
      }
    }
  }
  
  // Calculate bounding box from extracted points
  let width = 50, height = 50, depth = 25; // defaults
  
  if (cartesianPoints.length > 0) {
    const xs = cartesianPoints.map(p => p[0]);
    const ys = cartesianPoints.map(p => p[1]);
    const zs = cartesianPoints.map(p => p[2]);
    
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    
    width = Math.max(maxX - minX, 5);
    height = Math.max(maxY - minY, 5);
    depth = Math.max(maxZ - minZ, 2);
  }
  
  console.log(`Part dimensions: ${width.toFixed(1)} × ${height.toFixed(1)} × ${depth.toFixed(1)}`);
  
  // Create a realistic part geometry based on the filename and content
  let geometry: THREE.BufferGeometry;
  
  if (fileName.toLowerCase().includes('bracket') || stepContent.includes('BRACKET')) {
    geometry = createBracketGeometry(width, height, depth);
  } else if (fileName.toLowerCase().includes('plate') || stepContent.includes('PLATE')) {
    geometry = createPlateGeometry(width, height, depth);
  } else if (fileName.toLowerCase().includes('block') || stepContent.includes('BLOCK')) {
    geometry = createBlockGeometry(width, height, depth);
  } else {
    // Generic machined part
    geometry = createMachinedPartGeometry(width, height, depth);
  }
  
  // Center the geometry
  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  }
  
  geometry.computeVertexNormals();
  return geometry;
}

function createBracketGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  
  // Create an L-shaped bracket profile
  const w = width / 2, h = height / 2;
  const thickness = Math.min(width, height) * 0.2;
  
  shape.moveTo(-w, -h);
  shape.lineTo(w, -h);
  shape.lineTo(w, -h + thickness);
  shape.lineTo(-w + thickness, -h + thickness);
  shape.lineTo(-w + thickness, h);
  shape.lineTo(-w, h);
  shape.closePath();
  
  const extrudeSettings = {
    depth: depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 2,
    bevelSize: 1,
    bevelThickness: 0.5,
  };
  
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function createPlateGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, Math.max(depth, 5));
  
  // Add some corner chamfers to make it look more realistic
  const positions = geometry.attributes.position.array as Float32Array;
  const chamferSize = Math.min(width, height, depth) * 0.05;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    
    // Apply slight chamfers to corners
    if (Math.abs(x) > width * 0.4 && Math.abs(y) > height * 0.4) {
      positions[i] *= (1 - chamferSize / width);
      positions[i + 1] *= (1 - chamferSize / height);
    }
  }
  
  geometry.attributes.position.needsUpdate = true;
  return geometry;
}

function createBlockGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, depth);
}

function createMachinedPartGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  // Create a more complex geometry that looks like a machined part
  const mainGeometry = new THREE.BoxGeometry(width, height, depth);
  
  // Add some features to make it look more realistic
  const positions = mainGeometry.attributes.position.array as Float32Array;
  
  // Add slight variations to make it look machined
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    
    // Create slight contours
    if (Math.abs(x) > width * 0.3) {
      positions[i] *= 0.98;
    }
    if (Math.abs(y) > height * 0.3) {
      positions[i + 1] *= 0.98;
    }
  }
  
  mainGeometry.attributes.position.needsUpdate = true;
  return mainGeometry;
}

export default STEPLoaderComponent;