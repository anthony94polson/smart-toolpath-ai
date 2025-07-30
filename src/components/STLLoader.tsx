import { useEffect, useState } from 'react';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { FastSTLAnalyzer } from './FastSTLAnalyzer';

interface STLLoaderProps {
  file: File;
  onGeometryLoaded: (geometry: THREE.BufferGeometry) => void;
  onError: (error: string) => void;
  onFeaturesAnalyzed?: (features: any[], analysisResults: any) => void;
}

const STLLoaderComponent = ({ file, onGeometryLoaded, onError, onFeaturesAnalyzed }: STLLoaderProps) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSTLFile = async () => {
      console.log('STLLoader: Starting to load STL file:', file.name);
      setIsLoading(true);
      
      try {
        // Create file URL
        const fileUrl = URL.createObjectURL(file);
        
        // Use STLLoader to load the actual STL file
        const loader = new STLLoader();
        
        loader.load(
          fileUrl,
          (geometry) => {
            console.log('STLLoader: Successfully loaded STL geometry');
            
            // Center the geometry
            geometry.computeBoundingBox();
            const boundingBox = geometry.boundingBox;
            if (boundingBox) {
              const center = new THREE.Vector3();
              boundingBox.getCenter(center);
              geometry.translate(-center.x, -center.y, -center.z);
            }
            
            // Compute normals for proper lighting
            geometry.computeVertexNormals();
            
            // Skip automatic feature analysis - will be done via ML analyzer
            if (onFeaturesAnalyzed) {
              console.log('STLLoader: Geometry loaded, feature analysis will be done via ML analyzer');
              
              // Create basic analysis results for compatibility
              const analysisResults = {
                fileName: file.name,
                fileSize: file.size,
                originalGeometry: geometry,
                detectedFeatures: [], // Empty - features will be detected by ML
                triangleCount: geometry.attributes.position.count / 3,
                boundingBox: geometry.boundingBox,
                analysisTime: Date.now(),
                mlReady: true
              };
              
              onFeaturesAnalyzed([], analysisResults);
            }
            
            onGeometryLoaded(geometry);
            
            // Clean up file URL
            URL.revokeObjectURL(fileUrl);
          },
          (progress) => {
            console.log('STLLoader: Loading progress:', progress);
          },
          (error) => {
            console.error('STLLoader: Error loading STL:', error);
            onError('Failed to load STL file');
            URL.revokeObjectURL(fileUrl);
          }
        );
        
      } catch (error) {
        console.error('STLLoader: Error:', error);
        onError(error instanceof Error ? error.message : 'Failed to load STL file');
      } finally {
        setIsLoading(false);
      }
    };

    if (file && file.name.toLowerCase().endsWith('.stl')) {
      loadSTLFile();
    }
  }, [file, onGeometryLoaded, onError]);

  return null; // This is a logic component, no UI
};

export default STLLoaderComponent;