import * as THREE from 'three';

export interface AdvancedFeature {
  id: string;
  type: "pocket" | "hole" | "slot" | "chamfer" | "step" | "boss" | "rib";
  dimensions: { [key: string]: number };
  position: { x: number; y: number; z: number };
  confidence: number;
  toolRecommendation?: string;
  visible: boolean;
  boundaryVertices: THREE.Vector3[];
  surfaceNormal: THREE.Vector3;
  machiningStrategy: string;
  depth: number;
  area: number;
  complexity: 'simple' | 'moderate' | 'complex';
  adjacentFeatures: string[];
  tolerances: { [key: string]: number };
}

interface Surface {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  area: number;
  curvature: number;
  type: 'planar' | 'cylindrical' | 'spherical' | 'toroidal' | 'freeform';
  roughness: number;
  adjacentSurfaces: number[];
}

interface Edge {
  vertices: [THREE.Vector3, THREE.Vector3];
  length: number;
  angle: number;
  sharpness: number;
  type: 'straight' | 'curved' | 'complex';
  adjacentSurfaces: [number, number];
}

export class AdvancedFeatureAnalyzer {
  private geometry: THREE.BufferGeometry;
  private vertices: Float32Array;
  private surfaces: Surface[] = [];
  private edges: Edge[] = [];
  private features: AdvancedFeature[] = [];
  private meshResolution: number;
  private tolerance: number = 0.001;

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.vertices = (geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    this.meshResolution = this.calculateMeshResolution();
    this.analyzeGeometry();
  }

  private calculateMeshResolution(): number {
    const bbox = new THREE.Box3().setFromBufferAttribute(this.geometry.attributes.position);
    const size = bbox.getSize(new THREE.Vector3());
    return Math.min(size.x, size.y, size.z) / 1000; // Adaptive resolution
  }

  private analyzeGeometry(): void {
    console.log('Starting advanced geometry analysis...');
    this.extractAdvancedSurfaces();
    this.detectAdvancedEdges();
    this.performCurvatureAnalysis();
    this.detectFeatureHierarchy();
    this.validateFeatures();
    console.log(`Analysis complete: Found ${this.features.length} features`);
  }

  private extractAdvancedSurfaces(): void {
    const faces = this.extractTriangularFaces();
    const clusters = this.performAdvancedClustering(faces);
    
    this.surfaces = clusters.map((cluster, index) => {
      const surface = this.analyzeSurfaceGeometry(cluster);
      surface.adjacentSurfaces = this.findAdjacentSurfaces(index, clusters);
      return surface;
    });
  }

  private extractTriangularFaces(): THREE.Triangle[] {
    const faces: THREE.Triangle[] = [];
    const indices = this.geometry.index?.array;
    
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = this.getVertex(indices[i]);
        const v2 = this.getVertex(indices[i + 1]);
        const v3 = this.getVertex(indices[i + 2]);
        
        const triangle = new THREE.Triangle(v1, v2, v3);
        if (triangle.getArea() > this.tolerance) {
          faces.push(triangle);
        }
      }
    } else {
      for (let i = 0; i < this.vertices.length; i += 9) {
        const v1 = new THREE.Vector3(this.vertices[i], this.vertices[i + 1], this.vertices[i + 2]);
        const v2 = new THREE.Vector3(this.vertices[i + 3], this.vertices[i + 4], this.vertices[i + 5]);
        const v3 = new THREE.Vector3(this.vertices[i + 6], this.vertices[i + 7], this.vertices[i + 8]);
        
        const triangle = new THREE.Triangle(v1, v2, v3);
        if (triangle.getArea() > this.tolerance) {
          faces.push(triangle);
        }
      }
    }
    
    return faces;
  }

  private getVertex(index: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.vertices[index * 3],
      this.vertices[index * 3 + 1],
      this.vertices[index * 3 + 2]
    );
  }

  private performAdvancedClustering(faces: THREE.Triangle[]): THREE.Triangle[][] {
    const clusters: THREE.Triangle[][] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < faces.length; i++) {
      if (processed.has(i)) continue;
      
      const cluster = [faces[i]];
      const queue = [i];
      processed.add(i);
      
      while (queue.length > 0) {
        const currentIndex = queue.shift()!;
        const currentFace = faces[currentIndex];
        
        for (let j = 0; j < faces.length; j++) {
          if (processed.has(j)) continue;
          
          const otherFace = faces[j];
          if (this.areFacesConnected(currentFace, otherFace)) {
            cluster.push(otherFace);
            queue.push(j);
            processed.add(j);
          }
        }
      }
      
      if (cluster.length >= 3) { // Minimum faces for a meaningful surface
        clusters.push(cluster);
      }
    }
    
    return clusters;
  }

  private areFacesConnected(face1: THREE.Triangle, face2: THREE.Triangle): boolean {
    const normal1 = face1.getNormal(new THREE.Vector3());
    const normal2 = face2.getNormal(new THREE.Vector3());
    const center1 = this.getTriangleCenter(face1);
    const center2 = this.getTriangleCenter(face2);
    
    // Check normal similarity and proximity
    const normalSimilarity = normal1.dot(normal2);
    const distance = center1.distanceTo(center2);
    
    return normalSimilarity > 0.9 && distance < this.meshResolution * 10;
  }

  private getTriangleCenter(triangle: THREE.Triangle): THREE.Vector3 {
    return new THREE.Vector3()
      .addVectors(triangle.a, triangle.b)
      .add(triangle.c)
      .divideScalar(3);
  }

  private analyzeSurfaceGeometry(cluster: THREE.Triangle[]): Surface {
    const vertices: THREE.Vector3[] = [];
    let totalArea = 0;
    const normals: THREE.Vector3[] = [];
    
    cluster.forEach(triangle => {
      vertices.push(triangle.a, triangle.b, triangle.c);
      totalArea += triangle.getArea();
      normals.push(triangle.getNormal(new THREE.Vector3()));
    });
    
    const avgNormal = normals.reduce((acc, n) => acc.add(n), new THREE.Vector3()).normalize();
    const center = vertices.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vertices.length);
    
    // Calculate curvature
    const curvature = this.calculateSurfaceCurvature(cluster, avgNormal);
    const surfaceType = this.classifySurfaceType(curvature, normals);
    const roughness = this.calculateSurfaceRoughness(normals);
    
    return {
      vertices: this.removeDuplicateVertices(vertices),
      normal: avgNormal,
      center,
      area: totalArea,
      curvature,
      type: surfaceType,
      roughness,
      adjacentSurfaces: []
    };
  }

  private calculateSurfaceCurvature(cluster: THREE.Triangle[], avgNormal: THREE.Vector3): number {
    let curvatureSum = 0;
    let count = 0;
    
    cluster.forEach(triangle => {
      const faceNormal = triangle.getNormal(new THREE.Vector3());
      const deviation = 1 - Math.abs(faceNormal.dot(avgNormal));
      curvatureSum += deviation;
      count++;
    });
    
    return count > 0 ? curvatureSum / count : 0;
  }

  private classifySurfaceType(curvature: number, normals: THREE.Vector3[]): Surface['type'] {
    if (curvature < 0.01) return 'planar';
    
    // Analyze normal distribution for cylindrical/spherical detection
    const normalVariance = this.calculateNormalVariance(normals);
    
    if (curvature < 0.1) {
      return normalVariance > 0.5 ? 'cylindrical' : 'planar';
    } else if (curvature < 0.3) {
      return normalVariance > 0.8 ? 'spherical' : 'cylindrical';
    } else if (curvature < 0.6) {
      return 'toroidal';
    }
    
    return 'freeform';
  }

  private calculateNormalVariance(normals: THREE.Vector3[]): number {
    if (normals.length === 0) return 0;
    
    const avgNormal = normals.reduce((acc, n) => acc.add(n), new THREE.Vector3()).normalize();
    const variance = normals.reduce((acc, normal) => {
      return acc + Math.pow(1 - normal.dot(avgNormal), 2);
    }, 0) / normals.length;
    
    return variance;
  }

  private calculateSurfaceRoughness(normals: THREE.Vector3[]): number {
    if (normals.length < 2) return 0;
    
    let roughnessSum = 0;
    for (let i = 1; i < normals.length; i++) {
      const angleDiff = Math.acos(Math.max(-1, Math.min(1, normals[i].dot(normals[i-1]))));
      roughnessSum += angleDiff;
    }
    
    return roughnessSum / (normals.length - 1);
  }

  private removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    
    vertices.forEach(vertex => {
      const isDuplicate = unique.some(v => v.distanceTo(vertex) < this.tolerance);
      if (!isDuplicate) {
        unique.push(vertex);
      }
    });
    
    return unique;
  }

  private findAdjacentSurfaces(surfaceIndex: number, clusters: THREE.Triangle[][]): number[] {
    const adjacentIndices: number[] = [];
    const currentCluster = clusters[surfaceIndex];
    
    clusters.forEach((otherCluster, otherIndex) => {
      if (otherIndex === surfaceIndex) return;
      
      // Check if clusters share edges
      const hasSharedEdge = currentCluster.some(triangle1 => 
        otherCluster.some(triangle2 => this.doTrianglesShareEdge(triangle1, triangle2))
      );
      
      if (hasSharedEdge) {
        adjacentIndices.push(otherIndex);
      }
    });
    
    return adjacentIndices;
  }

  private doTrianglesShareEdge(triangle1: THREE.Triangle, triangle2: THREE.Triangle): boolean {
    const verts1 = [triangle1.a, triangle1.b, triangle1.c];
    const verts2 = [triangle2.a, triangle2.b, triangle2.c];
    
    let sharedVertices = 0;
    verts1.forEach(v1 => {
      verts2.forEach(v2 => {
        if (v1.distanceTo(v2) < this.tolerance) {
          sharedVertices++;
        }
      });
    });
    
    return sharedVertices >= 2; // Shared edge means 2 shared vertices
  }

  private detectAdvancedEdges(): void {
    this.edges = [];
    
    for (let i = 0; i < this.surfaces.length; i++) {
      for (const adjacentIndex of this.surfaces[i].adjacentSurfaces) {
        if (adjacentIndex <= i) continue; // Avoid duplicates
        
        const edge = this.createEdgeBetweenSurfaces(i, adjacentIndex);
        if (edge) {
          this.edges.push(edge);
        }
      }
    }
  }

  private createEdgeBetweenSurfaces(surface1Index: number, surface2Index: number): Edge | null {
    const surface1 = this.surfaces[surface1Index];
    const surface2 = this.surfaces[surface2Index];
    
    // Find intersection line between surfaces
    const intersectionPoints = this.findSurfaceIntersection(surface1, surface2);
    if (intersectionPoints.length < 2) return null;
    
    const startPoint = intersectionPoints[0];
    const endPoint = intersectionPoints[intersectionPoints.length - 1];
    const length = startPoint.distanceTo(endPoint);
    
    // Calculate edge angle
    const angle = Math.acos(Math.max(-1, Math.min(1, surface1.normal.dot(surface2.normal))));
    const sharpness = Math.abs(Math.PI - angle) / Math.PI; // 0 = smooth, 1 = sharp
    
    // Classify edge type
    const edgeType = this.classifyEdgeType(intersectionPoints);
    
    return {
      vertices: [startPoint, endPoint],
      length,
      angle,
      sharpness,
      type: edgeType,
      adjacentSurfaces: [surface1Index, surface2Index]
    };
  }

  private findSurfaceIntersection(surface1: Surface, surface2: Surface): THREE.Vector3[] {
    const intersectionPoints: THREE.Vector3[] = [];
    
    // Simplified intersection finding - in practice would use more sophisticated algorithms
    surface1.vertices.forEach(vertex => {
      const distance = this.pointToSurfaceDistance(vertex, surface2);
      if (Math.abs(distance) < this.tolerance) {
        intersectionPoints.push(vertex);
      }
    });
    
    return this.removeDuplicateVertices(intersectionPoints);
  }

  private pointToSurfaceDistance(point: THREE.Vector3, surface: Surface): number {
    // Simplified distance calculation
    const vectorToPoint = new THREE.Vector3().subVectors(point, surface.center);
    return vectorToPoint.dot(surface.normal);
  }

  private classifyEdgeType(points: THREE.Vector3[]): Edge['type'] {
    if (points.length < 3) return 'straight';
    
    // Check if points form a straight line
    const isLinear = this.arePointsLinear(points);
    if (isLinear) return 'straight';
    
    // Check if points form a simple curve
    const curvature = this.calculateEdgeCurvature(points);
    return curvature < 0.1 ? 'curved' : 'complex';
  }

  private arePointsLinear(points: THREE.Vector3[]): boolean {
    if (points.length < 3) return true;
    
    const direction = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    
    for (let i = 2; i < points.length; i++) {
      const segmentDir = new THREE.Vector3().subVectors(points[i], points[i-1]).normalize();
      if (direction.dot(segmentDir) < 0.95) return false;
    }
    
    return true;
  }

  private calculateEdgeCurvature(points: THREE.Vector3[]): number {
    if (points.length < 3) return 0;
    
    let totalCurvature = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const v1 = new THREE.Vector3().subVectors(points[i], points[i-1]).normalize();
      const v2 = new THREE.Vector3().subVectors(points[i+1], points[i]).normalize();
      const angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
      totalCurvature += angle;
    }
    
    return totalCurvature / (points.length - 2);
  }

  private performCurvatureAnalysis(): void {
    // Advanced curvature analysis for better feature detection
    this.surfaces.forEach(surface => {
      surface.curvature = this.calculateAdvancedCurvature(surface);
    });
  }

  private calculateAdvancedCurvature(surface: Surface): number {
    // Principal curvature calculation
    const principalCurvatures = this.calculatePrincipalCurvatures(surface);
    return Math.max(Math.abs(principalCurvatures.k1), Math.abs(principalCurvatures.k2));
  }

  private calculatePrincipalCurvatures(surface: Surface): { k1: number; k2: number } {
    // Simplified principal curvature calculation
    // In practice, would use more sophisticated differential geometry
    
    if (surface.vertices.length < 6) {
      return { k1: 0, k2: 0 };
    }
    
    // Sample points around the surface center
    const samplePoints = surface.vertices.slice(0, 6);
    const curvatures: number[] = [];
    
    for (let i = 0; i < samplePoints.length; i++) {
      const p1 = samplePoints[i];
      const p2 = samplePoints[(i + 1) % samplePoints.length];
      const p3 = samplePoints[(i + 2) % samplePoints.length];
      
      const curvature = this.calculatePointCurvature(p1, p2, p3);
      curvatures.push(curvature);
    }
    
    curvatures.sort((a, b) => Math.abs(b) - Math.abs(a));
    
    return {
      k1: curvatures[0] || 0,
      k2: curvatures[1] || 0
    };
  }

  private calculatePointCurvature(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): number {
    const v1 = new THREE.Vector3().subVectors(p2, p1);
    const v2 = new THREE.Vector3().subVectors(p3, p2);
    
    const cross = new THREE.Vector3().crossVectors(v1, v2);
    const area = cross.length() / 2;
    
    if (area < this.tolerance) return 0;
    
    const perimeter = v1.length() + v2.length() + p1.distanceTo(p3);
    return perimeter / (4 * area); // Simplified curvature measure
  }

  private detectFeatureHierarchy(): void {
    this.features = [];
    
    // Detect holes first (highest priority)
    this.detectAdvancedHoles();
    
    // Detect pockets
    this.detectAdvancedPockets();
    
    // Detect slots
    this.detectAdvancedSlots();
    
    // Detect bosses and ribs
    this.detectBossesAndRibs();
    
    // Detect chamfers and fillets
    this.detectChampersAndFillets();
    
    // Detect steps
    this.detectAdvancedSteps();
    
    // Establish feature relationships
    this.establishFeatureRelationships();
  }

  private detectAdvancedHoles(): void {
    const cylindricalSurfaces = this.surfaces.filter(s => s.type === 'cylindrical');
    
    cylindricalSurfaces.forEach(surface => {
      const hole = this.analyzeHoleCandidate(surface);
      if (hole && hole.confidence > 0.8) {
        this.features.push(hole);
      }
    });
  }

  private analyzeHoleCandidate(surface: Surface): AdvancedFeature | null {
    // Advanced hole analysis
    const boundingBox = this.calculateSurfaceBoundingBox(surface);
    const aspectRatio = boundingBox.depth / Math.max(boundingBox.width, boundingBox.height);
    
    if (aspectRatio < 0.5) return null; // Not deep enough
    
    const diameter = Math.min(boundingBox.width, boundingBox.height);
    const depth = boundingBox.depth;
    
    // Validate hole geometry
    if (diameter < 0.5 || diameter > 100 || depth < diameter * 0.3) return null;
    
    // Calculate confidence based on multiple factors
    let confidence = 0.7;
    confidence += Math.min(0.15, aspectRatio / 5); // Deeper holes = higher confidence
    confidence += surface.vertices.length > 20 ? 0.1 : 0; // More vertices = better definition
    confidence += this.isHoleAxisPerpendicular(surface) ? 0.05 : 0;
    
    const tolerances = this.calculateHoleTolerances(diameter, depth);
    
    return {
      id: `HOLE_${this.features.length + 1}`,
      type: "hole",
      dimensions: { diameter, depth },
      position: { x: surface.center.x, y: surface.center.y, z: surface.center.z },
      confidence,
      toolRecommendation: this.getHoleToolRecommendation(diameter, depth),
      visible: true,
      boundaryVertices: surface.vertices,
      surfaceNormal: surface.normal,
      machiningStrategy: this.getHoleMachiningStrategy(diameter, depth),
      depth,
      area: Math.PI * Math.pow(diameter / 2, 2),
      complexity: depth > diameter * 3 ? 'complex' : diameter > 20 ? 'moderate' : 'simple',
      adjacentFeatures: [],
      tolerances
    };
  }

  private calculateSurfaceBoundingBox(surface: Surface): { width: number; height: number; depth: number } {
    const bbox = new THREE.Box3();
    surface.vertices.forEach(vertex => bbox.expandByPoint(vertex));
    
    const size = bbox.getSize(new THREE.Vector3());
    return {
      width: size.x,
      height: size.y,
      depth: size.z
    };
  }

  private isHoleAxisPerpendicular(surface: Surface): boolean {
    const verticalNormal = new THREE.Vector3(0, 0, 1);
    return Math.abs(surface.normal.dot(verticalNormal)) > 0.9;
  }

  private calculateHoleTolerances(diameter: number, depth: number): { [key: string]: number } {
    // Standard tolerances for holes
    const toleranceGrade = diameter < 6 ? 'H7' : diameter < 18 ? 'H8' : 'H9';
    const diametralTolerance = diameter * (diameter < 6 ? 0.002 : diameter < 18 ? 0.003 : 0.004);
    const depthTolerance = Math.max(0.1, depth * 0.01);
    
    return {
      diameter: diametralTolerance,
      depth: depthTolerance,
      position: Math.max(0.05, diameter * 0.01),
      grade: parseInt(toleranceGrade.substring(1))
    };
  }

  private getHoleToolRecommendation(diameter: number, depth: number): string {
    const aspectRatio = depth / diameter;
    
    if (aspectRatio > 5) {
      return `${diameter}mm Deep Hole Drill + Gun Drill`;
    } else if (aspectRatio > 3) {
      return `${diameter}mm Drill + Peck Cycle`;
    } else {
      return `${diameter}mm Standard Drill`;
    }
  }

  private getHoleMachiningStrategy(diameter: number, depth: number): string {
    const aspectRatio = depth / diameter;
    
    if (diameter < 3) {
      return 'micro_drilling';
    } else if (aspectRatio > 5) {
      return 'deep_hole_drilling';
    } else if (aspectRatio > 3) {
      return 'peck_drilling';
    } else {
      return 'standard_drilling';
    }
  }

  private detectAdvancedPockets(): void {
    const horizontalSurfaces = this.surfaces.filter(s => 
      s.type === 'planar' && 
      Math.abs(s.normal.z) > 0.8 && 
      s.area > 10
    );
    
    horizontalSurfaces.forEach(surface => {
      if (this.isPocketBottom(surface)) {
        const pocket = this.analyzePocketCandidate(surface);
        if (pocket && pocket.confidence > 0.7) {
          this.features.push(pocket);
        }
      }
    });
  }

  private isPocketBottom(surface: Surface): boolean {
    // Check if surface is surrounded by higher surfaces
    const surroundingHeights = this.getSurroundingHeights(surface);
    const avgSurroundingHeight = surroundingHeights.reduce((a, b) => a + b, 0) / surroundingHeights.length;
    
    return surface.center.z < avgSurroundingHeight - 1; // At least 1mm below surrounding
  }

  private getSurroundingHeights(surface: Surface): number[] {
    const heights: number[] = [];
    const searchRadius = Math.sqrt(surface.area) * 1.5;
    
    this.surfaces.forEach(otherSurface => {
      if (otherSurface === surface) return;
      
      const distance = surface.center.distanceTo(otherSurface.center);
      if (distance < searchRadius) {
        heights.push(otherSurface.center.z);
      }
    });
    
    return heights;
  }

  private analyzePocketCandidate(surface: Surface): AdvancedFeature | null {
    const boundingBox = this.calculateSurfaceBoundingBox(surface);
    const surroundingHeights = this.getSurroundingHeights(surface);
    const depth = Math.max(...surroundingHeights) - surface.center.z;
    
    if (depth < 1 || boundingBox.width < 3 || boundingBox.height < 3) return null;
    
    let confidence = 0.6;
    confidence += Math.min(0.2, surface.area / 100);
    confidence += Math.min(0.1, depth / 20);
    confidence += this.hasClearPocketWalls(surface) ? 0.1 : 0;
    
    const tolerances = this.calculatePocketTolerances(boundingBox, depth);
    const complexity = this.assessPocketComplexity(surface, boundingBox, depth);
    
    return {
      id: `POCKET_${this.features.length + 1}`,
      type: "pocket",
      dimensions: { 
        width: boundingBox.width, 
        length: boundingBox.height, 
        depth 
      },
      position: { x: surface.center.x, y: surface.center.y, z: surface.center.z },
      confidence,
      toolRecommendation: this.getPocketToolRecommendation(boundingBox, depth),
      visible: true,
      boundaryVertices: surface.vertices,
      surfaceNormal: surface.normal,
      machiningStrategy: this.getPocketMachiningStrategy(boundingBox, depth),
      depth,
      area: surface.area,
      complexity,
      adjacentFeatures: [],
      tolerances
    };
  }

  private hasClearPocketWalls(surface: Surface): boolean {
    // Check if pocket has well-defined vertical walls
    const verticalSurfaces = surface.adjacentSurfaces.filter(index => {
      const adjacentSurface = this.surfaces[index];
      return Math.abs(adjacentSurface.normal.z) < 0.3; // Nearly vertical
    });
    
    return verticalSurfaces.length >= 3; // At least 3 walls for a pocket
  }

  private calculatePocketTolerances(boundingBox: any, depth: number): { [key: string]: number } {
    return {
      width: Math.max(0.1, boundingBox.width * 0.005),
      length: Math.max(0.1, boundingBox.height * 0.005),
      depth: Math.max(0.05, depth * 0.01),
      position: Math.max(0.1, Math.min(boundingBox.width, boundingBox.height) * 0.01)
    };
  }

  private assessPocketComplexity(surface: Surface, boundingBox: any, depth: number): 'simple' | 'moderate' | 'complex' {
    const aspectRatio = Math.max(boundingBox.width, boundingBox.height) / Math.min(boundingBox.width, boundingBox.height);
    const depthRatio = depth / Math.min(boundingBox.width, boundingBox.height);
    
    if (aspectRatio > 4 || depthRatio > 2 || surface.vertices.length > 50) {
      return 'complex';
    } else if (aspectRatio > 2 || depthRatio > 1) {
      return 'moderate';
    }
    
    return 'simple';
  }

  private getPocketToolRecommendation(boundingBox: any, depth: number): string {
    const minDimension = Math.min(boundingBox.width, boundingBox.height);
    const roughingTool = Math.floor(minDimension * 0.6);
    const finishingTool = Math.floor(minDimension * 0.8);
    
    return `${roughingTool}mm End Mill (Rough) + ${finishingTool}mm End Mill (Finish)`;
  }

  private getPocketMachiningStrategy(boundingBox: any, depth: number): string {
    const aspectRatio = Math.max(boundingBox.width, boundingBox.height) / Math.min(boundingBox.width, boundingBox.height);
    
    if (depth > 20) {
      return 'adaptive_clearing_deep';
    } else if (aspectRatio > 3) {
      return 'trochoidal_milling';
    } else {
      return 'adaptive_clearing';
    }
  }

  private detectAdvancedSlots(): void {
    // Detect slots as elongated pockets
    const slotCandidates = this.surfaces.filter(s => {
      if (s.type !== 'planar' || Math.abs(s.normal.z) < 0.8) return false;
      
      const boundingBox = this.calculateSurfaceBoundingBox(s);
      const aspectRatio = Math.max(boundingBox.width, boundingBox.height) / Math.min(boundingBox.width, boundingBox.height);
      
      return aspectRatio > 2.5 && this.isPocketBottom(s);
    });
    
    slotCandidates.forEach(surface => {
      const slot = this.analyzeSlotCandidate(surface);
      if (slot && slot.confidence > 0.7) {
        this.features.push(slot);
      }
    });
  }

  private analyzeSlotCandidate(surface: Surface): AdvancedFeature | null {
    const boundingBox = this.calculateSurfaceBoundingBox(surface);
    const length = Math.max(boundingBox.width, boundingBox.height);
    const width = Math.min(boundingBox.width, boundingBox.height);
    const surroundingHeights = this.getSurroundingHeights(surface);
    const depth = Math.max(...surroundingHeights) - surface.center.z;
    
    if (depth < 1 || width < 2 || length < width * 2) return null;
    
    let confidence = 0.7;
    confidence += Math.min(0.15, length / width / 10); // Higher aspect ratio = higher confidence
    confidence += Math.min(0.1, depth / 20);
    confidence += this.hasParallelWalls(surface) ? 0.05 : 0;
    
    return {
      id: `SLOT_${this.features.length + 1}`,
      type: "slot",
      dimensions: { length, width, depth },
      position: { x: surface.center.x, y: surface.center.y, z: surface.center.z },
      confidence,
      toolRecommendation: this.getSlotToolRecommendation(width, length, depth),
      visible: true,
      boundaryVertices: surface.vertices,
      surfaceNormal: surface.normal,
      machiningStrategy: 'plunge_milling',
      depth,
      area: surface.area,
      complexity: length > width * 5 ? 'complex' : 'moderate',
      adjacentFeatures: [],
      tolerances: {
        width: Math.max(0.05, width * 0.005),
        length: Math.max(0.1, length * 0.005),
        depth: Math.max(0.05, depth * 0.01)
      }
    };
  }

  private hasParallelWalls(surface: Surface): boolean {
    const adjacentVerticalSurfaces = surface.adjacentSurfaces
      .map(index => this.surfaces[index])
      .filter(s => Math.abs(s.normal.z) < 0.3);
    
    if (adjacentVerticalSurfaces.length < 2) return false;
    
    // Check if we have parallel surfaces
    for (let i = 0; i < adjacentVerticalSurfaces.length; i++) {
      for (let j = i + 1; j < adjacentVerticalSurfaces.length; j++) {
        const dot = adjacentVerticalSurfaces[i].normal.dot(adjacentVerticalSurfaces[j].normal);
        if (Math.abs(dot + 1) < 0.1) { // Parallel and opposite
          return true;
        }
      }
    }
    
    return false;
  }

  private getSlotToolRecommendation(width: number, length: number, depth: number): string {
    const toolDiameter = Math.floor(width * 0.8);
    
    if (depth > width * 3) {
      return `${toolDiameter}mm Long End Mill`;
    } else {
      return `${toolDiameter}mm End Mill`;
    }
  }

  private detectBossesAndRibs(): void {
    // Detect raised features (bosses and ribs)
    const elevatedSurfaces = this.surfaces.filter(s => 
      s.type === 'planar' && 
      Math.abs(s.normal.z) > 0.8 && 
      this.isElevatedSurface(s)
    );
    
    elevatedSurfaces.forEach(surface => {
      const feature = this.analyzeBossRibCandidate(surface);
      if (feature && feature.confidence > 0.7) {
        this.features.push(feature);
      }
    });
  }

  private isElevatedSurface(surface: Surface): boolean {
    const surroundingHeights = this.getSurroundingHeights(surface);
    const avgSurroundingHeight = surroundingHeights.reduce((a, b) => a + b, 0) / surroundingHeights.length;
    
    return surface.center.z > avgSurroundingHeight + 1; // At least 1mm above surrounding
  }

  private analyzeBossRibCandidate(surface: Surface): AdvancedFeature | null {
    const boundingBox = this.calculateSurfaceBoundingBox(surface);
    const aspectRatio = Math.max(boundingBox.width, boundingBox.height) / Math.min(boundingBox.width, boundingBox.height);
    const surroundingHeights = this.getSurroundingHeights(surface);
    const height = surface.center.z - Math.min(...surroundingHeights);
    
    if (height < 1) return null;
    
    const type = aspectRatio > 3 ? "rib" : "boss";
    let confidence = 0.6;
    confidence += Math.min(0.2, surface.area / 50);
    confidence += Math.min(0.1, height / 10);
    
    return {
      id: `${type.toUpperCase()}_${this.features.length + 1}`,
      type: type as any,
      dimensions: { 
        width: boundingBox.width, 
        length: boundingBox.height, 
        height 
      },
      position: { x: surface.center.x, y: surface.center.y, z: surface.center.z },
      confidence,
      toolRecommendation: `${Math.floor(Math.min(boundingBox.width, boundingBox.height) * 0.8)}mm End Mill`,
      visible: true,
      boundaryVertices: surface.vertices,
      surfaceNormal: surface.normal,
      machiningStrategy: 'contour_milling',
      depth: height,
      area: surface.area,
      complexity: aspectRatio > 5 || height > 10 ? 'complex' : 'simple',
      adjacentFeatures: [],
      tolerances: {
        width: Math.max(0.1, boundingBox.width * 0.005),
        length: Math.max(0.1, boundingBox.height * 0.005),
        height: Math.max(0.05, height * 0.01)
      }
    };
  }

  private detectChampersAndFillets(): void {
    // Detect chamfers and fillets at edges
    this.edges.forEach(edge => {
      if (edge.sharpness < 0.5) { // Rounded edge
        const fillet = this.analyzeFilletCandidate(edge);
        if (fillet && fillet.confidence > 0.7) {
          this.features.push(fillet);
        }
      } else if (edge.sharpness > 0.8) { // Sharp angled edge
        const chamfer = this.analyzeChamferCandidate(edge);
        if (chamfer && chamfer.confidence > 0.7) {
          this.features.push(chamfer);
        }
      }
    });
  }

  private analyzeFilletCandidate(edge: Edge): AdvancedFeature | null {
    // Simplified fillet analysis
    const radius = this.estimateFilletRadius(edge);
    if (radius < 0.5 || radius > 20) return null;
    
    const centerPoint = new THREE.Vector3()
      .addVectors(edge.vertices[0], edge.vertices[1])
      .divideScalar(2);
    
    return {
      id: `FILLET_${this.features.length + 1}`,
      type: "chamfer", // Using chamfer type for simplicity
      dimensions: { radius, length: edge.length },
      position: { x: centerPoint.x, y: centerPoint.y, z: centerPoint.z },
      confidence: 0.7,
      toolRecommendation: `${radius * 2}mm Ball End Mill`,
      visible: true,
      boundaryVertices: edge.vertices,
      surfaceNormal: new THREE.Vector3(0, 0, 1),
      machiningStrategy: 'ball_end_milling',
      depth: radius,
      area: edge.length * radius * Math.PI / 2,
      complexity: 'simple',
      adjacentFeatures: [],
      tolerances: { radius: Math.max(0.05, radius * 0.01) }
    };
  }

  private analyzeChamferCandidate(edge: Edge): AdvancedFeature | null {
    const chamferWidth = this.estimateChamferWidth(edge);
    if (chamferWidth < 0.5 || chamferWidth > 10) return null;
    
    const centerPoint = new THREE.Vector3()
      .addVectors(edge.vertices[0], edge.vertices[1])
      .divideScalar(2);
    
    return {
      id: `CHAMFER_${this.features.length + 1}`,
      type: "chamfer",
      dimensions: { width: chamferWidth, length: edge.length },
      position: { x: centerPoint.x, y: centerPoint.y, z: centerPoint.z },
      confidence: 0.8,
      toolRecommendation: `${chamferWidth * 2}mm Chamfer Mill`,
      visible: true,
      boundaryVertices: edge.vertices,
      surfaceNormal: new THREE.Vector3(0, 0, 1),
      machiningStrategy: 'chamfer_milling',
      depth: chamferWidth,
      area: edge.length * chamferWidth,
      complexity: 'simple',
      adjacentFeatures: [],
      tolerances: { width: Math.max(0.02, chamferWidth * 0.005) }
    };
  }

  private estimateFilletRadius(edge: Edge): number {
    // Simplified radius estimation
    return edge.length * 0.05; // Rough estimate
  }

  private estimateChamferWidth(edge: Edge): number {
    // Simplified width estimation based on edge angle
    const chamferFactor = Math.sin(edge.angle / 2);
    return edge.length * 0.1 * chamferFactor;
  }

  private detectAdvancedSteps(): void {
    // Detect step features
    const horizontalSurfaces = this.surfaces.filter(s => 
      s.type === 'planar' && Math.abs(s.normal.z) > 0.8
    );
    
    // Group surfaces by height
    const heightGroups = this.groupSurfacesByHeight(horizontalSurfaces);
    
    if (heightGroups.length > 1) {
      const steps = this.analyzeStepSequence(heightGroups);
      steps.forEach(step => {
        if (step.confidence > 0.7) {
          this.features.push(step);
        }
      });
    }
  }

  private groupSurfacesByHeight(surfaces: Surface[]): Surface[][] {
    const groups: Surface[][] = [];
    const tolerance = 1.0; // 1mm height tolerance
    
    surfaces.forEach(surface => {
      let addedToGroup = false;
      
      for (const group of groups) {
        const avgHeight = group.reduce((sum, s) => sum + s.center.z, 0) / group.length;
        if (Math.abs(surface.center.z - avgHeight) < tolerance) {
          group.push(surface);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([surface]);
      }
    });
    
    return groups.sort((a, b) => {
      const avgHeightA = a.reduce((sum, s) => sum + s.center.z, 0) / a.length;
      const avgHeightB = b.reduce((sum, s) => sum + s.center.z, 0) / b.length;
      return avgHeightB - avgHeightA; // Sort from highest to lowest
    });
  }

  private analyzeStepSequence(heightGroups: Surface[][]): AdvancedFeature[] {
    const steps: AdvancedFeature[] = [];
    
    for (let i = 0; i < heightGroups.length - 1; i++) {
      const upperGroup = heightGroups[i];
      const lowerGroup = heightGroups[i + 1];
      
      const step = this.createStepFeature(upperGroup, lowerGroup, i);
      if (step) {
        steps.push(step);
      }
    }
    
    return steps;
  }

  private createStepFeature(upperGroup: Surface[], lowerGroup: Surface[], index: number): AdvancedFeature | null {
    const upperHeight = upperGroup.reduce((sum, s) => sum + s.center.z, 0) / upperGroup.length;
    const lowerHeight = lowerGroup.reduce((sum, s) => sum + s.center.z, 0) / lowerGroup.length;
    const stepHeight = upperHeight - lowerHeight;
    
    if (stepHeight < 1) return null; // Minimum step height
    
    // Calculate step dimensions
    const allSurfaces = [...upperGroup, ...lowerGroup];
    const totalArea = allSurfaces.reduce((sum, s) => sum + s.area, 0);
    const avgCenter = allSurfaces.reduce((acc, s) => {
      acc.add(s.center.clone().multiplyScalar(s.area));
      return acc;
    }, new THREE.Vector3()).divideScalar(totalArea);
    
    const boundingBox = this.calculateGroupBoundingBox(allSurfaces);
    
    return {
      id: `STEP_${this.features.length + 1}`,
      type: "step",
      dimensions: { 
        width: boundingBox.width, 
        length: boundingBox.height, 
        height: stepHeight 
      },
      position: { x: avgCenter.x, y: avgCenter.y, z: avgCenter.z },
      confidence: 0.8,
      toolRecommendation: `${Math.floor(Math.min(boundingBox.width, boundingBox.height) * 0.6)}mm End Mill`,
      visible: true,
      boundaryVertices: this.extractGroupBoundary(allSurfaces),
      surfaceNormal: new THREE.Vector3(0, 0, 1),
      machiningStrategy: 'facing_operation',
      depth: stepHeight,
      area: totalArea,
      complexity: stepHeight > 10 || totalArea > 100 ? 'moderate' : 'simple',
      adjacentFeatures: [],
      tolerances: {
        height: Math.max(0.05, stepHeight * 0.01),
        position: Math.max(0.1, Math.min(boundingBox.width, boundingBox.height) * 0.01)
      }
    };
  }

  private calculateGroupBoundingBox(surfaces: Surface[]): { width: number; height: number; depth: number } {
    const bbox = new THREE.Box3();
    surfaces.forEach(surface => {
      surface.vertices.forEach(vertex => bbox.expandByPoint(vertex));
    });
    
    const size = bbox.getSize(new THREE.Vector3());
    return {
      width: size.x,
      height: size.y,
      depth: size.z
    };
  }

  private extractGroupBoundary(surfaces: Surface[]): THREE.Vector3[] {
    const allVertices: THREE.Vector3[] = [];
    surfaces.forEach(surface => {
      allVertices.push(...surface.vertices);
    });
    
    return this.removeDuplicateVertices(allVertices);
  }

  private establishFeatureRelationships(): void {
    // Establish relationships between features
    this.features.forEach((feature, index) => {
      feature.adjacentFeatures = this.findAdjacentFeatures(feature, index);
    });
  }

  private findAdjacentFeatures(feature: AdvancedFeature, featureIndex: number): string[] {
    const adjacentIds: string[] = [];
    const searchRadius = Math.sqrt(feature.area) * 2;
    
    this.features.forEach((otherFeature, otherIndex) => {
      if (otherIndex === featureIndex) return;
      
      const distance = Math.sqrt(
        Math.pow(feature.position.x - otherFeature.position.x, 2) +
        Math.pow(feature.position.y - otherFeature.position.y, 2) +
        Math.pow(feature.position.z - otherFeature.position.z, 2)
      );
      
      if (distance < searchRadius) {
        adjacentIds.push(otherFeature.id);
      }
    });
    
    return adjacentIds;
  }

  private validateFeatures(): void {
    // Remove features with low confidence or invalid geometry
    this.features = this.features.filter(feature => {
      return feature.confidence > 0.6 && 
             feature.dimensions && 
             Object.values(feature.dimensions).every(val => val > 0);
    });
    
    // Sort features by confidence
    this.features.sort((a, b) => b.confidence - a.confidence);
  }

  public getAnalysisResults(): any {
    const bbox = new THREE.Box3().setFromBufferAttribute(this.geometry.attributes.position as THREE.BufferAttribute);
    const size = bbox.getSize(new THREE.Vector3());
    const volume = size.x * size.y * size.z;
    
    const featureCounts: { [key: string]: number } = {};
    this.features.forEach(feature => {
      featureCounts[feature.type] = (featureCounts[feature.type] || 0) + 1;
    });
    
    const totalMachiningTime = this.estimateTotalMachiningTime();
    const complexityScore = this.calculateComplexityScore();
    
    return {
      fileName: 'Advanced Analysis',
      fileSize: this.vertices.length * 4, // Rough estimate
      features: featureCounts,
      geometry: {
        boundingBox: {
          x: `${size.x.toFixed(2)}mm`,
          y: `${size.y.toFixed(2)}mm`,
          z: `${size.z.toFixed(2)}mm`
        },
        volume: `${(volume / 1000).toFixed(2)}cm³`,
        surfaceArea: `${this.calculateSurfaceArea().toFixed(2)}mm²`
      },
      materials: 'Aluminum 6061-T6 (Recommended)',
      complexity: this.getComplexityDescription(complexityScore),
      confidence: `${(this.getAverageConfidence() * 100).toFixed(1)}%`,
      estimatedTime: `${totalMachiningTime.toFixed(1)} minutes`,
      timestamp: new Date().toISOString(),
      detectedFeatures: this.features
    };
  }

  private estimateTotalMachiningTime(): number {
    let totalTime = 0;
    
    this.features.forEach(feature => {
      switch (feature.type) {
        case 'hole':
          totalTime += this.estimateHoleMachiningTime(feature);
          break;
        case 'pocket':
          totalTime += this.estimatePocketMachiningTime(feature);
          break;
        case 'slot':
          totalTime += this.estimateSlotMachiningTime(feature);
          break;
        case 'chamfer':
          totalTime += this.estimateChamferMachiningTime(feature);
          break;
        default:
          totalTime += feature.area * 0.1; // Basic estimate
      }
    });
    
    return totalTime;
  }

  private estimateHoleMachiningTime(feature: AdvancedFeature): number {
    const diameter = feature.dimensions.diameter;
    const depth = feature.depth;
    const volume = Math.PI * Math.pow(diameter / 2, 2) * depth / 1000; // cm³
    
    // Material removal rate for drilling: ~2-10 cm³/min depending on diameter
    const mrr = Math.min(10, Math.max(2, diameter / 2));
    
    return volume / mrr + 0.5; // Add setup time
  }

  private estimatePocketMachiningTime(feature: AdvancedFeature): number {
    const volume = feature.area * feature.depth / 1000; // cm³
    
    // Material removal rate for pocketing: ~5-20 cm³/min
    const toolSize = Math.min(feature.dimensions.width, feature.dimensions.length) * 0.6;
    const mrr = Math.min(20, Math.max(5, toolSize / 2));
    
    const roughingTime = volume / mrr;
    const finishingTime = feature.area / 1000; // 1000 mm²/min finishing rate
    
    return roughingTime + finishingTime + 1; // Add setup time
  }

  private estimateSlotMachiningTime(feature: AdvancedFeature): number {
    const volume = feature.area * feature.depth / 1000; // cm³
    const mrr = Math.min(15, Math.max(3, feature.dimensions.width / 2));
    
    return volume / mrr + 0.5;
  }

  private estimateChamferMachiningTime(feature: AdvancedFeature): number {
    const length = feature.dimensions.length || 10;
    const feedrate = 500; // mm/min for chamfering
    
    return length / feedrate + 0.2; // Add setup time
  }

  private calculateComplexityScore(): number {
    let score = 0;
    
    this.features.forEach(feature => {
      switch (feature.complexity) {
        case 'simple': score += 1; break;
        case 'moderate': score += 2; break;
        case 'complex': score += 4; break;
      }
    });
    
    return score;
  }

  private getComplexityDescription(score: number): string {
    if (score < 5) return 'Low - Simple geometry with basic features';
    if (score < 15) return 'Medium - Moderate complexity with mixed features';
    return 'High - Complex geometry requiring advanced machining';
  }

  private getAverageConfidence(): number {
    if (this.features.length === 0) return 0;
    return this.features.reduce((sum, f) => sum + f.confidence, 0) / this.features.length;
  }

  private calculateSurfaceArea(): number {
    return this.surfaces.reduce((total, surface) => total + surface.area, 0);
  }

  public getDetectedFeatures(): AdvancedFeature[] {
    return this.features;
  }
}