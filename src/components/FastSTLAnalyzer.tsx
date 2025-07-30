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
  private faces: Face[] = [];
  private surfaces: Surface[] = [];
  private boundingBox: THREE.Box3;
  private minFeatureSize = 2.0; // Minimum 2mm features for machining
  private tolerance = 0.1; // Tighter tolerance for accuracy
  private normalTolerance = 0.95; // More restrictive surface grouping
  private spatialGrid: Map<string, Face[]> = new Map();
  private gridSize: number;

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.geometry.computeBoundingBox();
    this.boundingBox = this.geometry.boundingBox!;
    
    const size = this.boundingBox.getSize(new THREE.Vector3());
    this.gridSize = Math.max(size.x, size.y, size.z) / 20; // Adaptive grid size
    
    console.log('FastSTLAnalyzer: Starting topology-aware analysis...');
    const startTime = performance.now();
    
    this.extractFaces();
    this.buildSpatialIndex();
    this.extractSurfaces();
    this.validateSurfaces();
    
    const endTime = performance.now();
    console.log(`FastSTLAnalyzer: Analysis completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`FastSTLAnalyzer: Found ${this.surfaces.length} validated surfaces`);
  }

  private extractFaces(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.index?.array;
    
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
        if (face && face.area > this.tolerance * this.tolerance) {
          this.faces.push(face);
        }
      }
    } else {
      // Process non-indexed geometry
      for (let i = 0; i < positions.length; i += 9) {
        const v1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const v2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
        const v3 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
        
        const face = this.createFaceFromVertices([v1, v2, v3], Math.floor(i / 9));
        if (face && face.area > this.tolerance * this.tolerance) {
          this.faces.push(face);
        }
      }
    }
  }

  private buildSpatialIndex(): void {
    // Build spatial grid for fast neighbor queries
    for (const face of this.faces) {
      const gridKey = this.getGridKey(face.centroid);
      if (!this.spatialGrid.has(gridKey)) {
        this.spatialGrid.set(gridKey, []);
      }
      this.spatialGrid.get(gridKey)!.push(face);
    }
  }

  private getGridKey(point: THREE.Vector3): string {
    const x = Math.floor(point.x / this.gridSize);
    const y = Math.floor(point.y / this.gridSize);
    const z = Math.floor(point.z / this.gridSize);
    return `${x},${y},${z}`;
  }

  private extractSurfaces(): void {
    // Group faces by normal direction first
    const normalGroups = new Map<string, Face[]>();
    
    for (const face of this.faces) {
      const normalKey = this.getNormalKey(face.normal);
      if (!normalGroups.has(normalKey)) {
        normalGroups.set(normalKey, []);
      }
      normalGroups.get(normalKey)!.push(face);
    }

    // Group faces into surfaces based on proximity and normal similarity
    normalGroups.forEach((faces) => {
      const surfaces = this.groupFacesIntoSurfaces(faces);
      this.surfaces.push(...surfaces);
    });
  }

  private validateSurfaces(): void {
    // Remove surfaces that are too small or don't represent meaningful features
    this.surfaces = this.surfaces.filter(surface => {
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const minDim = Math.min(size.x, size.y, size.z);
      
      // Must be large enough and have reasonable aspect ratio
      return maxDim >= this.minFeatureSize && 
             surface.area >= this.minFeatureSize * this.minFeatureSize &&
             surface.faces.length >= 3;
    });

    // Sort by area (largest first) for priority processing
    this.surfaces.sort((a, b) => b.area - a.area);
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
    console.log('FastSTLAnalyzer: Starting topology-aware feature recognition...');
    const startTime = performance.now();
    
    const features: MachinableFeature[] = [];
    
    // Build topology relationships
    this.buildTopology();
    
    // Detect different feature types using topology-aware methods
    features.push(...this.detectHoles());
    features.push(...this.detectPockets());
    features.push(...this.detectSlots());
    features.push(...this.detectSteps());
    features.push(...this.detectBosses());
    features.push(...this.detectCounterbores());
    features.push(...this.detectFillets());
    
    // Validate and filter features
    const validatedFeatures = this.validateFeatures(features);
    
    // Detect compound features
    const compoundFeatures = this.detectCompoundFeatures(validatedFeatures);
    
    const endTime = performance.now();
    console.log(`FastSTLAnalyzer: Feature recognition completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`FastSTLAnalyzer: Found ${validatedFeatures.length + compoundFeatures.length} validated features`);
    
    return [...validatedFeatures, ...compoundFeatures];
  }

  private buildTopology(): void {
    // Build adjacency relationships between faces
    for (const face of this.faces) {
      face.adjacentFaces = this.findAdjacentFaces(face);
    }
  }

  private findAdjacentFaces(face: Face): Face[] {
    const adjacent: Face[] = [];
    const gridKey = this.getGridKey(face.centroid);
    
    // Check neighboring grid cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborKey = `${parseInt(gridKey.split(',')[0]) + dx},${parseInt(gridKey.split(',')[1]) + dy},${parseInt(gridKey.split(',')[2]) + dz}`;
          const neighbors = this.spatialGrid.get(neighborKey) || [];
          
          for (const neighbor of neighbors) {
            if (neighbor.id !== face.id && this.areFacesAdjacent(face, neighbor)) {
              adjacent.push(neighbor);
            }
          }
        }
      }
    }
    
    return adjacent;
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

  // Topology-aware feature detection methods
  private detectHoles(): MachinableFeature[] {
    const holes: MachinableFeature[] = [];
    
    // Look for circular surfaces that could be holes
    for (const surface of this.surfaces) {
      if (!this.isHorizontalSurface(surface)) continue;
      
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      const aspectRatio = Math.max(size.x, size.z) / Math.min(size.x, size.z);
      
      // Detect circular holes
      if (aspectRatio < 1.3 && // Nearly circular
          Math.min(size.x, size.z) >= this.minFeatureSize &&
          Math.min(size.x, size.z) <= 50 && // Reasonable hole size
          this.isConcaveSurface(surface)) {
        
        holes.push(this.createHoleFeature(surface, Math.min(size.x, size.z)));
      }
    }
    
    return holes;
  }

  private detectPockets(): MachinableFeature[] {
    const pockets: MachinableFeature[] = [];
    
    for (const surface of this.surfaces) {
      if (!this.isHorizontalSurface(surface)) continue;
      
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      
      // Detect rectangular pockets
      if (size.x >= this.minFeatureSize && 
          size.z >= this.minFeatureSize &&
          this.isConcaveSurface(surface) &&
          this.hasVerticalWalls(surface)) {
        
        const pocketType = this.classifyPocket(surface);
        pockets.push(this.createPocketFeature(surface, pocketType));
      }
    }
    
    return pockets;
  }

  private detectSlots(): MachinableFeature[] {
    const slots: MachinableFeature[] = [];
    
    for (const surface of this.surfaces) {
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      const aspectRatio = Math.max(size.x, size.z) / Math.min(size.x, size.z);
      
      // Detect elongated features (slots)
      if (aspectRatio > 3 && // Long and narrow
          Math.min(size.x, size.z) >= this.minFeatureSize &&
          this.isConcaveSurface(surface)) {
        
        slots.push(this.createSlotFeature(surface));
      }
    }
    
    return slots;
  }

  private detectSteps(): MachinableFeature[] {
    const steps: MachinableFeature[] = [];
    
    for (const surface of this.surfaces) {
      if (!this.isVerticalSurface(surface)) continue;
      
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      
      if (size.y >= this.minFeatureSize * 2 && // Significant height
          (size.x >= this.minFeatureSize || size.z >= this.minFeatureSize)) {
        
        steps.push(this.createStepFeature(surface));
      }
    }
    
    return steps;
  }

  private detectBosses(): MachinableFeature[] {
    const bosses: MachinableFeature[] = [];
    
    for (const surface of this.surfaces) {
      if (this.isConvexSurface(surface) && this.isRaisedFeature(surface)) {
        const size = surface.boundingBox.getSize(new THREE.Vector3());
        
        if (size.x >= this.minFeatureSize && size.z >= this.minFeatureSize) {
          bosses.push(this.createBossFeature(surface));
        }
      }
    }
    
    return bosses;
  }

  private detectCounterbores(): MachinableFeature[] {
    const counterbores: MachinableFeature[] = [];
    
    // Look for compound circular features (hole with larger hole above)
    for (const surface of this.surfaces) {
      if (this.isCircularSurface(surface) && this.hasCounterboreGeometry(surface)) {
        counterbores.push(this.createCounterboreFeature(surface));
      }
    }
    
    return counterbores;
  }

  private detectFillets(): MachinableFeature[] {
    const fillets: MachinableFeature[] = [];
    
    // Look for curved transition surfaces between perpendicular faces
    for (const surface of this.surfaces) {
      if (this.isCurvedSurface(surface) && this.isFilletLike(surface)) {
        fillets.push(this.createFilletFeature(surface));
      }
    }
    
    return fillets;
  }

  // Helper methods for feature classification
  private isHorizontalSurface(surface: Surface): boolean {
    return Math.abs(surface.normal.y) > 0.8;
  }

  private isVerticalSurface(surface: Surface): boolean {
    return Math.abs(surface.normal.y) < 0.2;
  }

  private isConcaveSurface(surface: Surface): boolean {
    // Check if surface is below surrounding geometry
    const center = surface.center;
    const neighbors = this.findNeighboringSurfaces(surface);
    
    for (const neighbor of neighbors) {
      if (neighbor.center.y > center.y + this.tolerance) {
        return true;
      }
    }
    return false;
  }

  private isConvexSurface(surface: Surface): boolean {
    return !this.isConcaveSurface(surface);
  }

  private isRaisedFeature(surface: Surface): boolean {
    const center = surface.center;
    const neighbors = this.findNeighboringSurfaces(surface);
    
    for (const neighbor of neighbors) {
      if (neighbor.center.y < center.y - this.tolerance) {
        return true;
      }
    }
    return false;
  }

  private isCircularSurface(surface: Surface): boolean {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    const aspectRatio = Math.max(size.x, size.z) / Math.min(size.x, size.z);
    return aspectRatio < 1.3;
  }

  private isCurvedSurface(surface: Surface): boolean {
    // Simplified: check if surface has many small faces (indicating curvature)
    const area = surface.area;
    const faceCount = surface.faces.length;
    const avgFaceArea = area / faceCount;
    return avgFaceArea < this.tolerance * this.tolerance * 10;
  }

  private hasVerticalWalls(surface: Surface): boolean {
    const neighbors = this.findNeighboringSurfaces(surface);
    return neighbors.some(neighbor => this.isVerticalSurface(neighbor));
  }

  private hasCounterboreGeometry(surface: Surface): boolean {
    // Look for nested circular features
    const neighbors = this.findNeighboringSurfaces(surface);
    return neighbors.some(neighbor => 
      this.isCircularSurface(neighbor) && 
      neighbor.boundingBox.containsBox(surface.boundingBox)
    );
  }

  private isFilletLike(surface: Surface): boolean {
    const neighbors = this.findNeighboringSurfaces(surface);
    return neighbors.length >= 2 && 
           neighbors.some(n1 => neighbors.some(n2 => 
             n1 !== n2 && Math.abs(n1.normal.dot(n2.normal)) < 0.1
           ));
  }

  private classifyPocket(surface: Surface): 'pocket' {
    // For now, simplified pocket classification
    return 'pocket';
  }

  private findNeighboringSurfaces(surface: Surface): Surface[] {
    const neighbors: Surface[] = [];
    const threshold = this.minFeatureSize;
    
    for (const otherSurface of this.surfaces) {
      if (otherSurface === surface) continue;
      
      const distance = surface.center.distanceTo(otherSurface.center);
      if (distance < threshold) {
        neighbors.push(otherSurface);
      }
    }
    
    return neighbors;
  }

  // Feature creation methods
  private createHoleFeature(surface: Surface, diameter: number): MachinableFeature {
    return {
      id: `hole_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'hole',
      confidence: 0.85,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: { diameter, depth: 10 },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: 10,
      accessibility: {
        topAccess: true,
        sideAccess: false,
        recommendedTool: 'drill',
        minimumToolDiameter: diameter * 0.8
      },
      machiningParameters: {
        stockToLeave: 0.05,
        requiredTolerance: 0.02,
        surfaceFinish: 'good'
      }
    };
  }

  private createPocketFeature(surface: Surface, type: string): MachinableFeature {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `pocket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'pocket',
      confidence: 0.8,
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
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'good'
      }
    };
  }

  private createSlotFeature(surface: Surface): MachinableFeature {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'slot',
      confidence: 0.75,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: { 
        length: Math.max(size.x, size.z),
        width: Math.min(size.x, size.z),
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
        minimumToolDiameter: Math.min(size.x, size.z) * 0.8
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'good'
      }
    };
  }

  private createStepFeature(surface: Surface): MachinableFeature {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'step',
      confidence: 0.7,
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
        minimumToolDiameter: 3
      },
      machiningParameters: {
        stockToLeave: 0.2,
        requiredTolerance: 0.1,
        surfaceFinish: 'good'
      }
    };
  }

  private createBossFeature(surface: Surface): MachinableFeature {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `boss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'boss',
      confidence: 0.65,
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
        minimumToolDiameter: 3
      },
      machiningParameters: {
        stockToLeave: 0.2,
        requiredTolerance: 0.1,
        surfaceFinish: 'good'
      }
    };
  }

  private createCounterboreFeature(surface: Surface): MachinableFeature {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `counterbore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'counterbore',
      confidence: 0.8,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: { 
        diameter: Math.min(size.x, size.z),
        depth: size.y || 3
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: size.y || 3,
      accessibility: {
        topAccess: true,
        sideAccess: false,
        recommendedTool: 'counterbore_tool',
        minimumToolDiameter: Math.min(size.x, size.z) * 0.9
      },
      machiningParameters: {
        stockToLeave: 0.05,
        requiredTolerance: 0.02,
        surfaceFinish: 'good'
      }
    };
  }

  private createFilletFeature(surface: Surface): MachinableFeature {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `fillet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'fillet',
      confidence: 0.6,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: { 
        radius: Math.min(size.x, size.y, size.z) / 2
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: Math.min(size.x, size.y, size.z),
      accessibility: {
        topAccess: true,
        sideAccess: true,
        recommendedTool: 'ball_endmill',
        minimumToolDiameter: Math.min(size.x, size.y, size.z)
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'excellent'
      }
    };
  }

  private validateFeatures(features: MachinableFeature[]): MachinableFeature[] {
    return features.filter(feature => {
      // Remove features that are too small
      const size = feature.boundingBox.getSize(new THREE.Vector3());
      const minDim = Math.min(size.x, size.y, size.z);
      
      if (minDim < this.minFeatureSize) return false;
      
      // Remove features with low confidence
      if (feature.confidence < 0.6) return false;
      
      // Remove features that are clearly wrong (e.g., holes larger than the part)
      const partSize = this.boundingBox.getSize(new THREE.Vector3());
      const maxPartDim = Math.max(partSize.x, partSize.y, partSize.z);
      
      if (feature.type === 'hole' && feature.dimensions.diameter > maxPartDim * 0.8) {
        return false;
      }
      
      return true;
    }).sort((a, b) => b.confidence - a.confidence);
  }

  private detectCompoundFeatures(features: MachinableFeature[]): MachinableFeature[] {
    const compoundFeatures: MachinableFeature[] = [];
    
    // Look for holes within pockets
    for (const pocket of features.filter(f => f.type === 'pocket')) {
      for (const hole of features.filter(f => f.type === 'hole')) {
        if (pocket.boundingBox.containsPoint(hole.position)) {
          // Create compound feature
          const compound: MachinableFeature = {
            ...pocket,
            id: `compound_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'pocket',
            confidence: Math.min(pocket.confidence, hole.confidence) + 0.1,
            dimensions: {
              ...pocket.dimensions,
              holeCount: 1,
              holeDiameter: hole.dimensions.diameter
            }
          };
          compoundFeatures.push(compound);
        }
      }
    }
    
    return compoundFeatures;
  }
}