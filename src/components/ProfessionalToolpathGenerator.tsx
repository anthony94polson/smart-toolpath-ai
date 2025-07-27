import * as THREE from 'three';
import { MachinableFeature } from './AdvancedSTLAnalyzer';

export interface ToolDefinition {
  id: string;
  type: 'endmill' | 'drill' | 'chamfer_mill' | 'ball_mill' | 'face_mill';
  diameter: number;
  length: number;
  flutes: number;
  material: 'hss' | 'carbide' | 'coated_carbide';
  coating?: string;
  cornerRadius?: number;
  helixAngle?: number;
  maxRPM: number;
  maxFeedrate: number;
}

export interface CuttingParameters {
  feedrate: number; // mm/min
  spindleSpeed: number; // RPM
  axialDepthOfCut: number; // mm (ap)
  radialDepthOfCut: number; // mm (ae)
  plungeRate: number; // mm/min
  rampAngle: number; // degrees
  stepover: number; // % of diameter
  stockToLeave: number; // mm
}

export interface ToolpathSegment {
  type: 'rapid' | 'linear' | 'arc' | 'helical' | 'trochoidal' | 'spline';
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  feedrate: number;
  spindleSpeed: number;
  arcCenter?: THREE.Vector3;
  arcPlane?: 'XY' | 'XZ' | 'YZ';
  clockwise?: boolean;
  helixPitch?: number;
  trochoidalParams?: {
    radius: number;
    stepover: number;
  };
}

export interface MachiningOperation {
  id: string;
  name: string;
  type: 'roughing' | 'semi_finishing' | 'finishing' | 'drilling' | 'chamfering' | 'profiling';
  feature: MachinableFeature;
  tool: ToolDefinition;
  parameters: CuttingParameters;
  toolpath: ToolpathSegment[];
  estimatedTime: number; // minutes
  materialRemovalRate: number; // cm³/min
  priority: number; // Operation sequencing priority
  setupRequired: boolean;
  coolantRequired: boolean;
  qualityGrade: 'rough' | 'semi' | 'finish';
}

export interface MachiningStrategy {
  roughing: {
    strategy: 'adaptive' | 'trochoidal' | 'plunge_roughing' | 'rest_roughing';
    stockToLeave: number;
    maximumStepdown: number;
    optimalStepover: number;
  };
  finishing: {
    strategy: 'contour' | 'raster' | 'spiral' | 'pencil';
    passes: number;
    stepdown: number;
    tolerance: number;
  };
  approach: {
    type: 'ramp' | 'helix' | 'plunge' | 'pre_drill';
    angle: number;
    safeHeight: number;
  };
}

export class ProfessionalToolpathGenerator {
  private stockBoundary: THREE.Box3;
  private safeHeight: number = 5; // mm above stock
  private clearanceHeight: number = 25; // mm for tool changes
  private defaultFeedrate: number = 1000; // mm/min
  private workCoordinateSystem: THREE.Vector3;
  private machineCapabilities: {
    maxSpindleSpeed: number;
    maxFeedrate: number;
    rapids: number;
    accuracy: number;
  };

  constructor(stockBoundary: THREE.Box3) {
    this.stockBoundary = stockBoundary;
    this.workCoordinateSystem = new THREE.Vector3(0, 0, 0);
    this.machineCapabilities = {
      maxSpindleSpeed: 8000,
      maxFeedrate: 3000,
      rapids: 15000,
      accuracy: 0.01
    };
  }

  public generateMachiningProgram(features: MachinableFeature[]): MachiningOperation[] {
    const operations: MachiningOperation[] = [];

    // Step 1: Analyze features and determine optimal tooling
    const toolingPlan = this.createToolingPlan(features);

    // Step 2: Generate operations for each feature
    for (const feature of features) {
      const featureOperations = this.generateFeatureOperations(feature, toolingPlan);
      operations.push(...featureOperations);
    }

    // Step 3: Optimize operation sequence
    const optimizedOperations = this.optimizeOperationSequence(operations);

    // Step 4: Add setup operations
    return this.addSetupOperations(optimizedOperations);
  }

  private createToolingPlan(features: MachinableFeature[]): Map<string, ToolDefinition> {
    const toolingPlan = new Map<string, ToolDefinition>();
    
    // Standard tool library
    const toolLibrary: ToolDefinition[] = [
      // End mills
      {
        id: 'EM_6MM_4F_CARBIDE',
        type: 'endmill',
        diameter: 6,
        length: 50,
        flutes: 4,
        material: 'carbide',
        coating: 'TiAlN',
        cornerRadius: 0.2,
        helixAngle: 30,
        maxRPM: 8000,
        maxFeedrate: 2400
      },
      {
        id: 'EM_10MM_3F_CARBIDE',
        type: 'endmill',
        diameter: 10,
        length: 75,
        flutes: 3,
        material: 'carbide',
        coating: 'TiAlN',
        cornerRadius: 0.5,
        helixAngle: 35,
        maxRPM: 6000,
        maxFeedrate: 3000
      },
      {
        id: 'EM_3MM_2F_CARBIDE',
        type: 'endmill',
        diameter: 3,
        length: 25,
        flutes: 2,
        material: 'carbide',
        coating: 'DLC',
        cornerRadius: 0.1,
        helixAngle: 30,
        maxRPM: 12000,
        maxFeedrate: 1800
      },
      // Drills
      {
        id: 'DRILL_5MM_HSS',
        type: 'drill',
        diameter: 5,
        length: 50,
        flutes: 2,
        material: 'hss',
        coating: 'TiN',
        maxRPM: 3000,
        maxFeedrate: 300
      },
      {
        id: 'DRILL_8MM_CARBIDE',
        type: 'drill',
        diameter: 8,
        length: 70,
        flutes: 2,
        material: 'carbide',
        maxRPM: 4000,
        maxFeedrate: 400
      },
      // Chamfer tools
      {
        id: 'CHAMFER_90DEG_10MM',
        type: 'chamfer_mill',
        diameter: 10,
        length: 30,
        flutes: 3,
        material: 'carbide',
        coating: 'TiAlN',
        maxRPM: 5000,
        maxFeedrate: 1500
      }
    ];

    // Assign optimal tools to features
    for (const feature of features) {
      let selectedTool: ToolDefinition;

      switch (feature.type) {
        case 'hole':
          selectedTool = this.selectDrillTool(feature, toolLibrary);
          break;
        case 'pocket':
        case 'slot':
        case 'step':
          selectedTool = this.selectEndMillTool(feature, toolLibrary);
          break;
        case 'chamfer':
          selectedTool = this.selectChamferTool(feature, toolLibrary);
          break;
        case 'boss':
        case 'rib':
          selectedTool = this.selectPrecisionEndMill(feature, toolLibrary);
          break;
        default:
          selectedTool = toolLibrary.find(t => t.type === 'endmill') || toolLibrary[0];
      }

      toolingPlan.set(feature.id, selectedTool);
    }

    return toolingPlan;
  }

  private selectDrillTool(feature: MachinableFeature, toolLibrary: ToolDefinition[]): ToolDefinition {
    const diameter = feature.dimensions.diameter;
    const drills = toolLibrary.filter(t => t.type === 'drill');
    
    // Find drill closest to hole diameter (allowing for reaming tolerance)
    let bestTool = drills[0];
    let bestScore = Infinity;

    for (const drill of drills) {
      const sizeDiff = Math.abs(drill.diameter - diameter);
      const score = sizeDiff + (drill.material === 'carbide' ? 0 : 0.5); // Prefer carbide
      
      if (score < bestScore && drill.diameter <= diameter + 0.1) {
        bestScore = score;
        bestTool = drill;
      }
    }

    return bestTool;
  }

  private selectEndMillTool(feature: MachinableFeature, toolLibrary: ToolDefinition[]): ToolDefinition {
    const endMills = toolLibrary.filter(t => t.type === 'endmill');
    const minDimension = Math.min(feature.dimensions.width || 0, feature.dimensions.length || 0);
    const maxToolDiameter = minDimension * 0.8; // 80% of smallest feature dimension

    let bestTool = endMills[0];
    let bestScore = Infinity;

    for (const mill of endMills) {
      if (mill.diameter > maxToolDiameter) continue;
      
      // Score based on efficiency (larger is better) and precision needs
      const efficiencyScore = 1 / mill.diameter; // Larger tools are more efficient
      const precisionBonus = mill.material === 'carbide' ? 0.2 : 0;
      const score = efficiencyScore - precisionBonus;
      
      if (score < bestScore) {
        bestScore = score;
        bestTool = mill;
      }
    }

    return bestTool;
  }

  private selectChamferTool(feature: MachinableFeature, toolLibrary: ToolDefinition[]): ToolDefinition {
    const chamferTools = toolLibrary.filter(t => t.type === 'chamfer_mill');
    return chamferTools[0] || toolLibrary.find(t => t.type === 'endmill') || toolLibrary[0];
  }

  private selectPrecisionEndMill(feature: MachinableFeature, toolLibrary: ToolDefinition[]): ToolDefinition {
    // For precision work, prefer smaller diameter carbide tools
    const endMills = toolLibrary.filter(t => t.type === 'endmill' && t.material === 'carbide');
    return endMills.reduce((smallest, current) => 
      current.diameter < smallest.diameter ? current : smallest, endMills[0]) || toolLibrary[0];
  }

  private generateFeatureOperations(feature: MachinableFeature, toolingPlan: Map<string, ToolDefinition>): MachiningOperation[] {
    const operations: MachiningOperation[] = [];
    const tool = toolingPlan.get(feature.id);
    
    if (!tool) {
      console.warn(`No tool assigned for feature ${feature.id}`);
      return operations;
    }

    // Ensure machiningParameters exist with defaults
    if (!feature.machiningParameters) {
      feature.machiningParameters = {
        stockToLeave: 0.1,
        requiredTolerance: 0.1,
        surfaceFinish: 'standard'
      };
    }

    console.log(`Generating operations for ${feature.type} feature:`, feature);

    switch (feature.type) {
      case 'hole':
        operations.push(...this.generateHoleOperations(feature, tool));
        break;
      case 'pocket':
        operations.push(...this.generatePocketOperations(feature, tool));
        break;
      case 'slot':
        operations.push(...this.generateSlotOperations(feature, tool));
        break;
      case 'chamfer':
        operations.push(...this.generateChamferOperations(feature, tool));
        break;
      case 'step':
        operations.push(...this.generateStepOperations(feature, tool));
        break;
      case 'boss':
        operations.push(...this.generateBossOperations(feature, tool));
        break;
      case 'rib':
        operations.push(...this.generateRibOperations(feature, tool));
        break;
    }

    return operations;
  }

  private generateHoleOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    const operations: MachiningOperation[] = [];
    const diameter = feature.dimensions.diameter;
    const depth = feature.dimensions.depth;

    // Center drilling operation (if needed)
    if (diameter > 6) {
      const centerDrillOp = this.createCenterDrillingOperation(feature, tool);
      operations.push(centerDrillOp);
    }

    // Main drilling operation
    const parameters = this.calculateDrillingParameters(feature, tool);
    const toolpath = this.generateDrillingToolpath(feature, tool, parameters);

    operations.push({
      id: `DRILL_${feature.id}`,
      name: `Drill Ø${diameter}mm × ${depth}mm deep`,
      type: 'drilling',
      feature,
      tool,
      parameters,
      toolpath,
      estimatedTime: this.calculateDrillingTime(feature, parameters),
      materialRemovalRate: this.calculateDrillingMRR(feature, parameters),
      priority: 1,
      setupRequired: false,
      coolantRequired: diameter > 8 || depth > diameter * 3,
      qualityGrade: 'finish'
    });

    // Chamfering operation (if specified)
    if (feature.dimensions.chamfer) {
      const chamferOp = this.createChamferOperation(feature, tool);
      operations.push(chamferOp);
    }

    return operations;
  }

  private generatePocketOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    const operations: MachiningOperation[] = [];
    
    // Roughing operation
    const roughingParams = this.calculateRoughingParameters(feature, tool);
    const roughingToolpath = this.generateAdaptiveClearingToolpath(feature, tool, roughingParams);

    operations.push({
      id: `ROUGH_${feature.id}`,
      name: `Pocket Roughing - ${feature.dimensions.width}×${feature.dimensions.length}mm`,
      type: 'roughing',
      feature,
      tool,
      parameters: roughingParams,
      toolpath: roughingToolpath,
      estimatedTime: this.calculateRoughingTime(feature, roughingParams),
      materialRemovalRate: this.calculateRoughingMRR(feature, roughingParams),
      priority: 1,
      setupRequired: false,
      coolantRequired: true,
      qualityGrade: 'rough'
    });

    // Semi-finishing operation (if required)
    if (feature.machiningParameters.surfaceFinish === 'excellent') {
      const semiParams = this.calculateSemiFinishingParameters(feature, tool);
      const semiToolpath = this.generateSemiFinishingToolpath(feature, tool, semiParams);

      operations.push({
        id: `SEMI_${feature.id}`,
        name: `Pocket Semi-Finish`,
        type: 'semi_finishing',
        feature,
        tool,
        parameters: semiParams,
        toolpath: semiToolpath,
        estimatedTime: this.calculateSemiFinishingTime(feature, semiParams),
        materialRemovalRate: this.calculateSemiFinishingMRR(feature, semiParams),
        priority: 2,
        setupRequired: false,
        coolantRequired: false,
        qualityGrade: 'semi'
      });
    }

    // Finishing operation
    const finishingParams = this.calculateFinishingParameters(feature, tool);
    const finishingToolpath = this.generateContourFinishingToolpath(feature, tool, finishingParams);

    operations.push({
      id: `FINISH_${feature.id}`,
      name: `Pocket Finishing`,
      type: 'finishing',
      feature,
      tool,
      parameters: finishingParams,
      toolpath: finishingToolpath,
      estimatedTime: this.calculateFinishingTime(feature, finishingParams),
      materialRemovalRate: this.calculateFinishingMRR(feature, finishingParams),
      priority: 3,
      setupRequired: false,
      coolantRequired: false,
      qualityGrade: 'finish'
    });

    return operations;
  }

  private generateAdaptiveClearingToolpath(
    feature: MachinableFeature, 
    tool: ToolDefinition, 
    params: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = feature.position;
    const depth = feature.depth;
    const width = feature.dimensions.width || 20;
    const length = feature.dimensions.length || 20;

    // Calculate number of depth passes
    const numPasses = Math.ceil(depth / params.axialDepthOfCut);
    
    // Add rapid approach
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: params.spindleSpeed
    });

    for (let pass = 0; pass < numPasses; pass++) {
      const currentDepth = Math.min((pass + 1) * params.axialDepthOfCut, depth);
      const zLevel = center.z - currentDepth;

      // Helical entry for first pass, ramp for subsequent passes
      if (pass === 0) {
        const helicalSegments = this.generateHelicalEntry(center, zLevel, tool.diameter / 2, params);
        toolpath.push(...helicalSegments);
      } else {
        const rampSegments = this.generateRampEntry(center, zLevel, tool.diameter, params);
        toolpath.push(...rampSegments);
      }

      // Adaptive clearing pattern
      const clearingSegments = this.generateTrochoidalClearing(
        feature, 
        zLevel, 
        tool.diameter, 
        params
      );
      toolpath.push(...clearingSegments);
    }

    // Retract to safe height
    const lastPoint = toolpath[toolpath.length - 1].endPoint;
    toolpath.push({
      type: 'rapid',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: params.spindleSpeed
    });

    return toolpath;
  }

  private generateTrochoidalClearing(
    feature: MachinableFeature,
    zLevel: number,
    toolDiameter: number,
    params: CuttingParameters
  ): ToolpathSegment[] {
    const segments: ToolpathSegment[] = [];
    const center = feature.position;
    const stepover = toolDiameter * (params.stepover / 100);
    const trochoidalRadius = toolDiameter * 0.1; // 10% of tool diameter
    
    // Calculate clearing area
    const clearingRadius = Math.min(feature.dimensions.width, feature.dimensions.length) / 2 - toolDiameter / 2;
    const numSpirals = Math.ceil(clearingRadius / stepover);

    for (let spiral = 0; spiral < numSpirals; spiral++) {
      const currentRadius = spiral * stepover;
      const numPoints = Math.max(8, Math.floor(currentRadius * 2));

      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        
        // Main spiral position
        const mainX = center.x + Math.cos(angle) * currentRadius;
        const mainY = center.y + Math.sin(angle) * currentRadius;
        
        // Add trochoidal motion
        const trochAngle = angle * 10; // Higher frequency for trochoidal motion
        const trochX = mainX + Math.cos(trochAngle) * trochoidalRadius;
        const trochY = mainY + Math.sin(trochAngle) * trochoidalRadius;
        
        const point = new THREE.Vector3(trochX, trochY, zLevel);
        
        if (segments.length > 0) {
          segments.push({
            type: 'trochoidal',
            startPoint: segments[segments.length - 1].endPoint,
            endPoint: point,
            feedrate: params.feedrate,
            spindleSpeed: params.spindleSpeed,
            trochoidalParams: {
              radius: trochoidalRadius,
              stepover: stepover
            }
          });
        }
      }
    }

    return segments;
  }

  private generateHelicalEntry(
    center: THREE.Vector3,
    targetZ: number,
    radius: number,
    params: CuttingParameters
  ): ToolpathSegment[] {
    const segments: ToolpathSegment[] = [];
    const numTurns = Math.ceil(Math.abs(targetZ - center.z) / (radius * 0.1)); // Pitch = 10% of radius
    const pointsPerTurn = 16;
    const totalPoints = numTurns * pointsPerTurn;

    for (let i = 0; i <= totalPoints; i++) {
      const angle = (i / pointsPerTurn) * Math.PI * 2;
      const progress = i / totalPoints;
      
      const x = center.x + Math.cos(angle) * radius * (1 - progress * 0.2); // Spiral inward slightly
      const y = center.y + Math.sin(angle) * radius * (1 - progress * 0.2);
      const z = center.z - progress * Math.abs(targetZ - center.z);
      
      const point = new THREE.Vector3(x, y, z);
      
      if (i > 0) {
        segments.push({
          type: 'helical',
          startPoint: segments[segments.length - 1]?.endPoint || point,
          endPoint: point,
          feedrate: params.plungeRate,
          spindleSpeed: params.spindleSpeed,
          helixPitch: Math.abs(targetZ - center.z) / numTurns
        });
      }
    }

    return segments;
  }

  private generateRampEntry(
    center: THREE.Vector3,
    targetZ: number,
    toolDiameter: number,
    params: CuttingParameters
  ): ToolpathSegment[] {
    const segments: ToolpathSegment[] = [];
    const rampLength = toolDiameter * 2;
    const angle = Math.atan(params.rampAngle * Math.PI / 180);
    const rampDepth = Math.abs(targetZ - center.z);
    
    const startPoint = new THREE.Vector3(center.x - rampLength / 2, center.y, center.z);
    const endPoint = new THREE.Vector3(center.x + rampLength / 2, center.y, targetZ);

    segments.push({
      type: 'linear',
      startPoint,
      endPoint,
      feedrate: params.plungeRate,
      spindleSpeed: params.spindleSpeed
    });

    return segments;
  }

  // Additional toolpath generation methods for other feature types...
  private generateSlotOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    // Implementation for slot machining
    return [];
  }

  private generateChamferOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    // Implementation for chamfer machining
    return [];
  }

  private generateStepOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    // Implementation for step machining
    return [];
  }

  private generateBossOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    // Implementation for boss machining (external profiling)
    return [];
  }

  private generateRibOperations(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation[] {
    // Implementation for rib machining
    return [];
  }

  // Parameter calculation methods
  private calculateDrillingParameters(feature: MachinableFeature, tool: ToolDefinition): CuttingParameters {
    const diameter = feature.dimensions.diameter;
    const depth = feature.dimensions.depth;
    
    // Calculate parameters based on tool and material
    const surfaceSpeed = 80; // m/min for aluminum
    const feedPerRev = 0.1; // mm/rev starting point
    
    const spindleSpeed = Math.min(
      (surfaceSpeed * 1000) / (Math.PI * diameter),
      tool.maxRPM
    );
    
    const feedrate = Math.min(
      spindleSpeed * feedPerRev,
      tool.maxFeedrate
    );

    return {
      feedrate,
      spindleSpeed,
      axialDepthOfCut: diameter, // Full diameter for drilling
      radialDepthOfCut: diameter,
      plungeRate: feedrate * 0.5, // 50% of feedrate for plunging
      rampAngle: 0, // Not applicable for drilling
      stepover: 100, // Full engagement
      stockToLeave: 0
    };
  }

  private calculateRoughingParameters(feature: MachinableFeature, tool: ToolDefinition): CuttingParameters {
    const materialFactor = 1.0; // Aluminum factor
    const chipLoad = 0.1; // mm per tooth
    
    const spindleSpeed = Math.min(
      150000 / tool.diameter, // Surface speed calculation
      tool.maxRPM
    );
    
    const feedrate = Math.min(
      spindleSpeed * tool.flutes * chipLoad * materialFactor,
      tool.maxFeedrate
    );

    return {
      feedrate,
      spindleSpeed,
      axialDepthOfCut: Math.min(tool.diameter * 0.5, 3), // Conservative for roughing
      radialDepthOfCut: tool.diameter * 0.4, // 40% engagement
      plungeRate: feedrate * 0.3,
      rampAngle: 3, // 3 degree ramp
      stepover: 40, // 40% stepover for roughing
      stockToLeave: 0.5 // Leave 0.5mm stock for finishing
    };
  }

  private calculateFinishingParameters(feature: MachinableFeature, tool: ToolDefinition): CuttingParameters {
    const roughingParams = this.calculateRoughingParameters(feature, tool);
    
    return {
      feedrate: roughingParams.feedrate * 1.5, // Higher feedrate for lighter cuts
      spindleSpeed: roughingParams.spindleSpeed * 1.2, // Higher speed for better finish
      axialDepthOfCut: Math.min(tool.diameter * 0.1, 0.5), // Light finishing passes
      radialDepthOfCut: 0.2, // Minimal radial engagement
      plungeRate: roughingParams.plungeRate,
      rampAngle: 1, // Gentle ramp for finishing
      stepover: 10, // 10% stepover for smooth finish
      stockToLeave: 0 // Remove all remaining stock
    };
  }

  private calculateSemiFinishingParameters(feature: MachinableFeature, tool: ToolDefinition): CuttingParameters {
    const roughingParams = this.calculateRoughingParameters(feature, tool);
    const finishingParams = this.calculateFinishingParameters(feature, tool);
    
    return {
      feedrate: (roughingParams.feedrate + finishingParams.feedrate) / 2,
      spindleSpeed: (roughingParams.spindleSpeed + finishingParams.spindleSpeed) / 2,
      axialDepthOfCut: tool.diameter * 0.2,
      radialDepthOfCut: 0.3,
      plungeRate: roughingParams.plungeRate,
      rampAngle: 2,
      stepover: 20,
      stockToLeave: 0.1
    };
  }

  // Time calculation methods
  private calculateDrillingTime(feature: MachinableFeature, params: CuttingParameters): number {
    const depth = feature.dimensions.depth;
    const diameter = feature.dimensions.diameter;
    
    // Time = approach + drilling + retract + chip clearing
    const approachTime = this.safeHeight / this.machineCapabilities.rapids * 60; // Convert to minutes
    const drillingTime = depth / params.plungeRate * 60;
    const retractTime = (depth + this.safeHeight) / this.machineCapabilities.rapids * 60;
    const chipClearingTime = diameter > 8 ? 0.5 : 0.2; // Extra time for chip clearing
    
    return approachTime + drillingTime + retractTime + chipClearingTime;
  }

  private calculateRoughingTime(feature: MachinableFeature, params: CuttingParameters): number {
    const volume = (feature.dimensions.width || 20) * (feature.dimensions.length || 20) * feature.depth / 1000; // cm³
    const mrr = this.calculateRoughingMRR(feature, params);
    return (volume / mrr) + 0.5; // Add setup time
  }

  private calculateFinishingTime(feature: MachinableFeature, params: CuttingParameters): number {
    const perimeter = 2 * ((feature.dimensions.width || 20) + (feature.dimensions.length || 20));
    const feedratePerSecond = params.feedrate / 60;
    return (perimeter / feedratePerSecond / 60) + 0.2; // Convert to minutes + setup
  }

  private calculateSemiFinishingTime(feature: MachinableFeature, params: CuttingParameters): number {
    return this.calculateFinishingTime(feature, params) * 1.5; // Semi-finishing takes more time
  }

  // Material removal rate calculations
  private calculateDrillingMRR(feature: MachinableFeature, params: CuttingParameters): number {
    const diameter = feature.dimensions.diameter;
    const area = Math.PI * (diameter / 2) ** 2; // mm²
    const feedratePerSecond = params.plungeRate / 60; // mm/s
    return (area * feedratePerSecond) / 1000; // cm³/min
  }

  private calculateRoughingMRR(feature: MachinableFeature, params: CuttingParameters): number {
    // Based on tool diameter, stepover, and feedrate
    const engagementArea = params.radialDepthOfCut * params.axialDepthOfCut; // mm²
    const feedratePerSecond = params.feedrate / 60; // mm/s
    return (engagementArea * feedratePerSecond) / 1000; // cm³/min
  }

  private calculateFinishingMRR(feature: MachinableFeature, params: CuttingParameters): number {
    return this.calculateRoughingMRR(feature, params) * 0.2; // Much lower for finishing
  }

  private calculateSemiFinishingMRR(feature: MachinableFeature, params: CuttingParameters): number {
    return this.calculateRoughingMRR(feature, params) * 0.5; // Moderate for semi-finishing
  }

  // Helper methods
  private createCenterDrillingOperation(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation {
    // Implementation for center drilling
    return {} as MachiningOperation;
  }

  private createChamferOperation(feature: MachinableFeature, tool: ToolDefinition): MachiningOperation {
    // Implementation for chamfering holes
    return {} as MachiningOperation;
  }

  private generateDrillingToolpath(
    feature: MachinableFeature, 
    tool: ToolDefinition, 
    parameters: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = feature.position;
    const depth = feature.dimensions.depth;
    
    // Rapid approach to safe height above hole
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: parameters.spindleSpeed
    });
    
    // Position over hole at safe height
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, center.z + 2),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: parameters.spindleSpeed
    });
    
    // Drilling operation (full depth)
    toolpath.push({
      type: 'linear',
      startPoint: new THREE.Vector3(center.x, center.y, center.z + 2),
      endPoint: new THREE.Vector3(center.x, center.y, center.z - depth),
      feedrate: parameters.plungeRate,
      spindleSpeed: parameters.spindleSpeed
    });
    
    // Retract to safe height
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, center.z - depth),
      endPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: parameters.spindleSpeed
    });
    
    return toolpath;
  }

  private generateContourFinishingToolpath(
    feature: MachinableFeature, 
    tool: ToolDefinition, 
    parameters: CuttingParameters
  ): ToolpathSegment[] {
    const toolpath: ToolpathSegment[] = [];
    const center = feature.position;
    const width = feature.dimensions.width || 20;
    const length = feature.dimensions.length || 20;
    const depth = feature.depth;
    
    // Calculate contour path around feature boundary
    const points = [
      new THREE.Vector3(center.x - width/2, center.y - length/2, center.z - depth),
      new THREE.Vector3(center.x + width/2, center.y - length/2, center.z - depth),
      new THREE.Vector3(center.x + width/2, center.y + length/2, center.z - depth),
      new THREE.Vector3(center.x - width/2, center.y + length/2, center.z - depth),
      new THREE.Vector3(center.x - width/2, center.y - length/2, center.z - depth) // Close the loop
    ];
    
    // Rapid approach
    toolpath.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(points[0].x, points[0].y, this.safeHeight),
      endPoint: new THREE.Vector3(points[0].x, points[0].y, points[0].z + 2),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: parameters.spindleSpeed
    });
    
    // Plunge to depth
    toolpath.push({
      type: 'linear',
      startPoint: new THREE.Vector3(points[0].x, points[0].y, points[0].z + 2),
      endPoint: points[0],
      feedrate: parameters.plungeRate,
      spindleSpeed: parameters.spindleSpeed
    });
    
    // Contour finishing moves
    for (let i = 1; i < points.length; i++) {
      toolpath.push({
        type: 'linear',
        startPoint: points[i-1],
        endPoint: points[i],
        feedrate: parameters.feedrate,
        spindleSpeed: parameters.spindleSpeed
      });
    }
    
    // Retract
    const lastPoint = points[points.length - 1];
    toolpath.push({
      type: 'rapid',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
      feedrate: this.machineCapabilities.rapids,
      spindleSpeed: parameters.spindleSpeed
    });
    
    return toolpath;
  }

  private generateSemiFinishingToolpath(
    feature: MachinableFeature, 
    tool: ToolDefinition, 
    parameters: CuttingParameters
  ): ToolpathSegment[] {
    // Implementation for semi-finishing
    return [];
  }

  private optimizeOperationSequence(operations: MachiningOperation[]): MachiningOperation[] {
    // Sort by priority, then by tool to minimize tool changes
    return operations.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.tool.id !== b.tool.id) return a.tool.id.localeCompare(b.tool.id);
      return 0;
    });
  }

  private addSetupOperations(operations: MachiningOperation[]): MachiningOperation[] {
    // Add tool change operations, coordinate system setup, etc.
    return operations; // Simplified for now
  }
}