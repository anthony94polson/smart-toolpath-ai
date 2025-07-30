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
  
  // Enhanced parameters for aggressive feature detection
  private minFeatureSize = 0.5; // Reduced to 0.5mm for fine detail detection
  private tolerance = 0.05; // Tighter tolerance for accuracy
  private normalTolerance = 0.85; // Less restrictive for better surface grouping
  private edgeAngleTolerance = Math.PI / 6; // 30 degrees for edge detection
  private curvatureTolerance = 0.1; // For detecting fillets and rounds
  
  // Multi-scale analysis parameters
  private scaleFactors = [1.0, 0.5, 0.25]; // Coarse, medium, fine analysis
  private confidenceThreshold = 0.3; // Lower threshold for more aggressive detection
  
  // Spatial indexing
  private spatialGrid: Map<string, Face[]> = new Map();
  private gridSize: number;
  
  // Edge and loop detection
  private edges: Edge[] = [];
  private edgeLoops: EdgeLoop[] = [];
  
  // User-adjustable sensitivity parameters
  public sensitivityParams = {
    featureSizeMultiplier: 1.0, // Adjust minimum feature size
    confidenceThreshold: 0.3, // Adjust detection aggressiveness  
    surfaceGroupingTolerance: 0.85, // Adjust surface reconstruction
    detectSmallFeatures: true, // Enable/disable small feature detection
    detectCompoundFeatures: true // Enable/disable compound feature detection
  };

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.geometry.computeBoundingBox();
    this.boundingBox = this.geometry.boundingBox!;
    
    const size = this.boundingBox.getSize(new THREE.Vector3());
    this.gridSize = Math.max(size.x, size.y, size.z) / 50; // Finer grid for better spatial indexing
    
    console.log('FastSTLAnalyzer: Starting enhanced multi-scale topology-aware analysis...');
    const startTime = performance.now();
    
    // Enhanced analysis pipeline
    this.extractFaces();
    this.buildSpatialIndex();
    this.extractEdges();
    this.detectEdgeLoops();
    this.extractSurfaces();
    this.analyzeCurvature();
    this.validateSurfaces();
    
    const endTime = performance.now();
    console.log(`FastSTLAnalyzer: Enhanced analysis completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`FastSTLAnalyzer: Found ${this.faces.length} faces, ${this.edges.length} edges, ${this.edgeLoops.length} loops, ${this.surfaces.length} surfaces`);
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

  private extractEdges(): void {
    // Extract edges from faces for topological analysis
    const edgeMap = new Map<string, Edge>();
    
    for (const face of this.faces) {
      for (let i = 0; i < face.vertices.length; i++) {
        const v1 = face.vertices[i];
        const v2 = face.vertices[(i + 1) % face.vertices.length];
        
        const edgeKey = this.getEdgeKey(v1, v2);
        const reverseKey = this.getEdgeKey(v2, v1);
        
        if (edgeMap.has(reverseKey)) {
          // This edge already exists from the other direction
          const existingEdge = edgeMap.get(reverseKey)!;
          existingEdge.face2 = face;
          existingEdge.angle = this.calculateDihedralAngle(existingEdge.face1, face);
          existingEdge.isSharp = Math.abs(existingEdge.angle) > this.edgeAngleTolerance;
        } else {
          // New edge
          const edge: Edge = {
            vertex1: v1,
            vertex2: v2,
            face1: face,
            face2: undefined,
            angle: 0,
            length: v1.distanceTo(v2),
            isSharp: false
          };
          edgeMap.set(edgeKey, edge);
        }
      }
    }
    
    this.edges = Array.from(edgeMap.values());
    console.log(`FastSTLAnalyzer: Extracted ${this.edges.length} edges`);
  }

  private detectEdgeLoops(): void {
    // Detect closed edge loops for hole and pocket detection
    const sharpEdges = this.edges.filter(edge => edge.isSharp);
    const visited = new Set<string>();
    
    for (const edge of sharpEdges) {
      const edgeKey = this.getEdgeKey(edge.vertex1, edge.vertex2);
      if (visited.has(edgeKey)) continue;
      
      const loop = this.traceEdgeLoop(edge, sharpEdges, visited);
      if (loop && loop.vertices.length >= 3) {
        this.edgeLoops.push(loop);
      }
    }
    
    console.log(`FastSTLAnalyzer: Detected ${this.edgeLoops.length} edge loops`);
  }

  private analyzeCurvature(): void {
    // Analyze surface curvature for fillet and round detection
    for (const surface of this.surfaces) {
      // Calculate local curvature for each face in the surface
      for (const face of surface.faces) {
        // Simple curvature estimation based on normal variation
        const neighborNormals = face.adjacentFaces.map(f => f.normal);
        if (neighborNormals.length > 0) {
          const avgDeviation = neighborNormals.reduce((sum, normal) =>
            sum + Math.acos(Math.max(-1, Math.min(1, face.normal.dot(normal)))), 0
          ) / neighborNormals.length;
          
          // Mark faces with high curvature
          if (avgDeviation > this.curvatureTolerance) {
            surface.type = 'complex'; // Indicates curved surface
          }
        }
      }
    }
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
    // Enhanced surface validation with multiple criteria
    const minFeatureSize = this.minFeatureSize * this.sensitivityParams.featureSizeMultiplier;
    
    this.surfaces = this.surfaces.filter(surface => {
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const minDim = Math.min(size.x, size.y, size.z);
      
      // Relaxed criteria for aggressive detection
      const sizeCheck = this.sensitivityParams.detectSmallFeatures ?
        maxDim >= minFeatureSize * 0.5 : maxDim >= minFeatureSize;
      
      const areaCheck = surface.area >= minFeatureSize * minFeatureSize * 0.25;
      const faceCountCheck = surface.faces.length >= 1;
      
      return sizeCheck && areaCheck && faceCountCheck;
    });

    // Sort by area (largest first) for priority processing
    this.surfaces.sort((a, b) => b.area - a.area);
    console.log(`FastSTLAnalyzer: Validated ${this.surfaces.length} surfaces for feature detection`);
  }

  public analyzeMachinableFeatures(): MachinableFeature[] {
    console.log('FastSTLAnalyzer: Starting enhanced multi-scale feature recognition...');
    const startTime = performance.now();
    
    const features: MachinableFeature[] = [];
    
    // Build topology relationships
    this.buildTopology();
    
    // Multi-scale feature detection for comprehensive coverage
    for (const scale of this.scaleFactors) {
      console.log(`FastSTLAnalyzer: Analyzing at scale ${scale}x...`);
      
      // Temporarily adjust parameters for this scale
      const originalMinSize = this.minFeatureSize;
      this.minFeatureSize = originalMinSize * scale;
      
      // Detect different feature types using enhanced topology-aware methods
      features.push(...this.detectHolesAdvanced());
      features.push(...this.detectPocketsAdvanced());
      features.push(...this.detectSlotsAdvanced());
      features.push(...this.detectCounterboredHoles());
      features.push(...this.detectCountersunkHoles());
      features.push(...this.detectTaperedHoles());
      features.push(...this.detectStepsAdvanced());
      features.push(...this.detectBossesAdvanced());
      features.push(...this.detectFilletsAdvanced());
      features.push(...this.detectIslands());
      
      // Restore original parameters
      this.minFeatureSize = originalMinSize;
    }
    
    // Remove duplicates and validate features
    const uniqueFeatures = this.removeDuplicateFeatures(features);
    const validatedFeatures = this.validateFeatures(uniqueFeatures);
    
    // Detect compound and nested features if enabled
    let compoundFeatures: MachinableFeature[] = [];
    if (this.sensitivityParams.detectCompoundFeatures) {
      compoundFeatures = this.detectCompoundFeatures(validatedFeatures);
    }
    
    const allFeatures = [...validatedFeatures, ...compoundFeatures];
    
    const endTime = performance.now();
    console.log(`FastSTLAnalyzer: Enhanced feature recognition completed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`FastSTLAnalyzer: Found ${allFeatures.length} validated features (${validatedFeatures.length} primary + ${compoundFeatures.length} compound)`);
    
    // Print detailed feature breakdown
    this.logFeatureBreakdown(allFeatures);
    
    return allFeatures;
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
    return face1.normal.dot(face2.normal) > this.sensitivityParams.surfaceGroupingTolerance;
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

  // Enhanced feature detection methods
  private detectHolesAdvanced(): MachinableFeature[] {
    const holes: MachinableFeature[] = [];
    
    // Detect holes using edge loops
    for (const loop of this.edgeLoops) {
      if (loop.isCircular && loop.isClosed && loop.radius) {
        const diameter = loop.radius * 2;
        
        // Check if it's a reasonable hole size
        if (diameter >= this.minFeatureSize && diameter <= 50) {
          const hole = this.createHoleFeature(loop, 'hole', 0.8);
          if (hole) holes.push(hole);
        }
      }
    }
    
    // Also detect holes from cylindrical surfaces
    for (const surface of this.surfaces) {
      if (surface.type === 'cylindrical') {
        const size = surface.boundingBox.getSize(new THREE.Vector3());
        const diameter = Math.min(size.x, size.z);
        
        if (diameter >= this.minFeatureSize && diameter <= 50) {
          const hole = this.createHoleFromSurface(surface, 'hole', 0.7);
          if (hole) holes.push(hole);
        }
      }
    }
    
    return holes;
  }

  private detectPocketsAdvanced(): MachinableFeature[] {
    const pockets: MachinableFeature[] = [];
    
    // Detect pockets by analyzing concave surfaces
    for (const surface of this.surfaces) {
      if (this.isConcaveSurface(surface)) {
        const pocket = this.createPocketFromSurface(surface);
        if (pocket) pockets.push(pocket);
      }
    }
    
    // Detect pockets from grouped horizontal surfaces with walls
    const horizontalSurfaces = this.surfaces.filter(s => this.isHorizontalSurface(s.normal));
    
    for (const surface of horizontalSurfaces) {
      const walls = this.findSurroundingWalls(surface);
      if (walls.length >= 3) { // Minimum walls for a pocket
        const pocket = this.createPocketFeature(surface, walls, 0.7);
        if (pocket) pockets.push(pocket);
      }
    }
    
    return pockets;
  }

  private detectSlotsAdvanced(): MachinableFeature[] {
    const slots: MachinableFeature[] = [];
    
    // Detect slots by looking for elongated rectangular cavities
    for (const surface of this.surfaces) {
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      const aspectRatio = Math.max(size.x, size.z) / Math.min(size.x, size.z);
      
      // Slots are typically elongated
      if (aspectRatio > 2.5 && this.isConcaveSurface(surface)) {
        const slot = this.createSlotFeature(surface, 0.7);
        if (slot) slots.push(slot);
      }
    }
    
    return slots;
  }

  private detectCounterboredHoles(): MachinableFeature[] {
    const counterbores: MachinableFeature[] = [];
    
    // Look for nested circular features
    for (let i = 0; i < this.edgeLoops.length; i++) {
      const outerLoop = this.edgeLoops[i];
      if (!outerLoop.isCircular || !outerLoop.radius) continue;
      
      for (let j = i + 1; j < this.edgeLoops.length; j++) {
        const innerLoop = this.edgeLoops[j];
        if (!innerLoop.isCircular || !innerLoop.radius) continue;
        
        // Check if one loop is inside the other
        if (this.isLoopInsideLoop(innerLoop, outerLoop)) {
          const counterbore = this.createCounterboreFeature(outerLoop, innerLoop, 0.8);
          if (counterbore) counterbores.push(counterbore);
        }
      }
    }
    return counterbores;
  }

  private detectCountersunkHoles(): MachinableFeature[] {
    const countersinks: MachinableFeature[] = [];
    
    // Look for conical surfaces with holes
    for (const surface of this.surfaces) {
      if (surface.type === 'complex') {
        // Check for conical geometry
        const conicality = this.analyzeSurfaceConicality(surface);
        if (conicality > 0.5) { // Indicates conical surface
          const countersink = this.createCountersinkFeature(surface, 0.7);
          if (countersink) countersinks.push(countersink);
        }
      }
    }
    return countersinks;
  }

  private detectTaperedHoles(): MachinableFeature[] {
    const taperedHoles: MachinableFeature[] = [];
    
    // Look for holes with varying diameter
    for (const surface of this.surfaces) {
      if (surface.type === 'cylindrical') {
        const tapering = this.analyzeSurfaceTapering(surface);
        if (tapering > this.tolerance * 5) {
          const taperedHole = this.createTaperedHoleFeature(surface, 0.6);
          if (taperedHole) taperedHoles.push(taperedHole);
        }
      }
    }
    return taperedHoles;
  }

  private detectStepsAdvanced(): MachinableFeature[] {
    const steps: MachinableFeature[] = [];
    
    // Detect steps by analyzing height changes
    const verticalSurfaces = this.surfaces.filter(s => this.isVerticalSurface(s.normal));
    
    for (const surface of verticalSurfaces) {
      const size = surface.boundingBox.getSize(new THREE.Vector3());
      
      if (size.y > this.minFeatureSize * 2) {
        const step = this.createStepFeature(surface, 0.6);
        if (step) steps.push(step);
      }
    }
    return steps;
  }

  private detectBossesAdvanced(): MachinableFeature[] {
    const bosses: MachinableFeature[] = [];
    
    // Detect bosses as convex protrusions
    for (const surface of this.surfaces) {
      if (this.isConvexSurface(surface)) {
        const size = surface.boundingBox.getSize(new THREE.Vector3());
        
        if (size.y > this.minFeatureSize) {
          const boss = this.createBossFeature(surface, 0.6);
          if (boss) bosses.push(boss);
        }
      }
    }
    return bosses;
  }

  private detectFilletsAdvanced(): MachinableFeature[] {
    const fillets: MachinableFeature[] = [];
    
    // Detect fillets from curved surfaces
    for (const surface of this.surfaces) {
      if (surface.type === 'complex') {
        const curvature = this.analyzeSurfaceCurvature(surface);
        
        if (curvature > this.curvatureTolerance && curvature < 1.0) {
          const fillet = this.createFilletFeature(surface, 0.5);
          if (fillet) fillets.push(fillet);
        }
      }
    }
    return fillets;
  }

  private detectIslands(): MachinableFeature[] {
    const islands: MachinableFeature[] = [];
    
    // Detect isolated raised features
    for (const surface of this.surfaces) {
      if (this.isIsolatedSurface(surface)) {
        const island = this.createIslandFeature(surface, 0.5);
        if (island) islands.push(island);
      }
    }
    return islands;
  }

  // Helper methods for feature detection
  private getEdgeKey(v1: THREE.Vector3, v2: THREE.Vector3): string {
    const key1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)},${v1.z.toFixed(6)}`;
    const key2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)},${v2.z.toFixed(6)}`;
    return key1 < key2 ? `${key1}-${key2}` : `${key2}-${key1}`;
  }

  private calculateDihedralAngle(face1: Face, face2: Face): number {
    return Math.acos(Math.max(-1, Math.min(1, face1.normal.dot(face2.normal))));
  }

  private traceEdgeLoop(startEdge: Edge, edges: Edge[], visited: Set<string>): EdgeLoop | null {
    const loopVertices: THREE.Vector3[] = [];
    const loopEdges: Edge[] = [];
    let currentVertex = startEdge.vertex2;
    const startVertex = startEdge.vertex1;
    
    loopVertices.push(startVertex.clone());
    loopEdges.push(startEdge);
    visited.add(this.getEdgeKey(startEdge.vertex1, startEdge.vertex2));
    
    while (loopVertices.length < 100) { // Prevent infinite loops
      let nextEdge: Edge | null = null;
      
      for (const edge of edges) {
        const edgeKey = this.getEdgeKey(edge.vertex1, edge.vertex2);
        if (visited.has(edgeKey)) continue;
        
        if (edge.vertex1.distanceTo(currentVertex) < this.tolerance) {
          nextEdge = edge;
          currentVertex = edge.vertex2;
          break;
        } else if (edge.vertex2.distanceTo(currentVertex) < this.tolerance) {
          nextEdge = edge;
          currentVertex = edge.vertex1;
          break;
        }
      }
      
      if (!nextEdge) break;
      
      visited.add(this.getEdgeKey(nextEdge.vertex1, nextEdge.vertex2));
      loopVertices.push(currentVertex.clone());
      loopEdges.push(nextEdge);
      
      // Check if we've closed the loop
      if (currentVertex.distanceTo(startVertex) < this.tolerance) {
        // Calculate loop properties
        const center = this.calculateLoopCenter(loopVertices);
        const radius = this.calculateLoopRadius(loopVertices, center);
        const isCircular = this.isLoopCircular(loopVertices, center, radius);
        
        return {
          vertices: loopVertices,
          edges: loopEdges,
          isClosed: true,
          center,
          radius,
          isCircular,
          confidence: isCircular ? 0.9 : 0.6
        };
      }
    }
    return null;
  }

  private calculateLoopCenter(vertices: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    for (const vertex of vertices) {
      center.add(vertex);
    }
    return center.divideScalar(vertices.length);
  }

  private calculateLoopRadius(vertices: THREE.Vector3[], center: THREE.Vector3): number {
    let totalDistance = 0;
    for (const vertex of vertices) {
      totalDistance += vertex.distanceTo(center);
    }
    return totalDistance / vertices.length;
  }

  private isLoopCircular(vertices: THREE.Vector3[], center: THREE.Vector3, radius: number): boolean {
    const tolerance = radius * 0.1; // 10% tolerance
    
    for (const vertex of vertices) {
      const distance = vertex.distanceTo(center);
      if (Math.abs(distance - radius) > tolerance) {
        return false;
      }
    }
    
    return true;
  }

  // Surface analysis methods
  private isHorizontalSurface(normal: THREE.Vector3): boolean {
    return Math.abs(normal.y) > 0.8;
  }

  private isVerticalSurface(normal: THREE.Vector3): boolean {
    return Math.abs(normal.y) < 0.3;
  }

  private isConcaveSurface(surface: Surface): boolean {
    // Simplified concavity check - could be enhanced
    return surface.center.y < surface.boundingBox.min.y + (surface.boundingBox.max.y - surface.boundingBox.min.y) * 0.3;
  }

  private isConvexSurface(surface: Surface): boolean {
    // Simplified convexity check - could be enhanced
    return surface.center.y > surface.boundingBox.min.y + (surface.boundingBox.max.y - surface.boundingBox.min.y) * 0.7;
  }

  private isIsolatedSurface(surface: Surface): boolean {
    // Check if surface is isolated from others
    const minDistance = this.minFeatureSize * 2;
    
    for (const otherSurface of this.surfaces) {
      if (otherSurface === surface) continue;
      
      if (surface.center.distanceTo(otherSurface.center) < minDistance) {
        return false;
      }
    }
    
    return true;
  }

  private findSurroundingWalls(surface: Surface): Surface[] {
    const walls: Surface[] = [];
    const surfaceZ = surface.center.y;
    
    for (const otherSurface of this.surfaces) {
      if (otherSurface === surface) continue;
      
      // Check if it's a potential wall (vertical and at similar height)
      if (this.isVerticalSurface(otherSurface.normal) && 
          Math.abs(otherSurface.center.y - surfaceZ) < this.minFeatureSize) {
        walls.push(otherSurface);
      }
    }
    return walls;
  }

  private isLoopInsideLoop(innerLoop: EdgeLoop, outerLoop: EdgeLoop): boolean {
    if (!innerLoop.radius || !outerLoop.radius) return false;
    
    const distance = innerLoop.center.distanceTo(outerLoop.center);
    return distance + innerLoop.radius < outerLoop.radius;
  }

  private analyzeSurfaceConicality(surface: Surface): number {
    // Simplified conical analysis
    return 0.3; // Placeholder
  }

  private analyzeSurfaceTapering(surface: Surface): number {
    // Simplified tapering analysis
    return 0.1; // Placeholder
  }

  private analyzeSurfaceCurvature(surface: Surface): number {
    // Calculate average curvature of the surface
    let totalCurvature = 0;
    let count = 0;
    
    for (const face of surface.faces) {
      const neighborNormals = face.adjacentFaces.map(f => f.normal);
      if (neighborNormals.length > 0) {
        const avgDeviation = neighborNormals.reduce((sum, normal) =>
          sum + Math.acos(Math.max(-1, Math.min(1, face.normal.dot(normal)))), 0
        ) / neighborNormals.length;
        
        totalCurvature += avgDeviation;
        count++;
      }
    }
    return count > 0 ? totalCurvature / count : 0;
  }

  // Feature creation methods
  private createHoleFeature(loop: EdgeLoop, type: 'hole' | 'counterbore' | 'countersink' | 'taper_hole', confidence: number): MachinableFeature | null {
    if (!loop.radius) return null;
    
    const diameter = loop.radius * 2;
    
    return {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      confidence,
      faces: [],
      edges: loop.edges,
      loops: [loop],
      dimensions: {
        diameter,
        depth: 10 // Estimated depth
      },
      position: loop.center,
      normal: new THREE.Vector3(0, -1, 0), // Assuming downward drilling
      boundingBox: new THREE.Box3().setFromCenterAndSize(loop.center, new THREE.Vector3(diameter, 10, diameter)),
      depth: 10,
      accessibility: {
        topAccess: true,
        sideAccess: false,
        recommendedTool: type === 'hole' ? 'drill' : 'endmill',
        minimumToolDiameter: diameter * 0.8
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'good'
      }
    };
  }

  private createHoleFromSurface(surface: Surface, type: 'hole', confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    const diameter = Math.min(size.x, size.z);
    
    return {
      id: `${type}_surf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        diameter,
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
        minimumToolDiameter: diameter * 0.8
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'good'
      }
    };
  }

  private createPocketFromSurface(surface: Surface): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
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
  }

  private createPocketFeature(surface: Surface, walls: Surface[], confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `pocket_walled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'pocket',
      confidence,
      faces: [...surface.faces, ...walls.flatMap(w => w.faces)],
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
  }

  private createSlotFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `slot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'slot',
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        width: Math.min(size.x, size.z),
        length: Math.max(size.x, size.z),
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
        stockToLeave: 0.2,
        requiredTolerance: 0.1,
        surfaceFinish: 'good'
      }
    };
  }

  private createCounterboreFeature(outerLoop: EdgeLoop, innerLoop: EdgeLoop, confidence: number): MachinableFeature | null {
    if (!outerLoop.radius || !innerLoop.radius) return null;
    
    return {
      id: `counterbore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'counterbore',
      confidence,
      faces: [],
      edges: [...outerLoop.edges, ...innerLoop.edges],
      loops: [outerLoop, innerLoop],
      dimensions: {
        outerDiameter: outerLoop.radius * 2,
        innerDiameter: innerLoop.radius * 2,
        depth: 5 // Estimated
      },
      position: outerLoop.center,
      normal: new THREE.Vector3(0, -1, 0),
      boundingBox: new THREE.Box3().setFromCenterAndSize(outerLoop.center, new THREE.Vector3(outerLoop.radius * 2, 5, outerLoop.radius * 2)),
      depth: 5,
      accessibility: {
        topAccess: true,
        sideAccess: false,
        recommendedTool: 'endmill',
        minimumToolDiameter: innerLoop.radius * 1.6
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'good'
      }
    };
  }

  private createCountersinkFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    const diameter = Math.min(size.x, size.z);
    
    return {
      id: `countersink_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'countersink',
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        diameter,
        angle: 82, // Standard countersink angle
        depth: 2
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: 2,
      accessibility: {
        topAccess: true,
        sideAccess: false,
        recommendedTool: 'countersink',
        minimumToolDiameter: diameter * 0.5
      },
      machiningParameters: {
        stockToLeave: 0.05,
        requiredTolerance: 0.02,
        surfaceFinish: 'excellent'
      }
    };
  }

  private createTaperedHoleFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    const diameter = Math.min(size.x, size.z);
    
    return {
      id: `taper_hole_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'taper_hole',
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        topDiameter: diameter,
        bottomDiameter: diameter * 0.8,
        depth: size.y || 10
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: size.y || 10,
      accessibility: {
        topAccess: true,
        sideAccess: false,
        recommendedTool: 'taper_drill',
        minimumToolDiameter: diameter * 0.6
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'good'
      }
    };
  }

  private createStepFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'step',
      confidence,
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
        minimumToolDiameter: Math.min(size.x, size.z) * 0.1
      },
      machiningParameters: {
        stockToLeave: 0.2,
        requiredTolerance: 0.1,
        surfaceFinish: 'good'
      }
    };
  }

  private createBossFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `boss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'boss',
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        width: size.x,
        length: size.z,
        height: size.y
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: size.y,
      accessibility: {
        topAccess: false,
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
  }

  private createFilletFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    const radius = Math.min(size.x, size.y, size.z) / 2;
    
    return {
      id: `fillet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'fillet',
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        radius,
        length: Math.max(size.x, size.z)
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: radius,
      accessibility: {
        topAccess: false,
        sideAccess: true,
        recommendedTool: 'ball_endmill',
        minimumToolDiameter: radius
      },
      machiningParameters: {
        stockToLeave: 0.1,
        requiredTolerance: 0.05,
        surfaceFinish: 'excellent'
      }
    };
  }

  private createIslandFeature(surface: Surface, confidence: number): MachinableFeature | null {
    const size = surface.boundingBox.getSize(new THREE.Vector3());
    
    return {
      id: `island_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'island',
      confidence,
      faces: surface.faces,
      edges: [],
      loops: [],
      dimensions: {
        width: size.x,
        length: size.z,
        height: size.y
      },
      position: surface.center,
      normal: surface.normal,
      boundingBox: surface.boundingBox,
      depth: size.y,
      accessibility: {
        topAccess: false,
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

  private removeDuplicateFeatures(features: MachinableFeature[]): MachinableFeature[] {
    const unique: MachinableFeature[] = [];
    const tolerance = this.minFeatureSize;
    
    for (const feature of features) {
      let isDuplicate = false;
      
      for (const existing of unique) {
        if (feature.type === existing.type && 
            feature.position.distanceTo(existing.position) < tolerance) {
          // Keep the one with higher confidence
          if (feature.confidence > existing.confidence) {
            const index = unique.indexOf(existing);
            unique[index] = feature;
          }
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        unique.push(feature);
      }
    }
    
    return unique;
  }

  private validateFeatures(features: MachinableFeature[]): MachinableFeature[] {
    return features.filter(feature => {
      // Apply confidence threshold
      if (feature.confidence < this.sensitivityParams.confidenceThreshold) {
        return false;
      }
      
      // Check minimum size requirements
      const size = feature.boundingBox.getSize(new THREE.Vector3());
      const minDim = Math.min(size.x, size.y, size.z);
      const minFeatureSize = this.minFeatureSize * this.sensitivityParams.featureSizeMultiplier;
      
      if (minDim < minFeatureSize * 0.5) {
        return false;
      }
      
      return true;
    });
  }

  private detectCompoundFeatures(features: MachinableFeature[]): MachinableFeature[] {
    const compounds: MachinableFeature[] = [];
    
    // Detect holes within pockets
    const holes = features.filter(f => f.type === 'hole');
    const pockets = features.filter(f => f.type === 'pocket');
    
    for (const pocket of pockets) {
      const containedHoles = holes.filter(hole => 
        pocket.boundingBox.containsPoint(hole.position)
      );
      
      if (containedHoles.length > 0) {
        // Create compound pocket-with-holes feature
        const compound: MachinableFeature = {
          ...pocket,
          id: `compound_pocket_holes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          confidence: Math.min(pocket.confidence, ...containedHoles.map(h => h.confidence)),
          faces: [...pocket.faces, ...containedHoles.flatMap(h => h.faces)],
          loops: [...pocket.loops, ...containedHoles.flatMap(h => h.loops)]
        };
        
        compounds.push(compound);
      }
    }
    return compounds;
  }

  private logFeatureBreakdown(features: MachinableFeature[]): void {
    const breakdown = new Map<string, number>();
    
    for (const feature of features) {
      const count = breakdown.get(feature.type) || 0;
      breakdown.set(feature.type, count + 1);
    }
    
    console.log('FastSTLAnalyzer: Feature Detection Results:');
    breakdown.forEach((count, type) => {
      console.log(`  ${type}: ${count} features`);
    });
  }

  private detectHoles(): MachinableFeature[] {
    return []; // Replaced by detectHolesAdvanced
  }

  private detectPockets(): MachinableFeature[] {
    return []; // Replaced by detectPocketsAdvanced
  }

  private detectSlots(): MachinableFeature[] {
    return []; // Replaced by detectSlotsAdvanced
  }

  private detectSteps(): MachinableFeature[] {
    return []; // Replaced by detectStepsAdvanced
  }

  private detectBosses(): MachinableFeature[] {
    return []; // Replaced by detectBossesAdvanced
  }

  private detectCounterbores(): MachinableFeature[] {
    return []; // Replaced by detectCounterboredHoles
  }

  private detectFillets(): MachinableFeature[] {
    return []; // Replaced by detectFilletsAdvanced
  }
}
