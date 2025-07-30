import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';

interface GeometricFeature {
  id: string;
  type: 'hole' | 'pocket' | 'slot' | 'boss' | 'step' | 'chamfer' | 'fillet' | 'groove';
  confidence: number;
  position: THREE.Vector3;
  dimensions: Record<string, number>;
  boundingBox: THREE.Box3;
  normal?: THREE.Vector3;
  adjacentFaces: number[];
  geometricAttributes: {
    curvature: number;
    planarity: number;
    cylindricity?: number;
    concentricity?: number;
  };
}

interface GeometricGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  adjacencyMatrix: number[][];
}

interface GraphNode {
  id: number;
  type: 'face' | 'edge' | 'vertex';
  attributes: {
    area?: number;
    normal?: THREE.Vector3;
    centroid: THREE.Vector3;
    curvature: number;
    planarity: number;
  };
}

interface GraphEdge {
  source: number;
  target: number;
  type: 'adjacent' | 'coplanar' | 'concave' | 'convex';
  weight: number;
}

/**
 * AAGNet-Inspired Feature Recognition System
 * 
 * This implements the core concepts from AAGNet paper:
 * "A Graph Neural Network towards Multi-task Machining Feature Recognition"
 * 
 * Key Features:
 * - Geometric Attributed Adjacency Graph (gAAG) construction
 * - Multi-scale topological analysis
 * - Graph neural network-inspired feature classification
 * - Machining feature semantic understanding
 */
export class AAGNetInspiredAnalyzer {
  private geometry: THREE.BufferGeometry;
  private vertices: Float32Array;
  private normals: Float32Array;
  private faces: number[][];
  private geometricGraph: GeometricGraph | null = null;
  
  // AAGNet-inspired parameters (relaxed for initial testing)
  private readonly FEATURE_RECOGNITION_THRESHOLD = 0.3; // Lowered from 0.75 to 0.3
  private readonly GEOMETRIC_TOLERANCE = 1e-6;
  private readonly MIN_FEATURE_SIZE = 0.1; // Lowered from 0.5 to 0.1 mm
  
  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    this.vertices = geometry.attributes.position.array as Float32Array;
    this.normals = geometry.attributes.normal?.array as Float32Array || new Float32Array(this.vertices.length);
    this.faces = this.extractFaces();
    
    // Initialize TensorFlow.js for GNN computations
    this.initializeTensorFlow();
  }

  private async initializeTensorFlow() {
    await tf.ready();
    console.log('AAGNet-Inspired Analyzer: TensorFlow.js ready with backend:', tf.getBackend());
  }

  private extractFaces(): number[][] {
    const faces: number[][] = [];
    const positionAttribute = this.geometry.attributes.position;
    
    for (let i = 0; i < positionAttribute.count; i += 3) {
      faces.push([i, i + 1, i + 2]);
    }
    
    return faces;
  }

  /**
   * Main feature recognition pipeline following AAGNet methodology
   */
  async recognizeFeatures(): Promise<GeometricFeature[]> {
    console.log('AAGNet-Inspired: Starting feature recognition pipeline...');
    console.log('AAGNet-Inspired: Geometry info:', {
      vertices: this.vertices.length / 3,
      faces: this.faces.length,
      hasNormals: this.normals.length > 0
    });
    
    // Step 1: Construct Geometric Attributed Adjacency Graph (gAAG)
    console.log('AAGNet-Inspired: Step 1 - Constructing geometric graph...');
    this.geometricGraph = await this.constructGeometricGraph();
    console.log('AAGNet-Inspired: Graph constructed with', this.geometricGraph.nodes.length, 'nodes and', this.geometricGraph.edges.length, 'edges');
    
    // Step 2: Multi-scale topological analysis
    console.log('AAGNet-Inspired: Step 2 - Analyzing topology...');
    const topologicalFeatures = await this.analyzeTopology();
    console.log('AAGNet-Inspired: Found', topologicalFeatures.length, 'topological features');
    
    // Step 3: Geometric attribute analysis
    console.log('AAGNet-Inspired: Step 3 - Analyzing geometric attributes...');
    const geometricAttributes = await this.analyzeGeometricAttributes();
    
    // Step 4: Feature classification using graph neural network principles
    console.log('AAGNet-Inspired: Step 4 - Classifying features...');
    const classifiedFeatures = await this.classifyFeatures(topologicalFeatures, geometricAttributes);
    console.log('AAGNet-Inspired: Classified', classifiedFeatures.length, 'features');
    
    // Step 5: Post-processing and validation
    console.log('AAGNet-Inspired: Step 5 - Validating features...');
    const validatedFeatures = this.validateAndRefineFeatures(classifiedFeatures);
    
    console.log(`AAGNet-Inspired: Recognition complete - ${validatedFeatures.length} validated features out of ${classifiedFeatures.length} classified`);
    return validatedFeatures;
  }

  /**
   * Construct Geometric Attributed Adjacency Graph (gAAG)
   * Following AAGNet's graph construction methodology
   */
  private async constructGeometricGraph(): Promise<GeometricGraph> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    
    // Create face nodes with geometric attributes
    for (let i = 0; i < this.faces.length; i++) {
      const face = this.faces[i];
      const faceAttributes = this.computeFaceAttributes(face);
      
      nodes.push({
        id: i,
        type: 'face',
        attributes: faceAttributes
      });
    }
    
    // Create adjacency edges based on geometric relationships
    const adjacencyMatrix = this.computeAdjacencyMatrix(nodes);
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (adjacencyMatrix[i][j] > 0) {
          const edgeType = this.classifyEdgeRelationship(nodes[i], nodes[j]);
          edges.push({
            source: i,
            target: j,
            type: edgeType,
            weight: adjacencyMatrix[i][j]
          });
        }
      }
    }
    
    return { nodes, edges, adjacencyMatrix };
  }

  private computeFaceAttributes(face: number[]): GraphNode['attributes'] {
    const v1 = new THREE.Vector3(
      this.vertices[face[0] * 3],
      this.vertices[face[0] * 3 + 1],
      this.vertices[face[0] * 3 + 2]
    );
    const v2 = new THREE.Vector3(
      this.vertices[face[1] * 3],
      this.vertices[face[1] * 3 + 1],
      this.vertices[face[1] * 3 + 2]
    );
    const v3 = new THREE.Vector3(
      this.vertices[face[2] * 3],
      this.vertices[face[2] * 3 + 1],
      this.vertices[face[2] * 3 + 2]
    );
    
    // Compute face normal
    const edge1 = v2.clone().sub(v1);
    const edge2 = v3.clone().sub(v1);
    const normal = edge1.cross(edge2).normalize();
    
    // Compute centroid
    const centroid = v1.clone().add(v2).add(v3).divideScalar(3);
    
    // Compute area
    const area = edge1.cross(edge2).length() / 2;
    
    // Compute curvature (simplified)
    const curvature = this.computeFaceCurvature(face);
    
    // Compute planarity (0 = perfectly planar, 1 = highly curved)
    const planarity = this.computePlanarity(face);
    
    return {
      area,
      normal,
      centroid,
      curvature,
      planarity
    };
  }

  private computeFaceCurvature(face: number[]): number {
    // Simplified curvature computation based on normal variation
    const normals = face.map(vertexIndex => 
      new THREE.Vector3(
        this.normals[vertexIndex * 3],
        this.normals[vertexIndex * 3 + 1],
        this.normals[vertexIndex * 3 + 2]
      )
    );
    
    const avgNormal = normals.reduce((sum, n) => sum.add(n), new THREE.Vector3()).divideScalar(normals.length);
    const normalVariation = normals.reduce((sum, n) => sum + avgNormal.distanceTo(n), 0) / normals.length;
    
    return normalVariation;
  }

  private computePlanarity(face: number[]): number {
    // Measure how planar the face is (0 = perfect plane, 1 = highly non-planar)
    const vertices = face.map(vertexIndex => 
      new THREE.Vector3(
        this.vertices[vertexIndex * 3],
        this.vertices[vertexIndex * 3 + 1],
        this.vertices[vertexIndex * 3 + 2]
      )
    );
    
    // Fit plane and measure deviation
    const plane = new THREE.Plane();
    plane.setFromCoplanarPoints(vertices[0], vertices[1], vertices[2]);
    
    const maxDeviation = vertices.reduce((max, vertex) => 
      Math.max(max, Math.abs(plane.distanceToPoint(vertex))), 0
    );
    
    return Math.min(maxDeviation * 100, 1); // Normalize to [0,1]
  }

  private computeAdjacencyMatrix(nodes: GraphNode[]): number[][] {
    const matrix = Array(nodes.length).fill(null).map(() => Array(nodes.length).fill(0));
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = this.computeGeometricSimilarity(nodes[i], nodes[j]);
        const adjacency = this.computeSpatialAdjacency(nodes[i], nodes[j]);
        
        // Combined adjacency score
        const weight = (similarity + adjacency) / 2;
        if (weight > 0.5) {
          matrix[i][j] = matrix[j][i] = weight;
        }
      }
    }
    
    return matrix;
  }

  private computeGeometricSimilarity(node1: GraphNode, node2: GraphNode): number {
    if (!node1.attributes.normal || !node2.attributes.normal) return 0;
    
    // Normal similarity
    const normalSimilarity = Math.max(0, node1.attributes.normal.dot(node2.attributes.normal));
    
    // Curvature similarity
    const curvatureDiff = Math.abs(node1.attributes.curvature - node2.attributes.curvature);
    const curvatureSimilarity = Math.exp(-curvatureDiff * 10);
    
    // Planarity similarity
    const planarityDiff = Math.abs(node1.attributes.planarity - node2.attributes.planarity);
    const planaritySimilarity = Math.exp(-planarityDiff * 5);
    
    return (normalSimilarity + curvatureSimilarity + planaritySimilarity) / 3;
  }

  private computeSpatialAdjacency(node1: GraphNode, node2: GraphNode): number {
    const distance = node1.attributes.centroid.distanceTo(node2.attributes.centroid);
    const avgSize = Math.sqrt((node1.attributes.area || 0) + (node2.attributes.area || 0)) / 2;
    
    // Normalize distance by average face size
    const normalizedDistance = distance / (avgSize + 1e-6);
    
    // Exponential decay for adjacency
    return Math.exp(-normalizedDistance * 2);
  }

  private classifyEdgeRelationship(node1: GraphNode, node2: GraphNode): GraphEdge['type'] {
    if (!node1.attributes.normal || !node2.attributes.normal) return 'adjacent';
    
    const dotProduct = node1.attributes.normal.dot(node2.attributes.normal);
    
    if (dotProduct > 0.95) return 'coplanar';
    if (dotProduct < -0.1) return 'concave';
    if (dotProduct > 0.1) return 'convex';
    
    return 'adjacent';
  }

  /**
   * Multi-scale topological analysis following AAGNet methodology
   */
  private async analyzeTopology(): Promise<any[]> {
    if (!this.geometricGraph) return [];
    
    const topologicalFeatures = [];
    
    // Detect connected components
    console.log('AAGNet-Inspired: Finding connected components...');
    const components = this.findConnectedComponents();
    console.log('AAGNet-Inspired: Found', components.length, 'connected components');
    
    // Analyze each component for potential features
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      console.log(`AAGNet-Inspired: Analyzing component ${i + 1} with ${component.length} faces`);
      
      // Detect holes (circular patterns)
      const holes = this.detectCircularPatterns(component);
      console.log(`AAGNet-Inspired: Found ${holes.length} hole patterns in component ${i + 1}`);
      topologicalFeatures.push(...holes);
      
      // Detect pockets (concave regions)
      const pockets = this.detectConcaveRegions(component);
      console.log(`AAGNet-Inspired: Found ${pockets.length} pocket regions in component ${i + 1}`);
      topologicalFeatures.push(...pockets);
      
      // Detect slots (elongated concave features)
      const slots = this.detectElongatedFeatures(component);
      console.log(`AAGNet-Inspired: Found ${slots.length} slot features in component ${i + 1}`);
      topologicalFeatures.push(...slots);
    }
    
    console.log('AAGNet-Inspired: Total topological features found:', topologicalFeatures.length);
    return topologicalFeatures;
  }

  private findConnectedComponents(): number[][] {
    if (!this.geometricGraph) return [];
    
    const visited = new Set<number>();
    const components: number[][] = [];
    
    for (let i = 0; i < this.geometricGraph.nodes.length; i++) {
      if (!visited.has(i)) {
        const component = this.dfsComponent(i, visited);
        if (component.length > 3) { // Minimum component size
          components.push(component);
        }
      }
    }
    
    return components;
  }

  private dfsComponent(startNode: number, visited: Set<number>): number[] {
    const component: number[] = [];
    const stack = [startNode];
    
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      
      visited.add(node);
      component.push(node);
      
      // Add adjacent nodes
      if (this.geometricGraph) {
        for (const edge of this.geometricGraph.edges) {
          if (edge.source === node && !visited.has(edge.target)) {
            stack.push(edge.target);
          }
          if (edge.target === node && !visited.has(edge.source)) {
            stack.push(edge.source);
          }
        }
      }
    }
    
    return component;
  }

  private detectCircularPatterns(component: number[]): any[] {
    // Implement circular pattern detection for holes
    const patterns = [];
    
    // Group nodes by spatial proximity
    const spatialClusters = this.clusterNodesSpatially(component);
    
    for (const cluster of spatialClusters) {
      const circularity = this.measureCircularity(cluster);
      
      if (circularity > 0.8) {
        const center = this.computeClusterCenter(cluster);
        const radius = this.estimateClusterRadius(cluster, center);
        
        patterns.push({
          type: 'hole',
          nodes: cluster,
          center,
          radius,
          confidence: circularity
        });
      }
    }
    
    return patterns;
  }

  private detectConcaveRegions(component: number[]): any[] {
    // Implement concave region detection for pockets
    const regions = [];
    
    // Analyze curvature and concavity
    for (const nodeId of component) {
      const node = this.geometricGraph?.nodes[nodeId];
      if (!node) continue;
      
      if (node.attributes.curvature > 0.3 && node.attributes.planarity < 0.5) {
        // Potential pocket region
        const neighbors = this.getNodeNeighbors(nodeId);
        const avgCurvature = this.computeAverageCurvature(neighbors);
        
        if (avgCurvature > 0.4) {
          regions.push({
            type: 'pocket',
            centerNode: nodeId,
            neighbors,
            curvature: avgCurvature,
            confidence: Math.min(avgCurvature * 2, 1)
          });
        }
      }
    }
    
    return regions;
  }

  private detectElongatedFeatures(component: number[]): any[] {
    // Implement elongated feature detection for slots
    const features = [];
    
    const boundingBox = this.computeComponentBoundingBox(component);
    const aspectRatio = Math.max(
      boundingBox.max.x - boundingBox.min.x,
      boundingBox.max.y - boundingBox.min.y,
      boundingBox.max.z - boundingBox.min.z
    ) / Math.min(
      boundingBox.max.x - boundingBox.min.x,
      boundingBox.max.y - boundingBox.min.y,
      boundingBox.max.z - boundingBox.min.z
    );
    
    if (aspectRatio > 3) {
      const avgCurvature = this.computeAverageCurvature(component);
      if (avgCurvature > 0.2) {
        features.push({
          type: 'slot',
          nodes: component,
          aspectRatio,
          curvature: avgCurvature,
          boundingBox,
          confidence: Math.min(aspectRatio / 5, 1) * Math.min(avgCurvature * 3, 1)
        });
      }
    }
    
    return features;
  }

  // Helper methods for topological analysis
  private clusterNodesSpatially(nodeIds: number[]): number[][] {
    // Simple spatial clustering based on proximity
    const clusters: number[][] = [];
    const visited = new Set<number>();
    
    for (const nodeId of nodeIds) {
      if (visited.has(nodeId)) continue;
      
      const cluster = [nodeId];
      visited.add(nodeId);
      
      // Find nearby nodes
      const node = this.geometricGraph?.nodes[nodeId];
      if (!node) continue;
      
      for (const otherNodeId of nodeIds) {
        if (visited.has(otherNodeId)) continue;
        
        const otherNode = this.geometricGraph?.nodes[otherNodeId];
        if (!otherNode) continue;
        
        const distance = node.attributes.centroid.distanceTo(otherNode.attributes.centroid);
        if (distance < 10) { // Clustering threshold
          cluster.push(otherNodeId);
          visited.add(otherNodeId);
        }
      }
      
      if (cluster.length >= 3) {
        clusters.push(cluster);
      }
    }
    
    return clusters;
  }

  private measureCircularity(nodeIds: number[]): number {
    if (nodeIds.length < 3) return 0;
    
    const centroids = nodeIds.map(id => this.geometricGraph?.nodes[id]?.attributes.centroid).filter(Boolean);
    if (centroids.length === 0) return 0;
    
    // Compute center
    const center = centroids.reduce((sum, p) => sum.add(p!), new THREE.Vector3()).divideScalar(centroids.length);
    
    // Compute distances from center
    const distances = centroids.map(p => center.distanceTo(p!));
    const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
    
    // Circularity = 1 - (variance / avgDistance^2)
    return Math.max(0, 1 - variance / (avgDistance * avgDistance + 1e-6));
  }

  private computeClusterCenter(nodeIds: number[]): THREE.Vector3 {
    const centroids = nodeIds.map(id => this.geometricGraph?.nodes[id]?.attributes.centroid).filter(Boolean);
    return centroids.reduce((sum, p) => sum.add(p!), new THREE.Vector3()).divideScalar(centroids.length);
  }

  private estimateClusterRadius(nodeIds: number[], center: THREE.Vector3): number {
    const distances = nodeIds.map(id => {
      const node = this.geometricGraph?.nodes[id];
      return node ? center.distanceTo(node.attributes.centroid) : 0;
    });
    return distances.reduce((sum, d) => sum + d, 0) / distances.length;
  }

  private getNodeNeighbors(nodeId: number): number[] {
    if (!this.geometricGraph) return [];
    
    const neighbors: number[] = [];
    for (const edge of this.geometricGraph.edges) {
      if (edge.source === nodeId) neighbors.push(edge.target);
      if (edge.target === nodeId) neighbors.push(edge.source);
    }
    return neighbors;
  }

  private computeAverageCurvature(nodeIds: number[]): number {
    const curvatures = nodeIds.map(id => this.geometricGraph?.nodes[id]?.attributes.curvature || 0);
    return curvatures.reduce((sum, c) => sum + c, 0) / curvatures.length;
  }

  private computeComponentBoundingBox(nodeIds: number[]): THREE.Box3 {
    const box = new THREE.Box3();
    for (const nodeId of nodeIds) {
      const node = this.geometricGraph?.nodes[nodeId];
      if (node) {
        box.expandByPoint(node.attributes.centroid);
      }
    }
    return box;
  }

  /**
   * Geometric attribute analysis
   */
  private async analyzeGeometricAttributes(): Promise<any> {
    // Implement geometric attribute analysis
    return {};
  }

  /**
   * Feature classification using graph neural network principles
   */
  private async classifyFeatures(topologicalFeatures: any[], geometricAttributes: any): Promise<GeometricFeature[]> {
    const features: GeometricFeature[] = [];
    
    for (const topoFeature of topologicalFeatures) {
      const feature = this.convertToGeometricFeature(topoFeature);
      if (feature && feature.confidence > this.FEATURE_RECOGNITION_THRESHOLD) {
        features.push(feature);
      }
    }
    
    return features;
  }

  private convertToGeometricFeature(topoFeature: any): GeometricFeature | null {
    if (!topoFeature.center && !topoFeature.centerNode) return null;
    
    const position = topoFeature.center || 
      (topoFeature.centerNode !== undefined ? 
        this.geometricGraph?.nodes[topoFeature.centerNode]?.attributes.centroid : 
        new THREE.Vector3());
    
    if (!position) return null;
    
    const boundingBox = new THREE.Box3().setFromCenterAndSize(
      position,
      new THREE.Vector3(
        topoFeature.radius ? topoFeature.radius * 2 : 5,
        topoFeature.radius ? topoFeature.radius * 2 : 5,
        topoFeature.radius ? topoFeature.radius : 2
      )
    );
    
    let dimensions: Record<string, number> = {};
    
    switch (topoFeature.type) {
      case 'hole':
        dimensions = {
          diameter: (topoFeature.radius || 2) * 2,
          depth: topoFeature.radius || 2
        };
        break;
      case 'pocket':
      case 'slot':
        const size = topoFeature.boundingBox ? 
          new THREE.Vector3().subVectors(topoFeature.boundingBox.max, topoFeature.boundingBox.min) :
          new THREE.Vector3(5, 5, 2);
        dimensions = {
          length: size.x,
          width: size.y,
          depth: size.z
        };
        break;
    }
    
    return {
      id: `${topoFeature.type}_${Math.random().toString(36).substr(2, 9)}`,
      type: topoFeature.type,
      confidence: topoFeature.confidence || 0.8,
      position,
      dimensions,
      boundingBox,
      adjacentFaces: topoFeature.nodes || [],
      geometricAttributes: {
        curvature: topoFeature.curvature || 0,
        planarity: 1 - (topoFeature.curvature || 0)
      }
    };
  }

  /**
   * Post-processing and validation
   */
  private validateAndRefineFeatures(features: GeometricFeature[]): GeometricFeature[] {
    console.log('AAGNet-Inspired: Validating', features.length, 'features...');
    console.log('AAGNet-Inspired: Validation thresholds - Size:', this.MIN_FEATURE_SIZE, 'Confidence:', this.FEATURE_RECOGNITION_THRESHOLD);
    
    const validated = features.filter((feature, index) => {
      // Size validation
      const maxDim = Math.max(...Object.values(feature.dimensions));
      const sizeValid = maxDim >= this.MIN_FEATURE_SIZE;
      
      // Confidence validation
      const confidenceValid = feature.confidence >= this.FEATURE_RECOGNITION_THRESHOLD;
      
      console.log(`AAGNet-Inspired: Feature ${index + 1} (${feature.type}): size=${maxDim.toFixed(2)}, confidence=${feature.confidence.toFixed(2)}, sizeValid=${sizeValid}, confidenceValid=${confidenceValid}`);
      
      return sizeValid && confidenceValid;
    });
    
    console.log('AAGNet-Inspired: After validation:', validated.length, 'features remain');
    return validated;
  }
}