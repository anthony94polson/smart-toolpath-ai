import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { supabase } from '@/integrations/supabase/client';

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
        // Read STEP file content
        const stepContent = new TextDecoder().decode(await file.arrayBuffer());
        
        console.log('STEPLoader: Parsing STEP file on server...');
        
        // Parse STEP geometry on server to get real 3D data
        const { data: geometryData, error } = await supabase.functions.invoke('step-geometry-parser', {
          body: {
            stepData: stepContent,
            filename: file.name
          }
        });
        
        if (error) {
          throw new Error(`Server parsing failed: ${error.message}`);
        }
        
        // Create Three.js geometry from server-parsed data
        const geometry = createGeometryFromParsedData(geometryData);
        
        console.log('STEPLoader: Successfully created geometry from STEP file');
        console.log(`Geometry: ${geometryData.metadata.vertexCount} vertices, ${geometryData.metadata.faceCount} faces`);
        
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

function createGeometryFromParsedData(data: any): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  // Set vertices
  const vertices = new Float32Array(data.vertices);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  
  // Set indices
  if (data.indices) {
    geometry.setIndex(data.indices);
  }
  
  // Set normals if available, otherwise compute them
  if (data.normals && data.normals.length > 0) {
    const normals = new Float32Array(data.normals);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  
  // Center the geometry
  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
  }
  
  return geometry;
}

export default STEPLoaderComponent;