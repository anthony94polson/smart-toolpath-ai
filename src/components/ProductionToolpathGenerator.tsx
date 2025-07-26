import React from 'react';
import * as THREE from 'three';

export interface FeatureGeometry {
  type: 'pocket' | 'hole' | 'slot' | 'chamfer' | 'step' | 'boss' | 'rib';
  dimensions: { [key: string]: number };
  position: { x: number; y: number; z: number };
  boundaryVertices?: THREE.Vector3[];
  surfaceNormal?: THREE.Vector3;
}

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedrate: number;
  spindleSpeed: number;
}

export interface ToolDefinition {
  id: string;
  type: 'endmill' | 'drill' | 'chamfer' | 'ballmill';
  diameter: number;
  length: number;
  flutes: number;
  material: 'hss' | 'carbide';
  coating?: string;
}

export interface CuttingParameters {
  feedrate: number; // mm/min
  spindleSpeed: number; // RPM
  axialDepth: number; // mm
  radialDepth: number; // mm
  plungeRate: number; // mm/min
}

export interface ToolpathSegment {
  type: 'rapid' | 'linear' | 'arc' | 'drill' | 'retract';
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  feedrate?: number;
  arcCenter?: THREE.Vector3;
  clockwise?: boolean;
}

export interface Operation {
  id: string;
  type: 'roughing' | 'finishing' | 'drilling' | 'chamfering';
  name: string;
  feature: FeatureGeometry;
  tool: ToolDefinition;
  parameters: CuttingParameters;
  toolpath: ToolpathSegment[];
  estimatedTime: number; // minutes
  materialRemovalRate: number; // cm³/min
}

export class ProductionToolpathGenerator {
  private stockBoundary: THREE.Box3;
  private safeHeight: number = 5; // mm above stock
  private retractHeight: number = 2; // mm above stock

  constructor(stockBoundary: THREE.Box3) {
    this.stockBoundary = stockBoundary;
  }

  public generateOperations(features: FeatureGeometry[], toolAssignments: any[]): Operation[] {
    const operations: Operation[] = [];

    for (const feature of features) {
      const assignment = toolAssignments.find(a => a.featureId === (feature as any).id);
      if (!assignment) continue;

      const tool = this.getToolDefinition(assignment.toolId);
      const operation = this.generateOperationForFeature(feature, tool);
      if (operation) operations.push(operation);
    }

    // Sort operations by logical machining sequence
    return this.optimizeOperationSequence(operations);
  }

  private generateOperationForFeature(feature: FeatureGeometry, tool: ToolDefinition): Operation | null {
    switch (feature.type) {
      case 'pocket':
        return this.generatePocketOperation(feature, tool);
      case 'hole':
        return this.generateDrillingOperation(feature, tool);
      case 'slot':
        return this.generateSlotOperation(feature, tool);
      case 'chamfer':
        return this.generateChamferOperation(feature, tool);
      case 'step':
        return this.generatePocketOperation(feature, tool); // Treat step like pocket
      case 'boss':
        return this.generateBossOperation(feature, tool);
      case 'rib':
        return this.generateRibOperation(feature, tool);
      default:
        return null;
    }
  }

  private generatePocketOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    const roughingOp = this.generateRoughingOperation(feature, tool);
    const finishingOp = this.generateFinishingOperation(feature, tool);
    
    // For now, return the roughing operation (in practice, you'd return both)
    return roughingOp;
  }

  private generateRoughingOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    const parameters = this.calculateCuttingParameters(feature, tool, 'roughing');
    const toolpath = this.generateAdaptiveClearingToolpath(feature, tool, parameters);
    
    return {
      id: `ROUGH_${feature.type}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'roughing',
      name: `Roughing - ${feature.type.toUpperCase()}`,
      feature,
      tool,
      parameters,
      toolpath,
      estimatedTime: this.calculateMachiningTime(toolpath, parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private generateFinishingOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    const parameters = this.calculateCuttingParameters(feature, tool, 'finishing');
    const toolpath = this.generateContourFinishingToolpath(feature, tool, parameters);
    
    return {
      id: `FINISH_${feature.type}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'finishing',
      name: `Finishing - ${feature.type.toUpperCase()}`,
      feature,
      tool,
      parameters,
      toolpath,
      estimatedTime: this.calculateMachiningTime(toolpath, parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private generateDrillingOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    const parameters = this.calculateCuttingParameters(feature, tool, 'drilling');
    const toolpath = this.generateDrillingToolpath(feature, tool, parameters);
    
    return {
      id: `DRILL_${Math.random().toString(36).substr(2, 6)}`,
      type: 'drilling',
      name: `Drilling - Ø${feature.dimensions.diameter}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      estimatedTime: this.calculateMachiningTime(toolpath, parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private generateSlotOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    const parameters = this.calculateCuttingParameters(feature, tool, 'roughing');
    const toolpath = this.generateSlotToolpath(feature, tool, parameters);
    
    return {
      id: `SLOT_${Math.random().toString(36).substr(2, 6)}`,
      type: 'roughing',
      name: `Slot Milling - ${feature.dimensions.width}x${feature.dimensions.length}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      estimatedTime: this.calculateMachiningTime(toolpath, parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private generateChamferOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    const parameters = this.calculateCuttingParameters(feature, tool, 'chamfering');
    const toolpath = this.generateChamferToolpath(feature, tool, parameters);
    
    return {
      id: `CHAMFER_${Math.random().toString(36).substr(2, 6)}`,
      type: 'chamfering',
      name: `Chamfer - ${feature.dimensions.width}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      estimatedTime: this.calculateMachiningTime(toolpath, parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private generateAdaptiveClearingToolpath(
    feature: FeatureGeometry, 
    tool: ToolDefinition, 
    params: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const stepover = tool.diameter * 0.6; // 60% stepover for roughing
    const depth = feature.dimensions.depth || 10;
    
    // Rapid to safe height
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, this.safeHeight)
    });

    // Generate adaptive clearing pattern
    const numPasses = Math.ceil(depth / params.axialDepth);
    
    for (let pass = 0; pass < numPasses; pass++) {
      const currentDepth = Math.min((pass + 1) * params.axialDepth, depth);
      const zLevel = feature.position.z - currentDepth;
      
      // Trochoidal milling pattern for material removal
      const spiralRadius = Math.min(feature.dimensions.width, feature.dimensions.length) / 2 - tool.diameter / 2;
      const trochoidalRadius = tool.diameter * 0.1; // Small circular motion
      
      for (let angle = 0; angle < Math.PI * 8; angle += 0.2) {
        const mainRadius = spiralRadius * (1 - angle / (Math.PI * 8));
        const mainX = center.x + Math.cos(angle) * mainRadius;
        const mainY = center.y + Math.sin(angle) * mainRadius;
        
        // Add trochoidal motion
        const trochX = mainX + Math.cos(angle * 10) * trochoidalRadius;
        const trochY = mainY + Math.sin(angle * 10) * trochoidalRadius;
        
        const point = new THREE.Vector3(trochX, trochY, zLevel);
        
        toolpath.push({
          type: 'linear',
          startPoint: toolpath[toolpath.length - 1]?.endPoint || point,
          endPoint: point,
          feedrate: params.feedrate
        });
      }
    }

    // Retract to safe height
    const lastPoint = toolpath[toolpath.length - 1].endPoint;
    toolpath.push({
      type: 'retract',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight)
    });

    return toolpath;
  }

  private generateContourFinishingToolpath(
    feature: FeatureGeometry, 
    tool: ToolDefinition, 
    params: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    
    // Use boundary vertices if available, otherwise generate rectangle
    const boundary = feature.boundaryVertices || this.generateRectangularBoundary(feature);
    
    // Rapid to start position
    const startPoint = boundary[0];
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(startPoint.x, startPoint.y, this.safeHeight),
      endPoint: new THREE.Vector3(startPoint.x, startPoint.y, this.retractHeight)
    });

    // Plunge to depth
    toolpath.push({
      type: 'linear',
      startPoint: new THREE.Vector3(startPoint.x, startPoint.y, this.retractHeight),
      endPoint: new THREE.Vector3(startPoint.x, startPoint.y, feature.position.z),
      feedrate: params.plungeRate
    });

    // Follow boundary contour
    for (let i = 1; i < boundary.length; i++) {
      const point = boundary[i];
      toolpath.push({
        type: 'linear',
        startPoint: toolpath[toolpath.length - 1].endPoint,
        endPoint: new THREE.Vector3(point.x, point.y, feature.position.z),
        feedrate: params.feedrate
      });
    }

    // Close the contour
    toolpath.push({
      type: 'linear',
      startPoint: toolpath[toolpath.length - 1].endPoint,
      endPoint: new THREE.Vector3(startPoint.x, startPoint.y, feature.position.z),
      feedrate: params.feedrate
    });

    // Retract
    const lastPoint = toolpath[toolpath.length - 1].endPoint;
    toolpath.push({
      type: 'retract',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight)
    });

    return toolpath;
  }

  private generateDrillingToolpath(
    feature: FeatureGeometry, 
    tool: ToolDefinition, 
    params: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const depth = feature.dimensions.depth || feature.dimensions.diameter;
    
    // Rapid to position
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, this.retractHeight)
    });

    // Peck drilling cycle
    const peckDepth = Math.min(tool.diameter * 3, depth / 3);
    const numPecks = Math.ceil(depth / peckDepth);
    
    for (let peck = 0; peck < numPecks; peck++) {
      const targetDepth = Math.min((peck + 1) * peckDepth, depth);
      const drillToZ = feature.position.z - targetDepth;
      
      // Drill down
      toolpath.push({
        type: 'drill',
        startPoint: new THREE.Vector3(center.x, center.y, this.retractHeight),
        endPoint: new THREE.Vector3(center.x, center.y, drillToZ),
        feedrate: params.plungeRate
      });

      // Retract for chip evacuation (except on final peck)
      if (peck < numPecks - 1) {
        toolpath.push({
          type: 'retract',
          startPoint: new THREE.Vector3(center.x, center.y, drillToZ),
          endPoint: new THREE.Vector3(center.x, center.y, this.retractHeight)
        });
      }
    }

    // Final retract
    const lastPoint = toolpath[toolpath.length - 1].endPoint;
    toolpath.push({
      type: 'retract',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(center.x, center.y, this.safeHeight)
    });

    return toolpath;
  }

  private generateSlotToolpath(
    feature: FeatureGeometry, 
    tool: ToolDefinition, 
    params: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const length = feature.dimensions.length;
    const width = feature.dimensions.width;
    const depth = feature.dimensions.depth || 5;
    
    // Calculate number of passes needed
    const numPasses = Math.ceil(width / (tool.diameter * 0.8));
    const passSpacing = width / numPasses;
    
    // Start position
    const startX = center.x - length / 2;
    const startY = center.y - width / 2 + tool.diameter / 2;
    
    for (let pass = 0; pass < numPasses; pass++) {
      const currentY = startY + pass * passSpacing;
      const startPoint = new THREE.Vector3(startX, currentY, this.safeHeight);
      const endPoint = new THREE.Vector3(startX + length, currentY, this.safeHeight);
      
      // Rapid to start
      toolpath.push({
        type: 'rapid',
        startPoint: startPoint,
        endPoint: new THREE.Vector3(startX, currentY, this.retractHeight)
      });

      // Plunge
      toolpath.push({
        type: 'linear',
        startPoint: new THREE.Vector3(startX, currentY, this.retractHeight),
        endPoint: new THREE.Vector3(startX, currentY, center.z - depth),
        feedrate: params.plungeRate
      });

      // Cut along slot
      toolpath.push({
        type: 'linear',
        startPoint: new THREE.Vector3(startX, currentY, center.z - depth),
        endPoint: new THREE.Vector3(startX + length, currentY, center.z - depth),
        feedrate: params.feedrate
      });

      // Retract
      toolpath.push({
        type: 'retract',
        startPoint: new THREE.Vector3(startX + length, currentY, center.z - depth),
        endPoint: new THREE.Vector3(startX + length, currentY, this.safeHeight)
      });
    }

    return toolpath;
  }

  private generateChamferToolpath(
    feature: FeatureGeometry, 
    tool: ToolDefinition, 
    params: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const chamferWidth = feature.dimensions.width || 1;
    
    // Generate circular chamfer path
    const radius = feature.dimensions.diameter ? feature.dimensions.diameter / 2 : 10;
    const numPoints = 32;
    
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      const z = center.z - chamferWidth;
      
      const point = new THREE.Vector3(x, y, z);
      
      if (i === 0) {
        // Rapid to start
        toolpath.push({
          type: 'rapid',
          startPoint: new THREE.Vector3(x, y, this.safeHeight),
          endPoint: new THREE.Vector3(x, y, this.retractHeight)
        });
        
        // Plunge
        toolpath.push({
          type: 'linear',
          startPoint: new THREE.Vector3(x, y, this.retractHeight),
          endPoint: point,
          feedrate: params.plungeRate
        });
      } else {
        toolpath.push({
          type: 'linear',
          startPoint: toolpath[toolpath.length - 1].endPoint,
          endPoint: point,
          feedrate: params.feedrate
        });
      }
    }

    // Retract
    const lastPoint = toolpath[toolpath.length - 1].endPoint;
    toolpath.push({
      type: 'retract',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight)
    });

    return toolpath;
  }

  private calculateCuttingParameters(
    feature: FeatureGeometry, 
    tool: ToolDefinition, 
    operation: string
  ): CuttingParameters {
    // Material-specific parameters (assuming aluminum)
    const materialFactor = 1.0;
    
    switch (operation) {
      case 'roughing':
        return {
          feedrate: tool.diameter * tool.flutes * 0.15 * 2000 * materialFactor, // Aggressive roughing
          spindleSpeed: Math.min(3000, 200000 / tool.diameter),
          axialDepth: tool.diameter * 0.5,
          radialDepth: tool.diameter * 0.6,
          plungeRate: tool.diameter * tool.flutes * 0.05 * 2000 * materialFactor
        };
      
      case 'finishing':
        return {
          feedrate: tool.diameter * tool.flutes * 0.08 * 2000 * materialFactor, // Conservative finishing
          spindleSpeed: Math.min(4000, 250000 / tool.diameter),
          axialDepth: tool.diameter * 0.2,
          radialDepth: tool.diameter * 0.1,
          plungeRate: tool.diameter * tool.flutes * 0.03 * 2000 * materialFactor
        };
      
      case 'drilling':
        return {
          feedrate: tool.diameter * 0.25 * materialFactor * 100,
          spindleSpeed: Math.min(2000, 150000 / tool.diameter),
          axialDepth: tool.diameter * 3, // Peck depth
          radialDepth: 0,
          plungeRate: tool.diameter * 0.25 * materialFactor * 100
        };
      
      case 'chamfering':
        return {
          feedrate: tool.diameter * tool.flutes * 0.1 * 2000 * materialFactor,
          spindleSpeed: Math.min(5000, 300000 / tool.diameter),
          axialDepth: 1,
          radialDepth: tool.diameter * 0.3,
          plungeRate: tool.diameter * tool.flutes * 0.05 * 2000 * materialFactor
        };
      
      default:
        return {
          feedrate: 500,
          spindleSpeed: 2000,
          axialDepth: 2,
          radialDepth: 2,
          plungeRate: 200
        };
    }
  }

  private calculateMachiningTime(toolpath: ToolpathSegment[], params: CuttingParameters): number {
    let totalTime = 0; // in minutes
    
    for (const segment of toolpath) {
      const distance = segment.startPoint.distanceTo(segment.endPoint);
      const feedrate = segment.feedrate || params.feedrate;
      
      if (segment.type === 'rapid') {
        totalTime += distance / 10000; // Rapid at ~10m/min
      } else {
        totalTime += distance / feedrate;
      }
    }
    
    return totalTime;
  }

  private calculateMaterialRemovalRate(feature: FeatureGeometry, params: CuttingParameters): number {
    // Simplified MRR calculation: axial depth × radial depth × feedrate
    const mrr = params.axialDepth * params.radialDepth * params.feedrate / 1000; // cm³/min
    return mrr;
  }

  private generateRectangularBoundary(feature: FeatureGeometry): THREE.Vector3[] {
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const width = feature.dimensions.width || 10;
    const length = feature.dimensions.length || 10;
    
    return [
      new THREE.Vector3(center.x - length/2, center.y - width/2, center.z),
      new THREE.Vector3(center.x + length/2, center.y - width/2, center.z),
      new THREE.Vector3(center.x + length/2, center.y + width/2, center.z),
      new THREE.Vector3(center.x - length/2, center.y + width/2, center.z)
    ];
  }

  private getToolDefinition(toolId: string): ToolDefinition {
    // In a real application, this would fetch from a tool database
    const defaultTools: { [key: string]: ToolDefinition } = {
      'endmill_12mm': {
        id: 'endmill_12mm',
        type: 'endmill',
        diameter: 12,
        length: 50,
        flutes: 4,
        material: 'carbide'
      },
      'drill_6mm': {
        id: 'drill_6mm',
        type: 'drill',
        diameter: 6,
        length: 40,
        flutes: 2,
        material: 'hss'
      },
      'chamfer_45deg': {
        id: 'chamfer_45deg',
        type: 'chamfer',
        diameter: 10,
        length: 20,
        flutes: 4,
        material: 'carbide'
      }
    };
    
    return defaultTools[toolId] || defaultTools['endmill_12mm'];
  }

  private generateBossOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    // Boss operations typically require contouring around the outside
    const parameters = this.calculateCuttingParameters(feature, tool, 'finishing');
    const toolpath = this.generateBossToolpath(feature, tool, parameters);
    
    return {
      id: `boss_${Date.now()}`,
      name: `Boss Operation - ${feature.type}`,
      type: 'finishing',
      feature,
      tool,
      parameters,
      toolpath: this.convertToToolpathSegments(toolpath),
      estimatedTime: this.calculateMachiningTime(this.convertToToolpathSegments(toolpath), parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private generateRibOperation(feature: FeatureGeometry, tool: ToolDefinition): Operation {
    // Rib operations are similar to boss but typically thinner
    const parameters = this.calculateCuttingParameters(feature, tool, 'finishing');
    const toolpath = this.generateRibToolpath(feature, tool, parameters);
    
    return {
      id: `rib_${Date.now()}`,
      name: `Rib Operation - ${feature.type}`,
      type: 'finishing',
      feature,
      tool,
      parameters,
      toolpath: this.convertToToolpathSegments(toolpath),
      estimatedTime: this.calculateMachiningTime(this.convertToToolpathSegments(toolpath), parameters),
      materialRemovalRate: this.calculateMaterialRemovalRate(feature, parameters)
    };
  }

  private convertToToolpathSegments(points: ToolpathPoint[]): ToolpathSegment[] {
    const segments: ToolpathSegment[] = [];
    
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      
      segments.push({
        type: 'linear',
        startPoint: new THREE.Vector3(start.x, start.y, start.z),
        endPoint: new THREE.Vector3(end.x, end.y, end.z),
        feedrate: end.feedrate
      });
    }
    
    return segments;
  }

  private generateBossToolpath(feature: FeatureGeometry, tool: ToolDefinition, params: CuttingParameters): ToolpathPoint[] {
    // Generate contour toolpath around boss perimeter
    const toolpath: ToolpathPoint[] = [];
    const stepover = tool.diameter * 0.4; // 40% stepover for finishing
    
    // Create multiple passes around the boss perimeter
    for (let offset = stepover; offset <= feature.dimensions.radius || 10; offset += stepover) {
      const radius = (feature.dimensions.radius || 10) + offset;
      for (let angle = 0; angle <= 2 * Math.PI; angle += 0.1) {
        toolpath.push({
          x: feature.position.x + radius * Math.cos(angle),
          y: feature.position.y + radius * Math.sin(angle),
          z: feature.position.z,
          feedrate: params.feedrate,
          spindleSpeed: params.spindleSpeed
        });
      }
    }
    
    return toolpath;
  }

  private generateRibToolpath(feature: FeatureGeometry, tool: ToolDefinition, params: CuttingParameters): ToolpathPoint[] {
    // Generate toolpath along rib length
    const toolpath: ToolpathPoint[] = [];
    const length = feature.dimensions.length || 20;
    const width = feature.dimensions.width || 5;
    const stepSize = tool.diameter * 0.1;
    
    // Multiple passes along rib length
    for (let pass = 0; pass < 2; pass++) {
      const offsetY = (pass - 0.5) * width * 0.8;
      for (let x = -length/2; x <= length/2; x += stepSize) {
        toolpath.push({
          x: feature.position.x + x,
          y: feature.position.y + offsetY,
          z: feature.position.z,
          feedrate: params.feedrate,
          spindleSpeed: params.spindleSpeed
        });
      }
    }
    
    return toolpath;
  }

  private optimizeOperationSequence(operations: Operation[]): Operation[] {
    // Sort by operation type priority and tool changes
    const priority = { 'drilling': 1, 'roughing': 2, 'finishing': 3, 'chamfering': 4 };
    
    return operations.sort((a, b) => {
      if (priority[a.type] !== priority[b.type]) {
        return priority[a.type] - priority[b.type];
      }
      // Secondary sort by tool to minimize tool changes
      return a.tool.id.localeCompare(b.tool.id);
    });
  }
}