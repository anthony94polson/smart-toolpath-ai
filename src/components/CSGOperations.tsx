import * as THREE from 'three';

/**
 * CSG (Constructive Solid Geometry) operations for realistic material removal
 */
export class CSGOperations {
  /**
   * Remove material from a workpiece using a tool path
   */
  static removeMaterial(
    workpieceGeometry: THREE.BufferGeometry,
    toolGeometry: THREE.BufferGeometry,
    toolPath: THREE.Vector3[],
    toolRadius: number
  ): THREE.BufferGeometry {
    // Clone the original geometry
    const resultGeometry = workpieceGeometry.clone();
    const positions = resultGeometry.attributes.position.array as Float32Array;
    const vertices = [];
    
    // Convert positions to vertices for easier manipulation
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push(new THREE.Vector3(
        positions[i],
        positions[i + 1], 
        positions[i + 2]
      ));
    }
    
    // For each point along the tool path, remove material
    toolPath.forEach((toolPosition, pathIndex) => {
      vertices.forEach((vertex, vertexIndex) => {
        const distance = vertex.distanceTo(toolPosition);
        
        // If vertex is within tool radius, mark for removal or displacement
        if (distance < toolRadius) {
          const removalFactor = Math.max(0, 1 - (distance / toolRadius));
          
          // Displace vertex away from tool center
          const direction = new THREE.Vector3()
            .subVectors(vertex, toolPosition)
            .normalize();
          
          if (direction.length() === 0) {
            // If at exact center, displace downward
            direction.set(0, 0, -1);
          }
          
          vertex.add(direction.multiplyScalar(removalFactor * toolRadius * 0.1));
        }
      });
    });
    
    // Update geometry positions
    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      positions[i * 3] = vertex.x;
      positions[i * 3 + 1] = vertex.y;
      positions[i * 3 + 2] = vertex.z;
    }
    
    resultGeometry.attributes.position.needsUpdate = true;
    resultGeometry.computeVertexNormals();
    resultGeometry.computeBoundingBox();
    
    return resultGeometry;
  }
  
  /**
   * Create a more realistic drilling operation
   */
  static drillHole(
    workpieceGeometry: THREE.BufferGeometry,
    position: THREE.Vector3,
    diameter: number,
    depth: number
  ): THREE.BufferGeometry {
    const resultGeometry = workpieceGeometry.clone();
    const positions = resultGeometry.attributes.position.array as Float32Array;
    const radius = diameter / 2;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const distanceFromCenter = Math.sqrt(
        Math.pow(x - position.x, 2) + 
        Math.pow(y - position.y, 2)
      );
      
      // If within drill radius and above drill depth, remove material
      if (distanceFromCenter <= radius && z >= position.z - depth && z <= position.z) {
        // Move vertex far below to simulate removal
        positions[i + 2] = position.z - depth - 1;
      }
    }
    
    resultGeometry.attributes.position.needsUpdate = true;
    resultGeometry.computeVertexNormals();
    
    return resultGeometry;
  }
  
  /**
   * Create a pocket milling operation
   */
  static millPocket(
    workpieceGeometry: THREE.BufferGeometry,
    pocketCenter: THREE.Vector3,
    width: number,
    length: number,
    depth: number
  ): THREE.BufferGeometry {
    const resultGeometry = workpieceGeometry.clone();
    const positions = resultGeometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Check if point is within pocket bounds
      const withinX = Math.abs(x - pocketCenter.x) <= width / 2;
      const withinY = Math.abs(y - pocketCenter.y) <= length / 2;
      const withinZ = z >= pocketCenter.z - depth && z <= pocketCenter.z;
      
      if (withinX && withinY && withinZ) {
        // Progressive removal based on distance from edge
        const edgeDistanceX = (width / 2) - Math.abs(x - pocketCenter.x);
        const edgeDistanceY = (length / 2) - Math.abs(y - pocketCenter.y);
        const minEdgeDistance = Math.min(edgeDistanceX, edgeDistanceY);
        
        if (minEdgeDistance > 0) {
          positions[i + 2] = pocketCenter.z - depth;
        }
      }
    }
    
    resultGeometry.attributes.position.needsUpdate = true;
    resultGeometry.computeVertexNormals();
    
    return resultGeometry;
  }
  
  /**
   * Apply multiple operations in sequence
   */
  static applyOperationSequence(
    initialGeometry: THREE.BufferGeometry,
    operations: Array<{
      type: 'drill' | 'pocket' | 'contour';
      parameters: any;
    }>
  ): THREE.BufferGeometry {
    let currentGeometry = initialGeometry.clone();
    
    operations.forEach(operation => {
      switch (operation.type) {
        case 'drill':
          currentGeometry = this.drillHole(
            currentGeometry,
            operation.parameters.position,
            operation.parameters.diameter,
            operation.parameters.depth
          );
          break;
        case 'pocket':
          currentGeometry = this.millPocket(
            currentGeometry,
            operation.parameters.center,
            operation.parameters.width,
            operation.parameters.length,
            operation.parameters.depth
          );
          break;
        // Add more operation types as needed
      }
    });
    
    return currentGeometry;
  }
}