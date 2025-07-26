import * as THREE from 'three';
import { AdvancedSTLAnalyzer, MachinableFeature } from './AdvancedSTLAnalyzer';

interface Feature {
  id: string;
  type: "pocket" | "hole" | "slot" | "chamfer" | "step";
  dimensions: { [key: string]: number };
  position: { x: number; y: number; z: number };
  confidence: number;
  toolRecommendation?: string;
  visible: boolean;
  boundaryVertices?: THREE.Vector3[];
  surfaceNormal?: THREE.Vector3;
}

interface Face {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  area: number;
}

interface SurfaceCluster {
  faces: Face[];
  normal: THREE.Vector3;
  type: 'planar' | 'cylindrical' | 'conical' | 'freeform';
  center: THREE.Vector3;
  area: number;
}

interface AnalysisResults {
  fileName: string;
  fileSize: number;
  features: { [key: string]: number };
  geometry: {
    boundingBox: { x: string; y: string; z: string };
    volume: string;
    surfaceArea: string;
  };
  materials: string;
  complexity: string;
  confidence: string;
  estimatedTime: string;
  timestamp: string;
  originalGeometry?: THREE.BufferGeometry;
  machinableFeatures?: MachinableFeature[];
}

export class STLFeatureAnalyzer {
  private geometry: THREE.BufferGeometry;
  private vertices: Float32Array;
  private faces: Face[];
  private surfaceClusters: SurfaceCluster[] = [];
  private edges: { v1: THREE.Vector3; v2: THREE.Vector3; sharpness: number }[] = [];

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.vertices = geometry.attributes.position.array as Float32Array;
    this.faces = this.extractFacesWithNormals();
    this.analyzeSurfaces();
    this.detectEdges();
  }

  private extractFacesWithNormals(): Face[] {
    const faces: Face[] = [];
    const indices = this.geometry.index?.array;
    
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const face = this.createFaceFromIndices(indices[i], indices[i + 1], indices[i + 2]);
        if (face) faces.push(face);
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < this.vertices.length; i += 9) {
        const v1 = new THREE.Vector3(this.vertices[i], this.vertices[i + 1], this.vertices[i + 2]);
        const v2 = new THREE.Vector3(this.vertices[i + 3], this.vertices[i + 4], this.vertices[i + 5]);
        const v3 = new THREE.Vector3(this.vertices[i + 6], this.vertices[i + 7], this.vertices[i + 8]);
        const face = this.createFaceFromVertices(v1, v2, v3);
        if (face) faces.push(face);
      }
    }
    
    return faces;
  }

  private createFaceFromIndices(i1: number, i2: number, i3: number): Face | null {
    const v1 = new THREE.Vector3(this.vertices[i1 * 3], this.vertices[i1 * 3 + 1], this.vertices[i1 * 3 + 2]);
    const v2 = new THREE.Vector3(this.vertices[i2 * 3], this.vertices[i2 * 3 + 1], this.vertices[i2 * 3 + 2]);
    const v3 = new THREE.Vector3(this.vertices[i3 * 3], this.vertices[i3 * 3 + 1], this.vertices[i3 * 3 + 2]);
    return this.createFaceFromVertices(v1, v2, v3);
  }

  private createFaceFromVertices(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): Face | null {
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    if (normal.length() === 0) return null; // Degenerate triangle
    
    const center = new THREE.Vector3().addVectors(v1, v2).add(v3).divideScalar(3);
    const area = edge1.cross(edge2).length() / 2;
    
    return {
      vertices: [v1, v2, v3],
      normal,
      center,
      area
    };
  }

  private analyzeSurfaces(): void {
    const clusters: SurfaceCluster[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < this.faces.length; i++) {
      if (processed.has(i)) continue;
      
      const face = this.faces[i];
      const cluster: SurfaceCluster = {
        faces: [face],
        normal: face.normal.clone(),
        type: 'planar',
        center: face.center.clone(),
        area: face.area
      };
      
      // Find similar faces to cluster together
      for (let j = i + 1; j < this.faces.length; j++) {
        if (processed.has(j)) continue;
        
        const otherFace = this.faces[j];
        const normalSimilarity = face.normal.dot(otherFace.normal);
        const distance = face.center.distanceTo(otherFace.center);
        
        // Group faces with similar normals and close proximity
        if (normalSimilarity > 0.95 && distance < 20) {
          cluster.faces.push(otherFace);
          cluster.area += otherFace.area;
          cluster.center.add(otherFace.center);
          processed.add(j);
        }
      }
      
      cluster.center.divideScalar(cluster.faces.length);
      cluster.type = this.determineSurfaceType(cluster);
      clusters.push(cluster);
      processed.add(i);
    }
    
    this.surfaceClusters = clusters.filter(c => c.area > 5); // Filter out tiny surfaces
  }

  private determineSurfaceType(cluster: SurfaceCluster): 'planar' | 'cylindrical' | 'conical' | 'freeform' {
    if (cluster.faces.length < 8) return 'planar';
    
    // Analyze curvature by checking normal variations
    const normals = cluster.faces.map(f => f.normal);
    const avgNormal = normals.reduce((acc, n) => acc.add(n), new THREE.Vector3()).normalize();
    
    let curvatureVariance = 0;
    normals.forEach(normal => {
      curvatureVariance += Math.pow(1 - normal.dot(avgNormal), 2);
    });
    curvatureVariance /= normals.length;
    
    if (curvatureVariance < 0.01) return 'planar';
    if (curvatureVariance < 0.1) return 'cylindrical';
    if (curvatureVariance < 0.3) return 'conical';
    return 'freeform';
  }

  private detectEdges(): void {
    const edges: { v1: THREE.Vector3; v2: THREE.Vector3; sharpness: number }[] = [];
    
    // Find shared edges between faces
    for (let i = 0; i < this.faces.length; i++) {
      for (let j = i + 1; j < this.faces.length; j++) {
        const face1 = this.faces[i];
        const face2 = this.faces[j];
        
        // Check if faces share an edge
        const sharedVertices = this.findSharedVertices(face1.vertices, face2.vertices);
        if (sharedVertices.length === 2) {
          const sharpness = 1 - face1.normal.dot(face2.normal);
          if (sharpness > 0.3) { // Sharp edge threshold
            edges.push({
              v1: sharedVertices[0],
              v2: sharedVertices[1],
              sharpness
            });
          }
        }
      }
    }
    
    this.edges = edges;
  }

  private findSharedVertices(verts1: THREE.Vector3[], verts2: THREE.Vector3[]): THREE.Vector3[] {
    const shared: THREE.Vector3[] = [];
    const tolerance = 0.001;
    
    for (const v1 of verts1) {
      for (const v2 of verts2) {
        if (v1.distanceTo(v2) < tolerance) {
          shared.push(v1);
          break;
        }
      }
    }
    
    return shared;
  }

  private getBoundingBox(): { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3 } {
    this.geometry.computeBoundingBox();
    const box = this.geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    
    return {
      min: box.min,
      max: box.max,
      size
    };
  }

  private detectHoles(): Feature[] {
    const holes: Feature[] = [];
    
    // Find cylindrical surfaces that could be holes
    const cylindricalSurfaces = this.surfaceClusters.filter(c => c.type === 'cylindrical');
    
    for (const surface of cylindricalSurfaces) {
      const holeData = this.analyzeCylindricalHole(surface);
      if (holeData && holeData.confidence > 0.7) {
        holes.push({
          id: `H${String(holes.length + 1).padStart(3, '0')}`,
          type: "hole",
          dimensions: { 
            diameter: holeData.diameter,
            depth: holeData.depth
          },
          position: holeData.center,
          confidence: holeData.confidence,
          toolRecommendation: `${Math.round(holeData.diameter)}mm Drill`,
          visible: true,
          boundaryVertices: holeData.boundaryVertices,
          surfaceNormal: surface.normal
        });
      }
    }

    // Also detect holes through edge analysis (circular edge loops)
    const circularEdgeHoles = this.detectCircularEdgeLoops();
    holes.push(...circularEdgeHoles);

    return holes;
  }

  private analyzeCylindricalHole(surface: SurfaceCluster): {
    center: { x: number; y: number; z: number };
    diameter: number;
    depth: number;
    confidence: number;
    boundaryVertices: THREE.Vector3[];
  } | null {
    if (surface.faces.length < 12) return null; // Too few faces for a proper hole
    
    // Find the axis of the cylinder by analyzing face normals
    const centers = surface.faces.map(f => f.center);
    const boundingBox = this.getBoundingBoxFromPoints(centers);
    
    // Check if this looks like a hole (relatively deep vs wide)
    const dimensions = [boundingBox.size.x, boundingBox.size.y, boundingBox.size.z];
    dimensions.sort((a, b) => b - a);
    const aspectRatio = dimensions[0] / dimensions[1];
    
    if (aspectRatio < 1.5) return null; // Not deep enough to be a hole
    
    const diameter = Math.min(boundingBox.size.x, boundingBox.size.y) * 2;
    const depth = Math.max(boundingBox.size.x, boundingBox.size.y, boundingBox.size.z);
    
    // Validate hole dimensions
    if (diameter < 1 || diameter > 100 || depth < diameter * 0.5) return null;
    
    const confidence = Math.min(0.95, 0.6 + (surface.faces.length / 50) + (aspectRatio > 3 ? 0.2 : 0));
    
    // Fix coordinate positioning - use surface centroid for more accurate positioning
    const surfaceCentroid = this.calculateSurfaceCentroid(surface);
    
    return {
      center: { x: surfaceCentroid.x, y: surfaceCentroid.y, z: surfaceCentroid.z },
      diameter,
      depth,
      confidence,
      boundaryVertices: this.extractBoundaryVertices(surface)
    };
  }

  private detectCircularEdgeLoops(): Feature[] {
    const holes: Feature[] = [];
    const circularLoops = this.findCircularEdgeLoops();
    
    for (const loop of circularLoops) {
      if (loop.confidence > 0.8 && loop.radius > 1 && loop.radius < 50) {
        holes.push({
          id: `H${String(holes.length + 1).padStart(3, '0')}`,
          type: "hole",
          dimensions: { 
            diameter: loop.radius * 2,
            depth: loop.depth || 10
          },
          position: loop.center,
          confidence: loop.confidence,
          toolRecommendation: `${Math.round(loop.radius * 2)}mm Drill`,
          visible: true,
          boundaryVertices: loop.vertices
        });
      }
    }
    
    return holes;
  }

  private findCircularEdgeLoops(): Array<{
    center: { x: number; y: number; z: number };
    radius: number;
    depth?: number;
    confidence: number;
    vertices: THREE.Vector3[];
  }> {
    const loops: Array<{
      center: { x: number; y: number; z: number };
      radius: number;
      depth?: number;
      confidence: number;
      vertices: THREE.Vector3[];
    }> = [];
    
    // Group edges by proximity to find closed loops
    const edgeGroups = this.groupEdgesByProximity();
    
    for (const group of edgeGroups) {
      if (group.length < 6) continue; // Too few edges for a circle
      
      const vertices = this.extractVerticesFromEdges(group);
      const circleData = this.analyzeCircularPattern(vertices);
      
      if (circleData && circleData.confidence > 0.7) {
        loops.push({
          center: this.calculateCentroid(vertices),
          radius: circleData.radius,
          depth: circleData.depth,
          confidence: circleData.confidence,
          vertices
        });
      }
    }
    
    return loops;
  }

  private groupEdgesByProximity(): Array<Array<{ v1: THREE.Vector3; v2: THREE.Vector3; sharpness: number }>> {
    const groups: Array<Array<{ v1: THREE.Vector3; v2: THREE.Vector3; sharpness: number }>> = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < this.edges.length; i++) {
      if (processed.has(i)) continue;
      
      const group = [this.edges[i]];
      const center = new THREE.Vector3().addVectors(this.edges[i].v1, this.edges[i].v2).divideScalar(2);
      
      for (let j = i + 1; j < this.edges.length; j++) {
        if (processed.has(j)) continue;
        
        const otherCenter = new THREE.Vector3().addVectors(this.edges[j].v1, this.edges[j].v2).divideScalar(2);
        if (center.distanceTo(otherCenter) < 15) { // Within reasonable proximity
          group.push(this.edges[j]);
          processed.add(j);
        }
      }
      
      if (group.length >= 6) {
        groups.push(group);
      }
      processed.add(i);
    }
    
    return groups;
  }

  private extractVerticesFromEdges(edges: Array<{ v1: THREE.Vector3; v2: THREE.Vector3; sharpness: number }>): THREE.Vector3[] {
    const vertices: THREE.Vector3[] = [];
    edges.forEach(edge => {
      vertices.push(edge.v1, edge.v2);
    });
    return this.removeDuplicateVertices(vertices);
  }

  private removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    const tolerance = 0.001;
    
    for (const vertex of vertices) {
      const isDuplicate = unique.some(v => v.distanceTo(vertex) < tolerance);
      if (!isDuplicate) {
        unique.push(vertex);
      }
    }
    
    return unique;
  }


  private analyzeCircularPattern(vertices: THREE.Vector3[]): { radius: number; depth: number; confidence: number } | null {
    if (vertices.length < 8) return null;
    
    // Calculate center
    const center = vertices.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vertices.length);
    
    // Calculate distances from center
    const distances = vertices.map(v => v.distanceTo(center));
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    
    // Check how circular the pattern is
    const variance = distances.reduce((acc, d) => acc + Math.pow(d - avgDistance, 2), 0) / distances.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Lower variance indicates more circular pattern
    const circularityScore = Math.max(0, 1 - (standardDeviation / avgDistance));
    
    if (circularityScore > 0.6 && avgDistance > 1) {
      return {
        radius: avgDistance,
        depth: Math.max(...vertices.map(v => v.z)) - Math.min(...vertices.map(v => v.z)),
        confidence: circularityScore
      };
    }
    
    return null;
  }

  private detectPockets(): Feature[] {
    const pockets: Feature[] = [];
    
    // Find planar surfaces that could be pocket bottoms
    const planarSurfaces = this.surfaceClusters.filter(c => 
      c.type === 'planar' && 
      c.area > 20 && 
      Math.abs(c.normal.z) > 0.8 // Horizontal or near-horizontal surfaces
    );
    
    for (const surface of planarSurfaces) {
      const pocketData = this.analyzePocketSurface(surface);
      if (pocketData && pocketData.confidence > 0.7) {
        pockets.push({
          id: `P${String(pockets.length + 1).padStart(3, '0')}`,
          type: "pocket",
          dimensions: { 
            width: pocketData.width,
            length: pocketData.length,
            depth: pocketData.depth
          },
          position: pocketData.center,
          confidence: pocketData.confidence,
          toolRecommendation: `${Math.round(Math.min(pocketData.width, pocketData.length) * 0.8)}mm End Mill`,
          visible: true,
          boundaryVertices: pocketData.boundaryVertices,
          surfaceNormal: surface.normal
        });
      }
    }

    return pockets;
  }

  private analyzePocketSurface(surface: SurfaceCluster): {
    center: { x: number; y: number; z: number };
    width: number;
    length: number;
    depth: number;
    confidence: number;
    boundaryVertices: THREE.Vector3[];
  } | null {
    const boundingBox = this.getBoundingBoxFromPoints(surface.faces.map(f => f.center));
    const surroundingArea = this.analyzeSurroundingArea(surface);
    
    // Check if this surface is significantly lower than surrounding areas
    const depthDifference = surroundingArea.maxZ - boundingBox.center.z;
    if (depthDifference < 2) return null; // Not deep enough to be a pocket
    
    const width = boundingBox.size.x;
    const length = boundingBox.size.y;
    const depth = depthDifference;
    
    // Validate pocket dimensions
    if (width < 3 || length < 3 || width > 200 || length > 200) return null;
    
    // Calculate confidence based on multiple factors
    let confidence = 0.6;
    confidence += Math.min(0.2, surface.area / 100); // Larger surface = higher confidence
    confidence += Math.min(0.1, depthDifference / 20); // Deeper = higher confidence
    confidence += surface.faces.length > 10 ? 0.1 : 0; // More faces = better definition
    
    // Fix coordinate positioning - use surface centroid for accurate positioning
    const surfaceCentroid = this.calculateSurfaceCentroid(surface);
    
    return {
      center: { x: surfaceCentroid.x, y: surfaceCentroid.y, z: surfaceCentroid.z },
      width,
      length,
      depth,
      confidence: Math.min(0.95, confidence),
      boundaryVertices: this.extractBoundaryVertices(surface)
    };
  }

  private analyzeSurroundingArea(surface: SurfaceCluster): { maxZ: number; minZ: number; avgZ: number } {
    const center = surface.center;
    const radius = 30; // Look in 30mm radius around the surface
    
    let maxZ = -Infinity;
    let minZ = Infinity;
    let zSum = 0;
    let count = 0;
    
    for (const otherSurface of this.surfaceClusters) {
      if (otherSurface === surface) continue;
      
      const distance = new THREE.Vector2(center.x - otherSurface.center.x, center.y - otherSurface.center.y).length();
      if (distance <= radius) {
        maxZ = Math.max(maxZ, otherSurface.center.z);
        minZ = Math.min(minZ, otherSurface.center.z);
        zSum += otherSurface.center.z;
        count++;
      }
    }
    
    return {
      maxZ: maxZ === -Infinity ? center.z + 10 : maxZ,
      minZ: minZ === Infinity ? center.z - 10 : minZ,
      avgZ: count > 0 ? zSum / count : center.z
    };
  }


  public analyzeFeatures(): AnalysisResults {
    const holes = this.detectHoles();
    const pockets = this.detectPockets();
    const slots = this.detectSlots();
    const chamfers = this.detectChamfers();
    const steps = this.detectSteps();
    
    const allFeatures = [...holes, ...pockets, ...slots, ...chamfers, ...steps];
    
    // Compile results
    const features = {
      holes: holes.length,
      pockets: pockets.length,
      slots: slots.length,
      chamfers: chamfers.length,
      steps: steps.length
    };
    
    const boundingBox = this.getBoundingBox();
    const volume = this.calculateActualVolume();
    const surfaceArea = this.calculateSurfaceArea();
    const complexity = this.assessComplexity(allFeatures);
    const confidence = this.calculateOverallConfidence(allFeatures);
    const estimatedTime = this.calculateRealisticMachiningTime(allFeatures);
    
    const results: AnalysisResults = {
      fileName: "uploaded_file.stl",
      fileSize: 0,
      features,
      geometry: {
        boundingBox: {
          x: `${boundingBox.size.x.toFixed(1)}mm`,
          y: `${boundingBox.size.y.toFixed(1)}mm`,
          z: `${boundingBox.size.z.toFixed(1)}mm`
        },
        volume: `${volume.toFixed(1)} cm³`,
        surfaceArea: `${surfaceArea.toFixed(1)} cm²`
      },
      materials: "Aluminum 6061",
      complexity: complexity,
      confidence: `${Math.round(confidence * 100)}%`,
      estimatedTime: estimatedTime,
      timestamp: new Date().toISOString(),
      originalGeometry: this.geometry
    };
    
    // Store detected features for later use
    (results as any).detectedFeatures = allFeatures;
    
    return results;
  }
  
  private calculateOverallConfidence(features: Feature[]): number {
    if (features.length === 0) return 0.5;
    return features.reduce((sum, f) => sum + f.confidence, 0) / features.length;
  }

  private detectSlots(): Feature[] {
    const slots: Feature[] = [];
    
    // Find parallel planar surfaces that could form slots
    const parallelPairs = this.findParallelSurfaces();
    
    for (const pair of parallelPairs) {
      const slotData = this.analyzeSlotPair(pair.surface1, pair.surface2);
      if (slotData && slotData.confidence > 0.7) {
        slots.push({
          id: `S${String(slots.length + 1).padStart(3, '0')}`,
          type: "slot",
          dimensions: { 
            width: slotData.width,
            length: slotData.length,
            depth: slotData.depth
          },
          position: slotData.center,
          confidence: slotData.confidence,
          toolRecommendation: `${Math.round(slotData.width * 0.9)}mm Slot Cutter`,
          visible: true,
          surfaceNormal: pair.surface1.normal
        });
      }
    }
    
    return slots;
  }

  private detectChamfers(): Feature[] {
    const chamfers: Feature[] = [];
    
    // Find angled surfaces between perpendicular surfaces
    for (const surface of this.surfaceClusters) {
      if (surface.type === 'planar' && surface.area > 5) {
        const chamferData = this.analyzeChamferSurface(surface);
        if (chamferData && chamferData.confidence > 0.8) {
          chamfers.push({
            id: `C${String(chamfers.length + 1).padStart(3, '0')}`,
            type: "chamfer",
            dimensions: { 
              width: chamferData.width,
              angle: chamferData.angle
            },
            position: chamferData.center,
            confidence: chamferData.confidence,
            toolRecommendation: `${chamferData.angle}° Chamfer Tool`,
            visible: true,
            surfaceNormal: surface.normal
          });
        }
      }
    }
    
    return chamfers;
  }

  private detectSteps(): Feature[] {
    const steps: Feature[] = [];
    
    // Find height transitions between planar surfaces
    const horizontalSurfaces = this.surfaceClusters.filter(s => 
      s.type === 'planar' && Math.abs(s.normal.z) > 0.9
    );
    
    for (let i = 0; i < horizontalSurfaces.length - 1; i++) {
      for (let j = i + 1; j < horizontalSurfaces.length; j++) {
        const stepData = this.analyzeStepPair(horizontalSurfaces[i], horizontalSurfaces[j]);
        if (stepData && stepData.confidence > 0.7) {
          steps.push({
            id: `ST${String(steps.length + 1).padStart(3, '0')}`,
            type: "step",
            dimensions: { 
              width: stepData.width,
              length: stepData.length,
              height: stepData.height
            },
            position: stepData.center,
            confidence: stepData.confidence,
            toolRecommendation: `${Math.round(stepData.width * 0.8)}mm Face Mill`,
            visible: true
          });
        }
      }
    }
    
    return steps;
  }

  // Helper methods for new feature detection
  private findParallelSurfaces(): Array<{ surface1: SurfaceCluster; surface2: SurfaceCluster; distance: number }> {
    const pairs: Array<{ surface1: SurfaceCluster; surface2: SurfaceCluster; distance: number }> = [];
    
    for (let i = 0; i < this.surfaceClusters.length - 1; i++) {
      for (let j = i + 1; j < this.surfaceClusters.length; j++) {
        const s1 = this.surfaceClusters[i];
        const s2 = this.surfaceClusters[j];
        
        // Check if surfaces are parallel (opposite normals)
        const parallelism = Math.abs(s1.normal.dot(s2.normal.clone().negate()));
        if (parallelism > 0.95 && s1.type === 'planar' && s2.type === 'planar') {
          const distance = Math.abs(s1.center.distanceTo(s2.center));
          if (distance > 2 && distance < 50) { // Reasonable slot width
            pairs.push({ surface1: s1, surface2: s2, distance });
          }
        }
      }
    }
    
    return pairs;
  }

  private analyzeSlotPair(s1: SurfaceCluster, s2: SurfaceCluster): {
    center: { x: number; y: number; z: number };
    width: number;
    length: number;
    depth: number;
    confidence: number;
  } | null {
    const distance = s1.center.distanceTo(s2.center);
    const center = new THREE.Vector3().addVectors(s1.center, s2.center).divideScalar(2);
    
    const bbox1 = this.getBoundingBoxFromPoints(s1.faces.map(f => f.center));
    const bbox2 = this.getBoundingBoxFromPoints(s2.faces.map(f => f.center));
    
    const avgLength = (Math.max(bbox1.size.x, bbox1.size.y) + Math.max(bbox2.size.x, bbox2.size.y)) / 2;
    const depth = Math.abs(Math.max(s1.center.z, s2.center.z) - Math.min(s1.center.z, s2.center.z));
    
    if (avgLength < distance * 2 || depth < 2) return null; // Not a valid slot
    
    const confidence = Math.min(0.95, 0.7 + (avgLength / distance) * 0.1);
    
    return {
      center: { x: center.x, y: center.y, z: center.z },
      width: distance,
      length: avgLength,
      depth,
      confidence
    };
  }

  private analyzeChamferSurface(surface: SurfaceCluster): {
    center: { x: number; y: number; z: number };
    width: number;
    angle: number;
    confidence: number;
  } | null {
    // Check if surface is angled (not horizontal or vertical)
    const normalAngle = Math.acos(Math.abs(surface.normal.z)) * 180 / Math.PI;
    if (normalAngle < 20 || normalAngle > 70) return null; // Not a typical chamfer angle
    
    const bbox = this.getBoundingBoxFromPoints(surface.faces.map(f => f.center));
    const width = Math.min(bbox.size.x, bbox.size.y);
    
    if (width < 1 || width > 20) return null; // Chamfer size constraints
    
    const confidence = 0.8 + (surface.area > 10 ? 0.1 : 0);
    
    return {
      center: { x: surface.center.x, y: surface.center.y, z: surface.center.z },
      width,
      angle: normalAngle,
      confidence
    };
  }

  private analyzeStepPair(s1: SurfaceCluster, s2: SurfaceCluster): {
    center: { x: number; y: number; z: number };
    width: number;
    length: number;
    height: number;
    confidence: number;
  } | null {
    const heightDiff = Math.abs(s1.center.z - s2.center.z);
    if (heightDiff < 2) return null; // Too small to be a step
    
    const distance2D = new THREE.Vector2(s1.center.x - s2.center.x, s1.center.y - s2.center.y).length();
    if (distance2D > 30) return null; // Too far apart
    
    const bbox1 = this.getBoundingBoxFromPoints(s1.faces.map(f => f.center));
    const bbox2 = this.getBoundingBoxFromPoints(s2.faces.map(f => f.center));
    
    const avgWidth = (bbox1.size.x + bbox2.size.x) / 2;
    const avgLength = (bbox1.size.y + bbox2.size.y) / 2;
    
    const center = new THREE.Vector3().addVectors(s1.center, s2.center).divideScalar(2);
    const confidence = 0.7 + Math.min(0.2, (s1.area + s2.area) / 100);
    
    return {
      center: { x: center.x, y: center.y, z: center.z },
      width: avgWidth,
      length: avgLength,
      height: heightDiff,
      confidence
    };
  }

  // Utility methods
  private getBoundingBoxFromPoints(points: THREE.Vector3[]): { center: THREE.Vector3; size: THREE.Vector3; min: THREE.Vector3; max: THREE.Vector3 } {
    if (points.length === 0) {
      const zero = new THREE.Vector3();
      return { center: zero, size: zero, min: zero, max: zero };
    }
    
    const min = points[0].clone();
    const max = points[0].clone();
    
    points.forEach(point => {
      min.min(point);
      max.max(point);
    });
    
    const size = new THREE.Vector3().subVectors(max, min);
    const center = new THREE.Vector3().addVectors(min, max).divideScalar(2);
    
    return { center, size, min, max };
  }

  private extractBoundaryVertices(surface: SurfaceCluster): THREE.Vector3[] {
    const allVertices = surface.faces.flatMap(f => f.vertices);
    return this.removeDuplicateVertices(allVertices);
  }

  private calculateCentroid(vertices: THREE.Vector3[]): { x: number; y: number; z: number } {
    const center = vertices.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vertices.length);
    return { x: center.x, y: center.y, z: center.z };
  }

  private calculateSurfaceCentroid(surface: SurfaceCluster): THREE.Vector3 {
    const centroid = new THREE.Vector3();
    surface.faces.forEach(face => {
      centroid.add(face.center);
    });
    centroid.divideScalar(surface.faces.length);
    return centroid;
  }

  private calculateRealisticMachiningTime(features: Feature[]): string {
    let totalTime = 0;
    const uniqueTools = new Set();
    
    features.forEach(feature => {
      // Add tool type based on feature
      switch (feature.type) {
        case 'pocket':
          uniqueTools.add('endmill');
          // Realistic time calculation for pocket machining
          const volume = (feature.dimensions.width * feature.dimensions.length * feature.dimensions.depth) / 1000; // cm³
          const materialRemovalRate = 3.5; // cm³/min for aluminum roughing
          const roughingTime = volume / materialRemovalRate;
          const finishingTime = this.calculateContourTime(feature);
          totalTime += roughingTime + finishingTime;
          break;
          
        case 'hole':
          uniqueTools.add('drill');
          const diameter = feature.dimensions.diameter;
          const depth = feature.dimensions.depth || diameter * 2.5;
          const feedPerRev = 0.05 * diameter; // mm/rev
          const spindleSpeed = Math.min(2000, 100000 / diameter); // Surface speed limited
          const pecks = Math.ceil(depth / (diameter * 3)); // Conservative peck depth
          const drillTime = (depth * (1 + pecks * 0.3)) / (feedPerRev * spindleSpeed / 60) + pecks * 0.1;
          totalTime += drillTime;
          break;
          
        case 'slot':
          uniqueTools.add('endmill');
          const slotLength = feature.dimensions.length;
          const slotWidth = feature.dimensions.width;
          const slotDepth = feature.dimensions.depth || 5;
          // Multiple passes needed for width
          const passes = Math.ceil(slotWidth / (slotWidth * 0.6)); // 60% stepover
          const slotTime = (slotLength * passes * slotDepth) / 1000; // Rough calculation
          totalTime += slotTime;
          break;
          
        case 'chamfer':
          uniqueTools.add('chamfer');
          const perimeter = this.calculateFeaturePerimeter(feature);
          const chamferFeedrate = 500; // mm/min
          totalTime += perimeter / chamferFeedrate + 0.5;
          break;
          
        case 'step':
          uniqueTools.add('endmill');
          totalTime += 3; // Typical step operation
          break;
      }
    });
    
    // Add setup and tool change time
    const setupTime = uniqueTools.size * 2.5; // 2.5 min per tool
    const safetyMargin = totalTime * 0.15; // 15% safety margin
    
    totalTime += setupTime + safetyMargin;
    
    // Ensure realistic range: 15-90 minutes for typical parts
    totalTime = Math.max(15, Math.min(90, totalTime));
    
    return `${Math.round(totalTime)} minutes`;
  }
  
  private calculateContourTime(feature: Feature): number {
    const perimeter = 2 * (feature.dimensions.width + feature.dimensions.length);
    const finishingFeedrate = 800; // mm/min for finishing
    return (perimeter / finishingFeedrate) + 1; // +1 min for approach/retract
  }
  
  private calculateFeaturePerimeter(feature: Feature): number {
    switch (feature.type) {
      case 'pocket':
        return 2 * (feature.dimensions.width + feature.dimensions.length);
      case 'hole':
        return Math.PI * feature.dimensions.diameter;
      case 'slot':
        return 2 * feature.dimensions.length + Math.PI * feature.dimensions.width;
      default:
        return 50; // Default perimeter
    }
  }

  private calculateActualVolume(): number {
    return this.faces.reduce((sum, face) => sum + face.area, 0) * 0.1; // Simplified volume calculation
  }

  private calculateSurfaceArea(): number {
    return this.faces.reduce((sum, face) => sum + face.area, 0);
  }

  private assessComplexity(features: Feature[]): string {
    const complexityScore = features.reduce((score, feature) => {
      let featureComplexity = 1;
      if (feature.type === 'slot') featureComplexity = 2;
      if (feature.type === 'chamfer') featureComplexity = 1.5;
      if (feature.confidence < 0.8) featureComplexity *= 1.5; // Uncertain features add complexity
      return score + featureComplexity;
    }, 0);
    
    if (complexityScore > 15) return "High";
    if (complexityScore > 8) return "Medium";
    return "Low";
  }
}