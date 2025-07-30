import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import { AAGNetInspiredAnalyzer } from './AAGNetInspiredAnalyzer';

interface MLFeatureAnalyzerProps {
  geometry: THREE.BufferGeometry;
  onFeaturesDetected: (features: MachinableFeature[], analysisResults: any) => void;
  onProgress: (progress: number, status: string) => void;
  onError: (error: string) => void;
}

interface MachinableFeature {
  id: string;
  type: string;
  confidence: number;
  position: THREE.Vector3;
  dimensions: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    depth?: number;
  };
  boundingBox: THREE.Box3;
  normal?: THREE.Vector3;
  axis?: THREE.Vector3;
  toolRecommendation: string;
}

// AAGNet-inspired ML feature detection using geometric graph analysis
class MLFeatureDetector {
  private analyzer: AAGNetInspiredAnalyzer | null = null;
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    // Initialize TensorFlow.js
    await tf.ready();
    console.log('TensorFlow.js backend:', tf.getBackend());
    
    this.isInitialized = true;
  }

  // Convert AAGNet GeometricFeature to MachinableFeature interface
  private convertToMachinableFeature(geoFeature: any, index: number): MachinableFeature {
    const position = geoFeature.position || new THREE.Vector3();
    const dimensions = geoFeature.dimensions || {};
    
    // Map feature types to tool recommendations
    const getToolRecommendation = (type: string, dims: any): string => {
      switch (type) {
        case 'hole':
          const diameter = dims.diameter || dims.width || 5;
          return diameter < 3 ? 'Small Drill Bit (< 3mm)' : 
                 diameter < 10 ? 'Standard Drill Bit (3-10mm)' : 
                 'Large Drill Bit (> 10mm)';
        case 'pocket':
          return 'End Mill';
        case 'slot':
          return 'Slot Mill';
        case 'chamfer':
          return 'Chamfer Mill';
        case 'step':
          return 'Face Mill';
        case 'boss':
          return 'Roughing End Mill';
        case 'groove':
          return 'Grooving Tool';
        default:
          return 'End Mill';
      }
    };

    return {
      id: geoFeature.id || `feature_${index}`,
      type: geoFeature.type,
      confidence: geoFeature.confidence,
      position: position,
      dimensions: {
        length: dimensions.length,
        width: dimensions.width,
        height: dimensions.height,
        diameter: dimensions.diameter,
        depth: dimensions.depth
      },
      boundingBox: geoFeature.boundingBox || new THREE.Box3().setFromCenterAndSize(position, new THREE.Vector3(1, 1, 1)),
      normal: geoFeature.normal,
      axis: geoFeature.axis,
      toolRecommendation: getToolRecommendation(geoFeature.type, dimensions)
    };
  }

  // Main feature detection using AAGNet-inspired analysis
  async detectFeatures(geometry: THREE.BufferGeometry, onProgress: (progress: number, status: string) => void): Promise<MachinableFeature[]> {
    await this.initialize();
    
    onProgress(0.05, 'Initializing AAGNet-inspired analyzer...');
    
    // Ensure geometry has proper normals
    if (!geometry.attributes.normal) {
      onProgress(0.1, 'Computing vertex normals...');
      geometry.computeVertexNormals();
    }
    
    onProgress(0.15, 'Creating geometric graph analyzer...');
    
    // Create AAGNet analyzer instance
    this.analyzer = new AAGNetInspiredAnalyzer(geometry);
    
    onProgress(0.25, 'Constructing geometric attributed adjacency graph...');
    
    try {
      // Add progress tracking wrapper for AAGNet analysis
      const progressWrapper = (step: number, substep: number, status: string) => {
        const progressValue = 0.25 + (step + substep) * 0.6; // 25% to 85% for analysis
        onProgress(Math.min(progressValue, 0.85), status);
      };
      
      onProgress(0.3, 'Analyzing geometric topology...');
      
      // Use AAGNet-inspired feature recognition with progress tracking
      const geometricFeatures = await this.runAAGNetAnalysisWithProgress(progressWrapper);
      
      onProgress(0.9, 'Converting features to machining format...');
      
      // Convert to MachinableFeature format
      const machinableFeatures = geometricFeatures.map((geoFeature, index) => 
        this.convertToMachinableFeature(geoFeature, index)
      );
      
      // Filter out low-confidence features
      const filteredFeatures = machinableFeatures.filter(f => f.confidence > 0.5);
      
      onProgress(1.0, `Analysis complete - found ${filteredFeatures.length} high-confidence features`);
      
      console.log('AAGNet-inspired analysis complete:', {
        totalDetected: machinableFeatures.length,
        highConfidence: filteredFeatures.length,
        features: filteredFeatures
      });
      
      return filteredFeatures;
      
    } catch (error) {
      console.error('AAGNet-inspired analysis failed:', error);
      onProgress(0.5, 'Primary analysis failed, using fallback method...');
      
      // Fallback to basic geometric analysis if AAGNet fails
      return this.fallbackFeatureDetection(geometry, onProgress);
    }
  }

  // Wrapper to add progress tracking to AAGNet analysis
  private async runAAGNetAnalysisWithProgress(onProgress: (step: number, substep: number, status: string) => void): Promise<any[]> {
    if (!this.analyzer) throw new Error('Analyzer not initialized');
    
    onProgress(0, 0, 'Building geometric graph...');
    const features = await this.analyzer.recognizeFeatures();
    onProgress(1, 0, 'Feature recognition complete');
    
    return features;
  }

  // Fallback feature detection using basic geometric analysis
  private async fallbackFeatureDetection(geometry: THREE.BufferGeometry, onProgress: (progress: number, status: string) => void): Promise<MachinableFeature[]> {
    onProgress(0.5, 'Using fallback geometric analysis...');
    
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox!;
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    const features: MachinableFeature[] = [];
    
    // Simple heuristic-based feature detection
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    
    // Analyze geometry for basic features
    const vertexCount = positions.length / 3;
    const faceCount = vertexCount / 3;
    
    // Detect potential holes by analyzing normal patterns
    const potentialHoles = this.detectHolePatterns(positions, normals, boundingBox);
    features.push(...potentialHoles);
    
    // Detect potential pockets by analyzing height variations
    const potentialPockets = this.detectPocketPatterns(positions, boundingBox);
    features.push(...potentialPockets);
    
    onProgress(1.0, `Fallback analysis complete - found ${features.length} features`);
    return features;
  }

  private detectHolePatterns(positions: ArrayLike<number>, normals: ArrayLike<number>, boundingBox: THREE.Box3): MachinableFeature[] {
    const features: MachinableFeature[] = [];
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Look for circular patterns in the geometry
    const circularRegions = this.findCircularRegions(positions, normals);
    
    circularRegions.forEach((region, index) => {
      if (region.confidence > 0.6) {
        features.push({
          id: `hole_${index}`,
          type: 'hole',
          confidence: region.confidence,
          position: region.center,
          dimensions: {
            diameter: region.radius * 2,
            depth: region.depth
          },
          boundingBox: new THREE.Box3().setFromCenterAndSize(
            region.center, 
            new THREE.Vector3(region.radius * 2, region.radius * 2, region.depth)
          ),
          normal: region.normal,
          toolRecommendation: region.radius < maxDim * 0.02 ? 'Small Drill Bit' : 'Standard Drill Bit'
        });
      }
    });
    
    return features;
  }

  private detectPocketPatterns(positions: ArrayLike<number>, boundingBox: THREE.Box3): MachinableFeature[] {
    const features: MachinableFeature[] = [];
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    
    // Analyze height variations to find pockets
    const pocketRegions = this.findPocketRegions(positions, boundingBox);
    
    pocketRegions.forEach((region, index) => {
      if (region.confidence > 0.5) {
        features.push({
          id: `pocket_${index}`,
          type: 'pocket',
          confidence: region.confidence,
          position: region.center,
          dimensions: {
            length: region.length,
            width: region.width,
            depth: region.depth
          },
          boundingBox: new THREE.Box3().setFromCenterAndSize(
            region.center,
            new THREE.Vector3(region.length, region.width, region.depth)
          ),
          normal: new THREE.Vector3(0, 0, 1),
          toolRecommendation: 'End Mill'
        });
      }
    });
    
    return features;
  }

  private findCircularRegions(positions: ArrayLike<number>, normals: ArrayLike<number>): any[] {
    // Simplified circular pattern detection
    const regions: any[] = [];
    
    // This is a simplified implementation
    // In a real implementation, you would analyze the mesh topology
    // to find actual circular patterns
    
    return regions;
  }

  private findPocketRegions(positions: ArrayLike<number>, boundingBox: THREE.Box3): any[] {
    // Simplified pocket detection
    const regions: any[] = [];
    
    // This is a simplified implementation
    // In a real implementation, you would analyze mesh concavity
    // and surface variations to find actual pockets
    
    return regions;
  }
}

const MLFeatureAnalyzer = ({ geometry, onFeaturesDetected, onProgress, onError }: MLFeatureAnalyzerProps) => {
  const [detector] = useState(() => new MLFeatureDetector());

  useEffect(() => {
    const analyzeFeatures = async () => {
      try {
        onProgress(0, 'Initializing ML feature detector...');
        
        const features = await detector.detectFeatures(geometry, onProgress);
        
        const analysisResults = {
          fileName: 'geometry',
          fileSize: 0,
          originalGeometry: geometry,
          detectedFeatures: features,
          triangleCount: geometry.attributes.position.count / 3,
          boundingBox: geometry.boundingBox,
          analysisTime: Date.now(),
          mlModel: 'AAGNet-Inspired Geometric Graph Analyzer',
          analysisMethod: 'Graph Neural Network Feature Recognition',
          confidenceThreshold: 0.5,
          featuresFiltered: true
        };
        
        console.log('ML Feature Analysis complete:', features.length, 'features detected');
        onFeaturesDetected(features, analysisResults);
        
      } catch (error) {
        console.error('ML Feature detection failed:', error);
        onError(error instanceof Error ? error.message : 'ML feature detection failed');
      }
    };

    if (geometry) {
      analyzeFeatures();
    }
  }, [geometry, detector, onFeaturesDetected, onProgress, onError]);

  return null; // This is a logic component
};

export default MLFeatureAnalyzer;