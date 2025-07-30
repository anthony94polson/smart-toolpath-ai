import * as THREE from 'three';

// Reuse existing interfaces
export interface Face {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  area: number;
  adjacentFaces: Face[];
  id: number;
}

export interface EdgeLoop {
  vertices: THREE.Vector3[];
  edges: Edge[];
  isClosed: boolean;
  center: THREE.Vector3;
  radius?: number;
  isCircular?: boolean;
  confidence: number;
}

export interface Edge {
  vertex1: THREE.Vector3;
  vertex2: THREE.Vector3;
  face1: Face;
  face2?: Face;
  angle: number;
  length: number;
  isSharp: boolean;
}

export interface MachinableFeature {
  id: string;
  type: 'hole' | 'pocket' | 'slot' | 'chamfer' | 'step' | 'boss' | 'rib' | 'counterbore' | 'countersink' | 'taper_hole' | 'fillet' | 'island';
  confidence: number;
  faces: Face[];
  edges: Edge[];
  loops: EdgeLoop[];
  dimensions: { [key: string]: number };
  position: THREE.Vector3;
  normal: THREE.Vector3;
  boundingBox: THREE.Box3;
  depth: number;
  accessibility: {
    topAccess: boolean;
    sideAccess: boolean;
    recommendedTool: string;
    minimumToolDiameter: number;
  };
  machiningParameters: {
    stockToLeave: number;
    requiredTolerance: number;
    surfaceFinish: string;
  };
}

interface Surface {
  faces: Face[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  area: number;
  boundingBox: THREE.Box3;
  type: 'planar' | 'cylindrical' | 'complex';
}

export class FastSTLAnalyzer {
  private geometry: THREE.BufferGeometry;
  private surfaces: Surface[] = [];
  private boundingBox: THREE.Box3;
  private minFeatureSize = 1.0; // Minimum 1mm features
  private tolerance = 0.01; // Increased tolerance for performance
  private normalTolerance = 0.98; // cos(12 degrees) for surface grouping

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.geometry.computeBoundingBox();
    this.boundingBox = this.geometry.boundingBox!;
    
    console.log('FastSTLAnalyzer: Starting optimized analysis...');
    const startTime = performance.now();
    
    this.extractSurfaces();
    
    const endTime = performance.now();
    console.log(`FastSTLAnalyzer: Surface extraction completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`FastSTLAnalyzer: Found ${this.surfaces.length} surfaces`);
  }

  private extractSurfaces(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.index?.array;
    
    // Group triangles by normal direction for surface detection
    const normalGroups = new Map<string, Face[]>();
    
    if (indices) {
      // Process indexed geometry
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = new THREE.Vector3(
          positions[indices[i] * 3], 
          positions[indices[i] * 3 + 1], 
          positions[indices[i] * 3 + 2]
        );
        const v2 = new THREE.Vector3(
          positions[indices[i + 1] * 3], 
          positions[indices[i + 1] * 3 + 1], 
          positions[indices[i + 1] * 3 + 2]
        );
        const v3 = new THREE.Vector3(
          positions[indices[i + 2] * 3], 
          positions[indices[i + 2] * 3 + 1], 
          positions[indices[i + 2] * 3 + 2]
        );
        
        const face = this.createFaceFromVertices([v1, v2, v3], Math.floor(i / 3));
        if (face && face.area > this.tolerance) {
          const normalKey = this.getNormalKey(face.normal);
          if (!normalGroups.has(normalKey)) {
            normalGroups.set(normalKey, []);
          }
          normalGroups.get(normalKey)!.push(face);
        }
      }
    } else {
      // Process non-indexed geometry
      for (let i = 0; i < positions.length; i += 9) {
        const v1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const v2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
        const v3 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
        
        const face = this.createFaceFromVertices([v1, v2, v3], Math.floor(i / 9));
        if (face && face.area > this.tolerance) {
          const normalKey = this.getNormalKey(face.normal);
          if (!normalGroups.has(normalKey)) {
            normalGroups.set(normalKey, []);
          }
          normalGroups.get(normalKey)!.push(face);
        }
      }
    }

    // Group faces into surfaces based on proximity and normal similarity
    normalGroups.forEach((faces, normalKey) => {
      const surfaces = this.groupFacesIntoSurfaces(faces);
      this.surfaces.push(...surfaces);
    });

    // Filter out tiny surfaces
    this.surfaces = this.surfaces.filter(surface => {
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      return Math.max(size.x, size.y, size.z) >= this.minFeatureSize;
    });
  }

  private createFaceFromVertices(vertices: THREE.Vector3[], id: number): Face | null {
    if (vertices.length !== 3) return null;
    
    // Calculate normal
    const v1 = vertices[1].clone().sub(vertices[0]);
    const v2 = vertices[2].clone().sub(vertices[0]);
    const normal = v1.cross(v2).normalize();
    
    // Skip degenerate triangles
    if (normal.length() < 0.1) return null;
    
    // Calculate centroid
    const centroid = new THREE.Vector3()
      .add(vertices[0])
      .add(vertices[1])
      .add(vertices[2])
      .divideScalar(3);
    
    // Calculate area
    const area = v1.cross(v2).length() * 0.5;
    
    return {
      vertices: vertices.slice(),
      normal,
      centroid,
      area,
      adjacentFaces: [],
      id
    };
  }

  private getNormalKey(normal: THREE.Vector3): string {
    // Quantize normal to reduce precision for grouping
    const x = Math.round(normal.x * 20) / 20;
    const y = Math.round(normal.y * 20) / 20;
    const z = Math.round(normal.z * 20) / 20;
    return `${x},${y},${z}`;
  }

  private groupFacesIntoSurfaces(faces: Face[]): Surface[] {
    const surfaces: Surface[] = [];
    const visited = new Set<number>();
    
    for (const face of faces) {
      if (visited.has(face.id)) continue;
      
      const surfaceFaces = this.expandSurface(face, faces, visited);
      if (surfaceFaces.length > 0) {
        const surface = this.createSurface(surfaceFaces);
        if (surface) surfaces.push(surface);
      }
    }
    
    return surfaces;
  }

  private expandSurface(startFace: Face, allFaces: Face[], visited: Set<number>): Face[] {
    const surfaceFaces: Face[] = [];
    const queue: Face[] = [startFace];
    
    while (queue.length > 0) {
      const face = queue.shift()!;
      if (visited.has(face.id)) continue;
      
      visited.add(face.id);
      surfaceFaces.push(face);
      
      // Find adjacent coplanar faces
      for (const otherFace of allFaces) {
        if (visited.has(otherFace.id)) continue;
        
        if (this.areFacesAdjacent(face, otherFace) && 
            this.areFacesCoplanar(face, otherFace)) {
          queue.push(otherFace);
        }
      }
    }
    
    return surfaceFaces;
  }

  private areFacesAdjacent(face1: Face, face2: Face): boolean {
    // Check if faces share an edge (simplified proximity check)
    for (const v1 of face1.vertices) {
      for (const v2 of face2.vertices) {
        if (v1.distanceTo(v2) < this.tolerance) return true;
      }
    }
    return false;
  }

  private areFacesCoplanar(face1: Face, face2: Face): boolean {
    return face1.normal.dot(face2.normal) > this.normalTolerance;
  }

  private createSurface(faces: Face[]): Surface | null {
    if (faces.length === 0) return null;
    
    // Calculate surface properties
    const normal = new THREE.Vector3();
    const center = new THREE.Vector3();
    let totalArea = 0;
    
    for (const face of faces) {
      normal.add(face.normal.clone().multiplyScalar(face.area));
      center.add(face.centroid.clone().multiplyScalar(face.area));
      totalArea += face.area;
    }
    
    normal.divideScalar(totalArea).normalize();
    center.divideScalar(totalArea);
    
    // Calculate bounding box
    const boundingBox = new THREE.Box3();
    for (const face of faces) {
      for (const vertex of face.vertices) {
        boundingBox.expandByPoint(vertex);
      }
    }
    
    return {
      faces,
      normal,
      center,
      area: totalArea,
      boundingBox,
      type: 'planar' // Simplified for now
    };
  }

  public analyzeMachinableFeatures(): MachinableFeature[] {
    console.log('FastSTLAnalyzer: Analyzing machinable features from surfaces...');
    const startTime = performance.now();
    
    const features: MachinableFeature[] = [];
    
    // Analyze each surface for features
    for (const surface of this.surfaces) {
      // Only analyze surfaces that could contain machinable features
      if (surface.area < this.minFeatureSize * this.minFeatureSize) continue;
      
      const surfaceFeatures = this.analyzeSurfaceForFeatures(surface);
      features.push(...surfaceFeatures);
    }
    
    // Sort by confidence and filter
    const filteredFeatures = features
      .filter(feature => feature.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 50); // Limit to top 50 features
    
    const endTime = performance.now();
    console.log(`FastSTLAnalyzer: Feature analysis completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`FastSTLAnalyzer: Found ${filteredFeatures.length} high-confidence features`);
    
    return filteredFeatures;
  }

  private analyzeSurfaceForFeatures(surface: Surface): MachinableFeature[] {
    const features: MachinableFeature[] = [];
    
    // Determine surface orientation
    const isHorizontal = Math.abs(surface.normal.y) > 0.8;
    const isVertical = Math.abs(surface.normal.y) < 0.2;
    
    if (isHorizontal && surface.normal.y < 0) {
      // Bottom-facing surface - look for holes and pockets
      features.push(...this.detectHolesInSurface(surface));
      features.push(...this.detectPocketsInSurface(surface));
    } else if (isVertical) {
      // Vertical surface - look for slots, steps, and bosses
      features.push(...this.detectStepsInSurface(surface));
      features.push(...this.detectBossesInSurface(surface));
    }
    
    return features;
  }

  private detectHolesInSurface(surface: Surface): MachinableFeature[] {
    const holes: MachinableFeature[] = [];
    
    // Look for circular patterns in the surface
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.z);
    const minDimension = Math.min(size.x, size.z);
    
    // Simple circular hole detection
    if (maxDimension / minDimension < 1.5 && // Roughly circular
        minDimension > this.minFeatureSize && 
        minDimension < 50) { // Reasonable hole size
      
      const hole: MachinableFeature = {
        id: `hole_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'hole',
        confidence: 0.8,
        faces: surface.faces,
        edges: [],
        loops: [],
        dimensions: {
          diameter: minDimension,
          depth: size.y || 10
        },
        position: surface.center,
        normal: surface.normal,
        boundingBox: surface.boundingBox,
        depth: size.y || 10,
        accessibility: {
          topAccess: true,
          sideAccess: false,
          recommendedTool: 'drill',
          minimumToolDiameter: minDimension * 0.8
        },
        machiningParameters: {
          stockToLeave: 0.1,
          requiredTolerance: 0.05,
          surfaceFinish: 'good'
        }
      };
      
      holes.push(hole);
    }
    
    return holes;
  }

  private detectPocketsInSurface(surface: Surface): MachinableFeature[] {
    const pockets: MachinableFeature[] = [];
    
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    // Detect rectangular pockets
    if (size.x > this.minFeatureSize && 
        size.z > this.minFeatureSize && 
        surface.area > this.minFeatureSize * this.minFeatureSize * 4) {
      
      const pocket: MachinableFeature = {
        id: `pocket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'pocket',
        confidence: 0.7,
        faces: surface.faces,
        edges: [],
        loops: [],
        dimensions: {
          width: size.x,
          length: size.z,
          depth: size.y || 5
        },
        position: surface.center,
        normal: surface.normal,
        boundingBox: surface.boundingBox,
        depth: size.y || 5,
        accessibility: {
          topAccess: true,
          sideAccess: true,
          recommendedTool: 'endmill',
          minimumToolDiameter: Math.min(size.x, size.z) * 0.1
        },
        machiningParameters: {
          stockToLeave: 0.2,
          requiredTolerance: 0.1,
          surfaceFinish: 'good'
        }
      };
      
      pockets.push(pocket);
    }
    
    return pockets;
  }

  private detectStepsInSurface(surface: Surface): MachinableFeature[] {
    const steps: MachinableFeature[] = [];
    
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    if (size.y > this.minFeatureSize * 2 && 
        (size.x > this.minFeatureSize || size.z > this.minFeatureSize)) {
      
      const step: MachinableFeature = {
        id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'step',
        confidence: 0.6,
        faces: surface.faces,
        edges: [],
        loops: [],
        dimensions: {
          width: size.x,
          height: size.y,
          depth: size.z
        },
        position: surface.center,
        normal: surface.normal,
        boundingBox: surface.boundingBox,
        depth: size.z,
        accessibility: {
          topAccess: true,
          sideAccess: true,
          recommendedTool: 'endmill',
          minimumToolDiameter: 2
        },
        machiningParameters: {
          stockToLeave: 0.2,
          requiredTolerance: 0.1,
          surfaceFinish: 'good'
        }
      };
      
      steps.push(step);
    }
    
    return steps;
  }

  private detectBossesInSurface(surface: Surface): MachinableFeature[] {
    const bosses: MachinableFeature[] = [];
    
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    // Simple boss detection - protruding features
    if (size.x > this.minFeatureSize && 
        size.y > this.minFeatureSize && 
        size.z < this.minFeatureSize * 3) {
      
      const boss: MachinableFeature = {
        id: `boss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'boss',
        confidence: 0.6,
        faces: surface.faces,
        edges: [],
        loops: [],
        dimensions: {
          width: size.x,
          height: size.y,
          depth: size.z
        },
        position: surface.center,
        normal: surface.normal,
        boundingBox: surface.boundingBox,
        depth: size.z,
        accessibility: {
          topAccess: true,
          sideAccess: true,
          recommendedTool: 'endmill',
          minimumToolDiameter: 2
        },
        machiningParameters: {
          stockToLeave: 0.2,
          requiredTolerance: 0.1,
          surfaceFinish: 'good'
        }
      };
      
      bosses.push(boss);
    }
    
    return bosses;
  }
}