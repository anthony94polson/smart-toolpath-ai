import * as THREE from 'three';

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
  type: 'hole' | 'pocket' | 'slot' | 'chamfer' | 'step' | 'boss' | 'rib';
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

export class AdvancedSTLAnalyzer {
  private geometry: THREE.BufferGeometry;
  private faces: Face[] = [];
  private edges: Edge[] = [];
  private vertices: THREE.Vector3[] = [];
  private tolerance = 0.001;

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.extractGeometricData();
    this.buildTopology();
  }

  private extractGeometricData(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const indices = this.geometry.index?.array;

    // Extract vertices
    this.vertices = [];
    for (let i = 0; i < positions.length; i += 3) {
      this.vertices.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }

    // Extract faces with proper topology
    this.faces = [];
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = this.vertices[indices[i]];
        const v2 = this.vertices[indices[i + 1]];
        const v3 = this.vertices[indices[i + 2]];
        const face = this.createFace([v1, v2, v3], this.faces.length);
        if (face) this.faces.push(face);
      }
    } else {
      for (let i = 0; i < this.vertices.length; i += 3) {
        const face = this.createFace([this.vertices[i], this.vertices[i + 1], this.vertices[i + 2]], this.faces.length);
        if (face) this.faces.push(face);
      }
    }
  }

  private createFace(vertices: THREE.Vector3[], id: number): Face | null {
    if (vertices.length !== 3) return null;

    const edge1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
    const edge2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    if (normal.length() === 0) return null; // Degenerate triangle

    const centroid = new THREE.Vector3()
      .add(vertices[0])
      .add(vertices[1])
      .add(vertices[2])
      .divideScalar(3);

    const area = edge1.cross(edge2.clone()).length() / 2;

    return {
      vertices: [...vertices],
      normal: normal.clone(),
      centroid: centroid.clone(),
      area,
      adjacentFaces: [],
      id
    };
  }

  private buildTopology(): void {
    // Build face adjacency relationships
    for (let i = 0; i < this.faces.length; i++) {
      for (let j = i + 1; j < this.faces.length; j++) {
        if (this.facesShareEdge(this.faces[i], this.faces[j])) {
          this.faces[i].adjacentFaces.push(this.faces[j]);
          this.faces[j].adjacentFaces.push(this.faces[i]);
        }
      }
    }

    // Extract edges with proper topology
    this.edges = this.extractEdges();
  }

  private facesShareEdge(face1: Face, face2: Face): boolean {
    let sharedVertices = 0;
    for (const v1 of face1.vertices) {
      for (const v2 of face2.vertices) {
        if (v1.distanceTo(v2) < this.tolerance) {
          sharedVertices++;
          break;
        }
      }
    }
    return sharedVertices >= 2;
  }

  private extractEdges(): Edge[] {
    const edges: Edge[] = [];
    const processedPairs = new Set<string>();

    for (const face of this.faces) {
      for (const adjacentFace of face.adjacentFaces) {
        const pairKey = `${Math.min(face.id, adjacentFace.id)}-${Math.max(face.id, adjacentFace.id)}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const sharedVertices = this.getSharedVertices(face, adjacentFace);
        if (sharedVertices.length === 2) {
          const angle = Math.acos(Math.max(-1, Math.min(1, face.normal.dot(adjacentFace.normal))));
          const edge: Edge = {
            vertex1: sharedVertices[0],
            vertex2: sharedVertices[1],
            face1: face,
            face2: adjacentFace,
            angle,
            length: sharedVertices[0].distanceTo(sharedVertices[1]),
            isSharp: angle > Math.PI / 6 // More than 30 degrees
          };
          edges.push(edge);
        }
      }
    }

    return edges;
  }

  private getSharedVertices(face1: Face, face2: Face): THREE.Vector3[] {
    const shared: THREE.Vector3[] = [];
    for (const v1 of face1.vertices) {
      for (const v2 of face2.vertices) {
        if (v1.distanceTo(v2) < this.tolerance) {
          shared.push(v1);
          break;
        }
      }
    }
    return shared;
  }

  public analyzeMachinableFeatures(): MachinableFeature[] {
    const features: MachinableFeature[] = [];
    
    // Detect different types of features
    features.push(...this.detectHoles());
    features.push(...this.detectPockets());
    features.push(...this.detectSlots());
    features.push(...this.detectChamfers());
    features.push(...this.detectSteps());
    features.push(...this.detectBosses());
    features.push(...this.detectRibs());

    return features.filter(f => f.confidence > 0.7);
  }

  private detectHoles(): MachinableFeature[] {
    const holes: MachinableFeature[] = [];
    const circularLoops = this.findCircularEdgeLoops();

    for (const loop of circularLoops) {
      if (!loop.isCircular || !loop.radius) continue;

      const diameter = loop.radius * 2;
      if (diameter < 1 || diameter > 100) continue;

      // Find hole depth by analyzing surrounding faces
      const depth = this.calculateHoleDepth(loop);
      const confidence = this.calculateHoleConfidence(loop, diameter, depth);

      if (confidence > 0.8) {
        holes.push({
          id: `HOLE_${holes.length + 1}`,
          type: 'hole',
          confidence,
          faces: this.getFacesAroundLoop(loop),
          edges: loop.edges,
          loops: [loop],
          dimensions: { diameter, depth },
          position: loop.center,
          normal: this.calculateHoleAxis(loop),
          boundingBox: this.calculateLoopBoundingBox(loop),
          depth,
          accessibility: {
            topAccess: true,
            sideAccess: false,
            recommendedTool: diameter < 3 ? 'micro_drill' : 'standard_drill',
            minimumToolDiameter: Math.min(diameter * 0.9, diameter - 0.1)
          },
          machiningParameters: {
            stockToLeave: 0,
            requiredTolerance: 0.05,
            surfaceFinish: 'standard'
          }
        });
      }
    }

    return holes;
  }

  private detectPockets(): MachinableFeature[] {
    const pockets: MachinableFeature[] = [];
    const horizontalFaces = this.getHorizontalFaces();

    for (const face of horizontalFaces) {
      const surroundingHeight = this.getAverageSurroundingHeight(face);
      const depth = surroundingHeight - face.centroid.z;

      if (depth > 1 && depth < 50) {
        const boundary = this.extractFaceBoundary(face);
        const dimensions = this.calculatePocketDimensions(boundary);
        const confidence = this.calculatePocketConfidence(face, depth, dimensions);

        if (confidence > 0.7) {
          pockets.push({
            id: `POCKET_${pockets.length + 1}`,
            type: 'pocket',
            confidence,
            faces: [face, ...this.getAdjacentVerticalFaces(face)],
            edges: this.getEdgesAroundFace(face),
            loops: [{ vertices: boundary, edges: [], isClosed: true, center: face.centroid, confidence: 0.9 }],
            dimensions: { ...dimensions, depth },
            position: face.centroid,
            normal: face.normal,
            boundingBox: this.calculateFaceBoundingBox(face),
            depth,
            accessibility: {
              topAccess: true,
              sideAccess: false,
              recommendedTool: 'end_mill',
              minimumToolDiameter: Math.min(dimensions.width, dimensions.length) * 0.1
            },
            machiningParameters: {
              stockToLeave: 0.2,
              requiredTolerance: 0.1,
              surfaceFinish: 'good'
            }
          });
        }
      }
    }

    return pockets;
  }

  private detectSlots(): MachinableFeature[] {
    const slots: MachinableFeature[] = [];
    const horizontalFaces = this.getHorizontalFaces();

    for (const face of horizontalFaces) {
      const boundary = this.extractFaceBoundary(face);
      const aspectRatio = this.calculateAspectRatio(boundary);

      // Slots have high aspect ratio (length >> width)
      if (aspectRatio > 3) {
        const depth = this.getAverageSurroundingHeight(face) - face.centroid.z;
        
        if (depth > 1) {
          const dimensions = this.calculateSlotDimensions(boundary, aspectRatio);
          const confidence = this.calculateSlotConfidence(face, aspectRatio, depth);

          if (confidence > 0.75) {
            slots.push({
              id: `SLOT_${slots.length + 1}`,
              type: 'slot',
              confidence,
              faces: [face, ...this.getAdjacentVerticalFaces(face)],
              edges: this.getEdgesAroundFace(face),
              loops: [{ vertices: boundary, edges: [], isClosed: true, center: face.centroid, confidence: 0.8 }],
              dimensions: { ...dimensions, depth },
              position: face.centroid,
              normal: face.normal,
              boundingBox: this.calculateFaceBoundingBox(face),
              depth,
              accessibility: {
                topAccess: true,
                sideAccess: true,
                recommendedTool: 'end_mill',
                minimumToolDiameter: dimensions.width * 0.8
              },
              machiningParameters: {
                stockToLeave: 0.1,
                requiredTolerance: 0.05,
                surfaceFinish: 'good'
              }
            });
          }
        }
      }
    }

    return slots;
  }

  private detectChamfers(): MachinableFeature[] {
    const chamfers: MachinableFeature[] = [];
    const angledFaces = this.getAngledFaces();

    for (const face of angledFaces) {
      const angle = Math.acos(Math.abs(face.normal.z));
      const chamferAngle = Math.PI / 4; // 45 degrees

      if (Math.abs(angle - chamferAngle) < Math.PI / 12) { // Within 15 degrees of 45°
        const width = this.calculateChamferWidth(face);
        const confidence = this.calculateChamferConfidence(face, angle);

        if (confidence > 0.8 && width > 0.5 && width < 10) {
          chamfers.push({
            id: `CHAMFER_${chamfers.length + 1}`,
            type: 'chamfer',
            confidence,
            faces: [face],
            edges: this.getEdgesAroundFace(face),
            loops: [],
            dimensions: { width, angle: angle * 180 / Math.PI },
            position: face.centroid,
            normal: face.normal,
            boundingBox: this.calculateFaceBoundingBox(face),
            depth: width,
            accessibility: {
              topAccess: true,
              sideAccess: true,
              recommendedTool: 'chamfer_mill',
              minimumToolDiameter: width * 2
            },
            machiningParameters: {
              stockToLeave: 0,
              requiredTolerance: 0.02,
              surfaceFinish: 'excellent'
            }
          });
        }
      }
    }

    return chamfers;
  }

  private detectSteps(): MachinableFeature[] {
    const steps: MachinableFeature[] = [];
    const horizontalFaces = this.getHorizontalFaces();

    for (let i = 0; i < horizontalFaces.length; i++) {
      for (let j = i + 1; j < horizontalFaces.length; j++) {
        const face1 = horizontalFaces[i];
        const face2 = horizontalFaces[j];
        
        const heightDiff = Math.abs(face1.centroid.z - face2.centroid.z);
        const horizontalDistance = new THREE.Vector2(face1.centroid.x, face1.centroid.y)
          .distanceTo(new THREE.Vector2(face2.centroid.x, face2.centroid.y));

        // Check if faces are at different heights but aligned horizontally
        if (heightDiff > 2 && heightDiff < 50 && horizontalDistance < heightDiff * 0.5) {
          const upperFace = face1.centroid.z > face2.centroid.z ? face1 : face2;
          const lowerFace = face1.centroid.z > face2.centroid.z ? face2 : face1;
          
          const stepHeight = upperFace.centroid.z - lowerFace.centroid.z;
          const confidence = this.calculateStepConfidence(upperFace, lowerFace, stepHeight);

          if (confidence > 0.7) {
            const dimensions = this.calculateStepDimensions(upperFace, lowerFace);
            
            steps.push({
              id: `STEP_${steps.length + 1}`,
              type: 'step',
              confidence,
              faces: [upperFace, lowerFace],
              edges: [],
              loops: [],
              dimensions: { ...dimensions, height: stepHeight },
              position: lowerFace.centroid,
              normal: new THREE.Vector3(0, 0, 1),
              boundingBox: this.calculateStepBoundingBox(upperFace, lowerFace),
              depth: stepHeight,
              accessibility: {
                topAccess: true,
                sideAccess: true,
                recommendedTool: 'end_mill',
                minimumToolDiameter: Math.min(dimensions.width, dimensions.length) * 0.1
              },
              machiningParameters: {
                stockToLeave: 0.2,
                requiredTolerance: 0.1,
                surfaceFinish: 'good'
              }
            });
          }
        }
      }
    }

    return steps;
  }

  private detectBosses(): MachinableFeature[] {
    const bosses: MachinableFeature[] = [];
    const horizontalFaces = this.getHorizontalFaces();

    for (const face of horizontalFaces) {
      const surroundingHeight = this.getAverageSurroundingHeight(face);
      const height = face.centroid.z - surroundingHeight;

      // Boss is raised above surrounding material
      if (height > 2 && height < 30) {
        const boundary = this.extractFaceBoundary(face);
        const dimensions = this.calculateBossDimensions(boundary);
        const confidence = this.calculateBossConfidence(face, height, dimensions);

        if (confidence > 0.75) {
          bosses.push({
            id: `BOSS_${bosses.length + 1}`,
            type: 'boss',
            confidence,
            faces: [face, ...this.getAdjacentVerticalFaces(face)],
            edges: this.getEdgesAroundFace(face),
            loops: [{ vertices: boundary, edges: [], isClosed: true, center: face.centroid, confidence: 0.8 }],
            dimensions: { ...dimensions, height },
            position: face.centroid,
            normal: face.normal,
            boundingBox: this.calculateFaceBoundingBox(face),
            depth: height,
            accessibility: {
              topAccess: false,
              sideAccess: true,
              recommendedTool: 'end_mill',
              minimumToolDiameter: Math.min(dimensions.width, dimensions.length) * 0.05
            },
            machiningParameters: {
              stockToLeave: 0.1,
              requiredTolerance: 0.05,
              surfaceFinish: 'excellent'
            }
          });
        }
      }
    }

    return bosses;
  }

  private detectRibs(): MachinableFeature[] {
    const ribs: MachinableFeature[] = [];
    const verticalFaces = this.getVerticalFaces();

    for (const face of verticalFaces) {
      const boundary = this.extractFaceBoundary(face);
      const aspectRatio = this.calculateAspectRatio(boundary);

      // Ribs are long, thin vertical features
      if (aspectRatio > 5) {
        const dimensions = this.calculateRibDimensions(boundary);
        const confidence = this.calculateRibConfidence(face, aspectRatio, dimensions);

        if (confidence > 0.8 && dimensions.thickness > 1 && dimensions.thickness < 10) {
          ribs.push({
            id: `RIB_${ribs.length + 1}`,
            type: 'rib',
            confidence,
            faces: [face],
            edges: this.getEdgesAroundFace(face),
            loops: [],
            dimensions,
            position: face.centroid,
            normal: face.normal,
            boundingBox: this.calculateFaceBoundingBox(face),
            depth: dimensions.height,
            accessibility: {
              topAccess: false,
              sideAccess: true,
              recommendedTool: 'end_mill',
              minimumToolDiameter: dimensions.thickness * 0.3
            },
            machiningParameters: {
              stockToLeave: 0.05,
              requiredTolerance: 0.02,
              surfaceFinish: 'excellent'
            }
          });
        }
      }
    }

    return ribs;
  }

  // Helper methods for feature analysis
  private findCircularEdgeLoops(): EdgeLoop[] {
    const loops: EdgeLoop[] = [];
    const processedEdges = new Set<Edge>();

    for (const edge of this.edges) {
      if (processedEdges.has(edge)) continue;

      const loop = this.traceEdgeLoop(edge, processedEdges);
      if (loop && loop.vertices.length > 6) {
        const circularData = this.analyzeCircularity(loop);
        loop.isCircular = circularData.isCircular;
        loop.radius = circularData.radius;
        loop.confidence = circularData.confidence;
        
        if (loop.isCircular && loop.confidence > 0.8) {
          loops.push(loop);
        }
      }
    }

    return loops;
  }

  private traceEdgeLoop(startEdge: Edge, processedEdges: Set<Edge>): EdgeLoop | null {
    const vertices: THREE.Vector3[] = [];
    const edges: Edge[] = [];
    let currentEdge = startEdge;
    let currentVertex = startEdge.vertex1;

    do {
      vertices.push(currentVertex.clone());
      edges.push(currentEdge);
      processedEdges.add(currentEdge);

      // Find next edge
      const nextVertex = currentEdge.vertex1.equals(currentVertex) ? currentEdge.vertex2 : currentEdge.vertex1;
      const nextEdge = this.findConnectedEdge(nextVertex, currentEdge, processedEdges);
      
      if (!nextEdge) break;
      
      currentVertex = nextVertex;
      currentEdge = nextEdge;
    } while (currentEdge !== startEdge && edges.length < 1000);

    const isClosed = vertices.length > 2 && vertices[0].distanceTo(vertices[vertices.length - 1]) < this.tolerance;
    
    if (!isClosed || vertices.length < 4) return null;

    const center = vertices.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vertices.length);

    return {
      vertices,
      edges,
      isClosed,
      center,
      confidence: 0.5
    };
  }

  private findConnectedEdge(vertex: THREE.Vector3, excludeEdge: Edge, processedEdges: Set<Edge>): Edge | null {
    for (const edge of this.edges) {
      if (edge === excludeEdge || processedEdges.has(edge)) continue;
      
      if (edge.vertex1.distanceTo(vertex) < this.tolerance || edge.vertex2.distanceTo(vertex) < this.tolerance) {
        return edge;
      }
    }
    return null;
  }

  private analyzeCircularity(loop: EdgeLoop): { isCircular: boolean; radius: number; confidence: number } {
    const center = loop.center;
    const distances = loop.vertices.map(v => v.distanceTo(center));
    const avgRadius = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((acc, d) => acc + Math.pow(d - avgRadius, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    
    const circularityScore = Math.max(0, 1 - (stdDev / avgRadius));
    const isCircular = circularityScore > 0.85 && avgRadius > 0.5;
    
    return {
      isCircular,
      radius: avgRadius,
      confidence: circularityScore
    };
  }

  private getHorizontalFaces(): Face[] {
    return this.faces.filter(face => Math.abs(face.normal.z) > 0.9);
  }

  private getVerticalFaces(): Face[] {
    return this.faces.filter(face => Math.abs(face.normal.z) < 0.1);
  }

  private getAngledFaces(): Face[] {
    return this.faces.filter(face => {
      const angle = Math.acos(Math.abs(face.normal.z));
      return angle > Math.PI / 6 && angle < Math.PI / 3; // 30-60 degrees
    });
  }

  // Additional helper methods would continue here...
  // (Implementation of remaining calculation methods)

  private getAverageSurroundingHeight(face: Face): number {
    // Simplified implementation - would need more sophisticated analysis
    return this.faces
      .filter(f => f !== face && f.centroid.distanceTo(face.centroid) < 20)
      .reduce((sum, f) => sum + f.centroid.z, 0) / Math.max(1, this.faces.length - 1);
  }

  private extractFaceBoundary(face: Face): THREE.Vector3[] {
    return [...face.vertices];
  }

  private calculatePocketDimensions(boundary: THREE.Vector3[]): { width: number; length: number } {
    const box = new THREE.Box3().setFromPoints(boundary);
    const size = new THREE.Vector3();
    box.getSize(size);
    return { width: size.x, length: size.y };
  }

  private calculateAspectRatio(boundary: THREE.Vector3[]): number {
    const dimensions = this.calculatePocketDimensions(boundary);
    return Math.max(dimensions.width, dimensions.length) / Math.min(dimensions.width, dimensions.length);
  }

  private calculateSlotDimensions(boundary: THREE.Vector3[], aspectRatio: number): { width: number; length: number } {
    const dims = this.calculatePocketDimensions(boundary);
    return dims.width > dims.length ? 
      { width: dims.length, length: dims.width } :
      { width: dims.width, length: dims.length };
  }

  private calculateChamferWidth(face: Face): number {
    const box = new THREE.Box3().setFromPoints(face.vertices);
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.min(size.x, size.y, size.z);
  }

  private calculateBossDimensions(boundary: THREE.Vector3[]): { width: number; length: number } {
    return this.calculatePocketDimensions(boundary);
  }

  private calculateRibDimensions(boundary: THREE.Vector3[]): { thickness: number; length: number; height: number } {
    const box = new THREE.Box3().setFromPoints(boundary);
    const size = new THREE.Vector3();
    box.getSize(size);
    return { thickness: Math.min(size.x, size.y), length: Math.max(size.x, size.y), height: size.z };
  }

  private calculateStepDimensions(upperFace: Face, lowerFace: Face): { width: number; length: number } {
    const upperDims = this.calculatePocketDimensions(upperFace.vertices);
    const lowerDims = this.calculatePocketDimensions(lowerFace.vertices);
    return {
      width: Math.max(upperDims.width, lowerDims.width),
      length: Math.max(upperDims.length, lowerDims.length)
    };
  }

  // Confidence calculation methods
  private calculateHoleConfidence(loop: EdgeLoop, diameter: number, depth: number): number {
    let confidence = loop.confidence || 0.5;
    if (diameter > 2 && diameter < 50) confidence += 0.2;
    if (depth > diameter * 0.5) confidence += 0.2;
    if (loop.isCircular) confidence += 0.3;
    return Math.min(1, confidence);
  }

  private calculatePocketConfidence(face: Face, depth: number, dimensions: any): number {
    let confidence = 0.6;
    if (depth > 2 && depth < 30) confidence += 0.2;
    if (dimensions.width > 5 && dimensions.length > 5) confidence += 0.2;
    if (face.area > 50) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private calculateSlotConfidence(face: Face, aspectRatio: number, depth: number): number {
    let confidence = 0.6;
    if (aspectRatio > 4) confidence += 0.2;
    if (depth > 2) confidence += 0.1;
    if (face.area > 20) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private calculateChamferConfidence(face: Face, angle: number): number {
    let confidence = 0.7;
    if (Math.abs(angle - Math.PI / 4) < Math.PI / 12) confidence += 0.2;
    if (face.area < 100) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private calculateStepConfidence(upperFace: Face, lowerFace: Face, height: number): number {
    let confidence = 0.6;
    if (height > 3 && height < 25) confidence += 0.2;
    if (upperFace.area > 20 && lowerFace.area > 20) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private calculateBossConfidence(face: Face, height: number, dimensions: any): number {
    let confidence = 0.6;
    if (height > 3 && height < 20) confidence += 0.2;
    if (dimensions.width > 5 && dimensions.length > 5) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private calculateRibConfidence(face: Face, aspectRatio: number, dimensions: any): number {
    let confidence = 0.7;
    if (aspectRatio > 6) confidence += 0.2;
    if (dimensions.thickness > 1 && dimensions.thickness < 5) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private calculateHoleDepth(loop: EdgeLoop): number {
    // Simplified - would analyze connected faces for actual depth
    return loop.radius ? loop.radius * 2 : 10;
  }

  private calculateHoleAxis(loop: EdgeLoop): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1); // Simplified - would calculate from surrounding faces
  }

  private getFacesAroundLoop(loop: EdgeLoop): Face[] {
    return []; // Would return faces that bound the loop
  }

  private getAdjacentVerticalFaces(face: Face): Face[] {
    return face.adjacentFaces.filter(f => Math.abs(f.normal.z) < 0.5);
  }

  private getEdgesAroundFace(face: Face): Edge[] {
    return this.edges.filter(e => e.face1 === face || e.face2 === face);
  }

  private calculateLoopBoundingBox(loop: EdgeLoop): THREE.Box3 {
    return new THREE.Box3().setFromPoints(loop.vertices);
  }

  private calculateFaceBoundingBox(face: Face): THREE.Box3 {
    return new THREE.Box3().setFromPoints(face.vertices);
  }

  private calculateStepBoundingBox(upperFace: Face, lowerFace: Face): THREE.Box3 {
    const box = new THREE.Box3().setFromPoints([...upperFace.vertices, ...lowerFace.vertices]);
    return box;
  }
}