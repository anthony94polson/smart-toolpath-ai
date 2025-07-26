import * as THREE from 'three';
import { AdvancedFeature } from './AdvancedFeatureAnalyzer';

export interface Tool {
  id: string;
  type: 'endmill' | 'drill' | 'chamfer' | 'ballmill' | 'facemill' | 'reamer';
  diameter: number;
  length: number;
  flutes: number;
  material: 'hss' | 'carbide' | 'ceramic';
  coating?: 'tin' | 'altin' | 'dlc' | 'uncoated';
  maxRPM: number;
  recommendedSFM: number;
}

export interface CuttingParameters {
  feedrate: number; // mm/min
  spindleSpeed: number; // RPM
  axialDepthOfCut: number; // mm
  radialDepthOfCut: number; // mm
  plungeRate: number; // mm/min
  retractRate: number; // mm/min
  coolant: boolean;
  compensation: 'left' | 'right' | 'off';
}

export interface Toolpath {
  id: string;
  segments: ToolpathSegment[];
  estimatedTime: number; // minutes
  materialRemovalRate: number; // cm³/min
  totalLength: number; // mm
}

export interface ToolpathSegment {
  type: 'rapid' | 'linear' | 'arc_cw' | 'arc_ccw' | 'drill' | 'dwell' | 'retract';
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  feedrate?: number;
  spindleSpeed?: number;
  arcCenter?: THREE.Vector3;
  radius?: number;
  dwellTime?: number; // seconds
}

export interface Operation {
  id: string;
  type: 'roughing' | 'finishing' | 'drilling' | 'reaming' | 'chamfering' | 'facing' | 'boring';
  name: string;
  feature: AdvancedFeature;
  tool: Tool;
  parameters: CuttingParameters;
  toolpath: Toolpath;
  workOffset: string; // G54, G55, etc.
  toolNumber: number;
  description: string;
  notes?: string[];
  estimatedTime: number;
  priority: number; // 1 = highest priority
}

export interface Program {
  id: string;
  name: string;
  operations: Operation[];
  setupSheet: SetupSheet;
  totalTime: number;
  gcode: string;
  warnings: string[];
}

export interface SetupSheet {
  stockMaterial: string;
  stockDimensions: { x: number; y: number; z: number };
  workOffsets: WorkOffset[];
  requiredTools: Tool[];
  fixtures: string[];
  notes: string[];
}

export interface WorkOffset {
  name: string; // G54, G55, etc.
  position: { x: number; y: number; z: number };
  description: string;
}

export class ProductionCAMGenerator {
  private stockBoundary: THREE.Box3;
  private safeHeight: number = 5; // mm above stock
  private retractHeight: number = 2; // mm above stock
  private workOffset: string = 'G54';
  private toolLibrary: Tool[] = [];
  private materialDatabase: { [key: string]: any } = {};

  constructor(stockBoundary: THREE.Box3) {
    this.stockBoundary = stockBoundary;
    this.initializeToolLibrary();
    this.initializeMaterialDatabase();
  }

  private initializeToolLibrary(): void {
    this.toolLibrary = [
      // End Mills
      {
        id: 'EM_6MM_4FL_CARB',
        type: 'endmill',
        diameter: 6,
        length: 50,
        flutes: 4,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 12000,
        recommendedSFM: 200
      },
      {
        id: 'EM_12MM_4FL_CARB',
        type: 'endmill',
        diameter: 12,
        length: 75,
        flutes: 4,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 8000,
        recommendedSFM: 200
      },
      {
        id: 'EM_20MM_4FL_CARB',
        type: 'endmill',
        diameter: 20,
        length: 100,
        flutes: 4,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 5000,
        recommendedSFM: 200
      },
      
      // Drills
      {
        id: 'DRILL_3MM_HSS',
        type: 'drill',
        diameter: 3,
        length: 50,
        flutes: 2,
        material: 'hss',
        coating: 'tin',
        maxRPM: 3000,
        recommendedSFM: 80
      },
      {
        id: 'DRILL_6MM_CARB',
        type: 'drill',
        diameter: 6,
        length: 80,
        flutes: 2,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 4000,
        recommendedSFM: 120
      },
      {
        id: 'DRILL_10MM_CARB',
        type: 'drill',
        diameter: 10,
        length: 100,
        flutes: 2,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 2500,
        recommendedSFM: 120
      },
      
      // Chamfer Mills
      {
        id: 'CHAMFER_90DEG_6MM',
        type: 'chamfer',
        diameter: 6,
        length: 40,
        flutes: 4,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 8000,
        recommendedSFM: 150
      },
      
      // Ball End Mills
      {
        id: 'BALL_6MM_2FL_CARB',
        type: 'ballmill',
        diameter: 6,
        length: 50,
        flutes: 2,
        material: 'carbide',
        coating: 'altin',
        maxRPM: 10000,
        recommendedSFM: 150
      }
    ];
  }

  private initializeMaterialDatabase(): void {
    this.materialDatabase = {
      'aluminum_6061': {
        name: 'Aluminum 6061-T6',
        density: 2.7, // g/cm³
        hardness: 95, // HB
        machinability: 90, // % (100 = free cutting brass)
        cutting: {
          roughing: { sfm: 800, chipLoad: 0.15 },
          finishing: { sfm: 1000, chipLoad: 0.08 },
          drilling: { sfm: 300, chipLoad: 0.1 }
        }
      },
      'steel_1018': {
        name: 'Steel 1018',
        density: 7.87,
        hardness: 126,
        machinability: 70,
        cutting: {
          roughing: { sfm: 400, chipLoad: 0.12 },
          finishing: { sfm: 500, chipLoad: 0.06 },
          drilling: { sfm: 200, chipLoad: 0.08 }
        }
      },
      'stainless_316': {
        name: 'Stainless Steel 316',
        density: 8.0,
        hardness: 217,
        machinability: 45,
        cutting: {
          roughing: { sfm: 200, chipLoad: 0.1 },
          finishing: { sfm: 250, chipLoad: 0.05 },
          drilling: { sfm: 100, chipLoad: 0.06 }
        }
      }
    };
  }

  public generateProgram(features: AdvancedFeature[], material: string = 'aluminum_6061'): Program {
    console.log(`Generating production program for ${features.length} features...`);
    
    const operations = this.generateOperations(features, material);
    const optimizedOperations = this.optimizeOperationSequence(operations);
    const setupSheet = this.generateSetupSheet(optimizedOperations, material);
    const gcode = this.generateGCode(optimizedOperations, setupSheet);
    const warnings = this.validateProgram(optimizedOperations);
    
    const totalTime = optimizedOperations.reduce((sum, op) => sum + op.estimatedTime, 0);
    
    console.log(`Program generated: ${optimizedOperations.length} operations, ${totalTime.toFixed(1)} minutes`);
    
    return {
      id: `PROG_${Date.now()}`,
      name: `Production Program - ${features.length} Features`,
      operations: optimizedOperations,
      setupSheet,
      totalTime,
      gcode,
      warnings
    };
  }

  private generateOperations(features: AdvancedFeature[], material: string): Operation[] {
    const operations: Operation[] = [];
    let toolNumber = 1;
    
    // Group features by machining strategy
    const operationGroups = this.groupFeaturesByStrategy(features);
    
    // Generate operations for each group
    Object.entries(operationGroups).forEach(([strategy, featureGroup]) => {
      featureGroup.forEach(feature => {
        const ops = this.generateOperationsForFeature(feature, material, toolNumber);
        operations.push(...ops);
        toolNumber += ops.length;
      });
    });
    
    return operations;
  }

  private groupFeaturesByStrategy(features: AdvancedFeature[]): { [strategy: string]: AdvancedFeature[] } {
    const groups: { [strategy: string]: AdvancedFeature[] } = {};
    
    features.forEach(feature => {
      const strategy = feature.machiningStrategy;
      if (!groups[strategy]) {
        groups[strategy] = [];
      }
      groups[strategy].push(feature);
    });
    
    return groups;
  }

  private generateOperationsForFeature(feature: AdvancedFeature, material: string, startingToolNumber: number): Operation[] {
    const operations: Operation[] = [];
    
    switch (feature.type) {
      case 'hole':
        operations.push(...this.generateHoleOperations(feature, material, startingToolNumber));
        break;
      case 'pocket':
        operations.push(...this.generatePocketOperations(feature, material, startingToolNumber));
        break;
      case 'slot':
        operations.push(...this.generateSlotOperations(feature, material, startingToolNumber));
        break;
      case 'chamfer':
        operations.push(...this.generateChamferOperations(feature, material, startingToolNumber));
        break;
      case 'step':
        operations.push(...this.generateStepOperations(feature, material, startingToolNumber));
        break;
      default:
        console.warn(`Unknown feature type: ${feature.type}`);
    }
    
    return operations;
  }

  private generateHoleOperations(feature: AdvancedFeature, material: string, toolNumber: number): Operation[] {
    const operations: Operation[] = [];
    const diameter = feature.dimensions.diameter;
    const depth = feature.depth;
    
    // Select appropriate drill
    const drill = this.selectDrill(diameter);
    if (!drill) {
      console.warn(`No suitable drill found for ${diameter}mm hole`);
      return operations;
    }
    
    // Generate drilling operation
    const drillingOp = this.createDrillingOperation(feature, drill, material, toolNumber);
    operations.push(drillingOp);
    
    // Add reaming operation for precision holes
    if (diameter > 6 && feature.tolerances.diameter < 0.025) {
      const reamer = this.selectReamer(diameter);
      if (reamer) {
        const reamingOp = this.createReamingOperation(feature, reamer, material, toolNumber + 1);
        operations.push(reamingOp);
      }
    }
    
    return operations;
  }

  private generatePocketOperations(feature: AdvancedFeature, material: string, toolNumber: number): Operation[] {
    const operations: Operation[] = [];
    
    // Roughing operation
    const roughingTool = this.selectRoughingEndMill(feature);
    if (roughingTool) {
      const roughingOp = this.createRoughingOperation(feature, roughingTool, material, toolNumber);
      operations.push(roughingOp);
    }
    
    // Semi-finishing operation (if needed)
    if (feature.complexity === 'complex') {
      const semiFinishTool = this.selectFinishingEndMill(feature, 0.8);
      if (semiFinishTool) {
        const semiFinishOp = this.createSemiFinishingOperation(feature, semiFinishTool, material, toolNumber + 1);
        operations.push(semiFinishOp);
      }
    }
    
    // Finishing operation
    const finishingTool = this.selectFinishingEndMill(feature);
    if (finishingTool) {
      const finishingOp = this.createFinishingOperation(feature, finishingTool, material, toolNumber + operations.length);
      operations.push(finishingOp);
    }
    
    return operations;
  }

  private generateSlotOperations(feature: AdvancedFeature, material: string, toolNumber: number): Operation[] {
    const operations: Operation[] = [];
    const width = feature.dimensions.width;
    
    // Select end mill for slot
    const endMill = this.selectSlotEndMill(width);
    if (!endMill) {
      console.warn(`No suitable end mill found for ${width}mm slot`);
      return operations;
    }
    
    // Single operation for slot milling
    const slotOp = this.createSlotMillingOperation(feature, endMill, material, toolNumber);
    operations.push(slotOp);
    
    return operations;
  }

  private generateChamferOperations(feature: AdvancedFeature, material: string, toolNumber: number): Operation[] {
    const operations: Operation[] = [];
    
    const chamferTool = this.selectChamferTool(feature.dimensions.width);
    if (!chamferTool) {
      console.warn(`No suitable chamfer tool found`);
      return operations;
    }
    
    const chamferOp = this.createChamferOperation(feature, chamferTool, material, toolNumber);
    operations.push(chamferOp);
    
    return operations;
  }

  private generateStepOperations(feature: AdvancedFeature, material: string, toolNumber: number): Operation[] {
    const operations: Operation[] = [];
    
    const faceMill = this.selectFaceMill(feature);
    if (!faceMill) {
      console.warn(`No suitable face mill found for step operation`);
      return operations;
    }
    
    const facingOp = this.createFacingOperation(feature, faceMill, material, toolNumber);
    operations.push(facingOp);
    
    return operations;
  }

  private selectDrill(diameter: number): Tool | null {
    return this.toolLibrary.find(tool => 
      tool.type === 'drill' && 
      Math.abs(tool.diameter - diameter) < 0.1
    ) || null;
  }

  private selectReamer(diameter: number): Tool | null {
    return this.toolLibrary.find(tool => 
      tool.type === 'reamer' && 
      Math.abs(tool.diameter - diameter) < 0.05
    ) || null;
  }

  private selectRoughingEndMill(feature: AdvancedFeature): Tool | null {
    const minDimension = Math.min(feature.dimensions.width || 0, feature.dimensions.length || 0);
    const targetDiameter = minDimension * 0.6; // 60% of smallest dimension
    
    return this.toolLibrary
      .filter(tool => tool.type === 'endmill' && tool.diameter <= targetDiameter)
      .sort((a, b) => b.diameter - a.diameter)[0] || null;
  }

  private selectFinishingEndMill(feature: AdvancedFeature, sizeFactor: number = 1.0): Tool | null {
    const minDimension = Math.min(feature.dimensions.width || 0, feature.dimensions.length || 0);
    const targetDiameter = minDimension * 0.8 * sizeFactor; // 80% of smallest dimension
    
    return this.toolLibrary
      .filter(tool => tool.type === 'endmill' && tool.diameter <= targetDiameter)
      .sort((a, b) => b.diameter - a.diameter)[0] || null;
  }

  private selectSlotEndMill(width: number): Tool | null {
    const targetDiameter = width * 0.95; // 95% of slot width
    
    return this.toolLibrary
      .filter(tool => tool.type === 'endmill' && tool.diameter <= targetDiameter)
      .sort((a, b) => b.diameter - a.diameter)[0] || null;
  }

  private selectChamferTool(chamferWidth: number): Tool | null {
    return this.toolLibrary.find(tool => tool.type === 'chamfer') || null;
  }

  private selectFaceMill(feature: AdvancedFeature): Tool | null {
    const maxDimension = Math.max(feature.dimensions.width || 0, feature.dimensions.length || 0);
    
    return this.toolLibrary
      .filter(tool => (tool.type === 'facemill' || tool.type === 'endmill') && tool.diameter <= maxDimension * 0.8)
      .sort((a, b) => b.diameter - a.diameter)[0] || null;
  }

  private createDrillingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateDrillingParameters(feature, tool, material);
    const toolpath = this.generateDrillingToolpath(feature, tool, parameters);
    
    return {
      id: `DRILL_${feature.id}`,
      type: 'drilling',
      name: `Drill Ø${feature.dimensions.diameter}mm x ${feature.depth}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Drilling operation for ${feature.dimensions.diameter}mm hole`,
      notes: [
        `Peck drilling with ${parameters.axialDepthOfCut}mm pecks`,
        `Use coolant for chip evacuation`
      ],
      estimatedTime: toolpath.estimatedTime,
      priority: 1
    };
  }

  private createRoughingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateRoughingParameters(feature, tool, material);
    const toolpath = this.generateAdaptiveClearingToolpath(feature, tool, parameters);
    
    return {
      id: `ROUGH_${feature.id}`,
      type: 'roughing',
      name: `Rough ${feature.type.toUpperCase()} - ${tool.diameter}mm EM`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Adaptive clearing roughing operation`,
      notes: [
        `Trochoidal milling for maximum metal removal`,
        `Leave ${parameters.radialDepthOfCut}mm stock for finishing`
      ],
      estimatedTime: toolpath.estimatedTime,
      priority: 2
    };
  }

  private createFinishingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateFinishingParameters(feature, tool, material);
    const toolpath = this.generateContourFinishingToolpath(feature, tool, parameters);
    
    return {
      id: `FINISH_${feature.id}`,
      type: 'finishing',
      name: `Finish ${feature.type.toUpperCase()} - ${tool.diameter}mm EM`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Contour finishing operation`,
      notes: [
        `High-precision contouring`,
        `Maintain surface finish requirements`
      ],
      estimatedTime: toolpath.estimatedTime,
      priority: 3
    };
  }

  private createSemiFinishingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateSemiFinishingParameters(feature, tool, material);
    const toolpath = this.generateSemiFinishingToolpath(feature, tool, parameters);
    
    return {
      id: `SEMI_${feature.id}`,
      type: 'roughing',
      name: `Semi-Finish ${feature.type.toUpperCase()} - ${tool.diameter}mm EM`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Semi-finishing operation for complex geometry`,
      estimatedTime: toolpath.estimatedTime,
      priority: 2.5
    };
  }

  private createReamingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateReamingParameters(feature, tool, material);
    const toolpath = this.generateReamingToolpath(feature, tool, parameters);
    
    return {
      id: `REAM_${feature.id}`,
      type: 'reaming',
      name: `Ream Ø${feature.dimensions.diameter}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Precision reaming operation`,
      notes: [
        `Precision size and surface finish`,
        `Use cutting fluid for best results`
      ],
      estimatedTime: toolpath.estimatedTime,
      priority: 1.5
    };
  }

  private createSlotMillingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateSlotParameters(feature, tool, material);
    const toolpath = this.generateSlotMillingToolpath(feature, tool, parameters);
    
    return {
      id: `SLOT_${feature.id}`,
      type: 'roughing',
      name: `Mill Slot ${feature.dimensions.width}x${feature.dimensions.length}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Slot milling operation`,
      notes: [
        `Plunge milling technique`,
        `Multiple passes for deep slots`
      ],
      estimatedTime: toolpath.estimatedTime,
      priority: 2
    };
  }

  private createChamferOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateChamferParameters(feature, tool, material);
    const toolpath = this.generateChamferToolpath(feature, tool, parameters);
    
    return {
      id: `CHAMFER_${feature.id}`,
      type: 'chamfering',
      name: `Chamfer ${feature.dimensions.width}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Edge chamfering operation`,
      estimatedTime: toolpath.estimatedTime,
      priority: 4
    };
  }

  private createFacingOperation(feature: AdvancedFeature, tool: Tool, material: string, toolNumber: number): Operation {
    const parameters = this.calculateFacingParameters(feature, tool, material);
    const toolpath = this.generateFacingToolpath(feature, tool, parameters);
    
    return {
      id: `FACE_${feature.id}`,
      type: 'facing',
      name: `Face Step - ${tool.diameter}mm`,
      feature,
      tool,
      parameters,
      toolpath,
      workOffset: this.workOffset,
      toolNumber,
      description: `Step facing operation`,
      estimatedTime: toolpath.estimatedTime,
      priority: 1
    };
  }

  private calculateDrillingParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const materialData = this.materialDatabase[material];
    const sfm = materialData.cutting.drilling.sfm;
    const chipLoad = materialData.cutting.drilling.chipLoad;
    
    const spindleSpeed = Math.min(tool.maxRPM, (sfm * 1000) / (Math.PI * tool.diameter));
    const feedrate = spindleSpeed * tool.flutes * chipLoad;
    
    return {
      feedrate: Math.round(feedrate),
      spindleSpeed: Math.round(spindleSpeed),
      axialDepthOfCut: Math.min(tool.diameter * 3, feature.depth / 3), // Peck depth
      radialDepthOfCut: 0,
      plungeRate: Math.round(feedrate * 0.3),
      retractRate: Math.round(feedrate * 2),
      coolant: true,
      compensation: 'off'
    };
  }

  private calculateRoughingParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const materialData = this.materialDatabase[material];
    const sfm = materialData.cutting.roughing.sfm;
    const chipLoad = materialData.cutting.roughing.chipLoad;
    
    const spindleSpeed = Math.min(tool.maxRPM, (sfm * 1000) / (Math.PI * tool.diameter));
    const feedrate = spindleSpeed * tool.flutes * chipLoad;
    
    return {
      feedrate: Math.round(feedrate),
      spindleSpeed: Math.round(spindleSpeed),
      axialDepthOfCut: Math.min(tool.diameter * 0.5, feature.depth / 4),
      radialDepthOfCut: tool.diameter * 0.1, // 10% stepover for trochoidal
      plungeRate: Math.round(feedrate * 0.3),
      retractRate: Math.round(feedrate * 2),
      coolant: true,
      compensation: 'left'
    };
  }

  private calculateFinishingParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const materialData = this.materialDatabase[material];
    const sfm = materialData.cutting.finishing.sfm;
    const chipLoad = materialData.cutting.finishing.chipLoad;
    
    const spindleSpeed = Math.min(tool.maxRPM, (sfm * 1000) / (Math.PI * tool.diameter));
    const feedrate = spindleSpeed * tool.flutes * chipLoad;
    
    return {
      feedrate: Math.round(feedrate),
      spindleSpeed: Math.round(spindleSpeed),
      axialDepthOfCut: Math.min(tool.diameter * 0.2, 2),
      radialDepthOfCut: 0.5, // Light finishing pass
      plungeRate: Math.round(feedrate * 0.2),
      retractRate: Math.round(feedrate * 2),
      coolant: true,
      compensation: 'left'
    };
  }

  private calculateSemiFinishingParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const roughingParams = this.calculateRoughingParameters(feature, tool, material);
    const finishingParams = this.calculateFinishingParameters(feature, tool, material);
    
    // Blend between roughing and finishing parameters
    return {
      feedrate: Math.round((roughingParams.feedrate + finishingParams.feedrate) / 2),
      spindleSpeed: finishingParams.spindleSpeed,
      axialDepthOfCut: Math.round((roughingParams.axialDepthOfCut + finishingParams.axialDepthOfCut) / 2),
      radialDepthOfCut: 0.2,
      plungeRate: finishingParams.plungeRate,
      retractRate: finishingParams.retractRate,
      coolant: true,
      compensation: 'left'
    };
  }

  private calculateReamingParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const drillingParams = this.calculateDrillingParameters(feature, tool, material);
    
    return {
      feedrate: Math.round(drillingParams.feedrate * 0.7), // Slower for reaming
      spindleSpeed: Math.round(drillingParams.spindleSpeed * 0.8),
      axialDepthOfCut: feature.depth, // Single pass
      radialDepthOfCut: 0,
      plungeRate: Math.round(drillingParams.plungeRate * 0.5),
      retractRate: drillingParams.retractRate,
      coolant: true,
      compensation: 'off'
    };
  }

  private calculateSlotParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    return this.calculateRoughingParameters(feature, tool, material);
  }

  private calculateChamferParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const finishingParams = this.calculateFinishingParameters(feature, tool, material);
    
    return {
      ...finishingParams,
      feedrate: Math.round(finishingParams.feedrate * 0.8), // Slightly slower for chamfering
      axialDepthOfCut: feature.dimensions.width || 1,
      radialDepthOfCut: 0
    };
  }

  private calculateFacingParameters(feature: AdvancedFeature, tool: Tool, material: string): CuttingParameters {
    const roughingParams = this.calculateRoughingParameters(feature, tool, material);
    
    return {
      ...roughingParams,
      axialDepthOfCut: Math.min(2, feature.dimensions.height / 2),
      radialDepthOfCut: tool.diameter * 0.8 // Full width of cut for facing
    };
  }

  private generateDrillingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const totalDepth = feature.depth;
    const peckDepth = params.axialDepthOfCut;
    const numPecks = Math.ceil(totalDepth / peckDepth);
    
    // Rapid to position above hole
    segments.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, this.retractHeight)
    });
    
    // Peck drilling cycle
    for (let peck = 0; peck < numPecks; peck++) {
      const currentDepth = Math.min((peck + 1) * peckDepth, totalDepth);
      const targetZ = center.z - currentDepth;
      
      // Drill down
      segments.push({
        type: 'drill',
        startPoint: new THREE.Vector3(center.x, center.y, this.retractHeight),
        endPoint: new THREE.Vector3(center.x, center.y, targetZ),
        feedrate: params.plungeRate,
        spindleSpeed: params.spindleSpeed
      });
      
      // Retract for chip breaking (except on final peck)
      if (peck < numPecks - 1) {
        segments.push({
          type: 'retract',
          startPoint: new THREE.Vector3(center.x, center.y, targetZ),
          endPoint: new THREE.Vector3(center.x, center.y, this.retractHeight),
          feedrate: params.retractRate
        });
        
        // Brief dwell for chip evacuation
        segments.push({
          type: 'dwell',
          startPoint: new THREE.Vector3(center.x, center.y, this.retractHeight),
          endPoint: new THREE.Vector3(center.x, center.y, this.retractHeight),
          dwellTime: 0.5
        });
      }
    }
    
    // Final retract to safe height
    const lastPoint = segments[segments.length - 1].endPoint;
    segments.push({
      type: 'retract',
      startPoint: lastPoint,
      endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
      feedrate: params.retractRate
    });
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_DRILL_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private generateAdaptiveClearingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const width = feature.dimensions.width;
    const length = feature.dimensions.length;
    const depth = feature.depth;
    
    // Calculate number of depth passes
    const numDepthPasses = Math.ceil(depth / params.axialDepthOfCut);
    
    for (let depthPass = 0; depthPass < numDepthPasses; depthPass++) {
      const currentDepth = Math.min((depthPass + 1) * params.axialDepthOfCut, depth);
      const zLevel = center.z - currentDepth;
      
      // Generate trochoidal toolpath for this level
      const trochoidalPath = this.generateTrochoidalPath(center, width, length, tool.diameter, params.radialDepthOfCut);
      
      // Add approach move
      if (trochoidalPath.length > 0) {
        segments.push({
          type: 'rapid',
          startPoint: new THREE.Vector3(trochoidalPath[0].x, trochoidalPath[0].y, this.safeHeight),
          endPoint: new THREE.Vector3(trochoidalPath[0].x, trochoidalPath[0].y, this.retractHeight)
        });
        
        // Plunge to depth
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(trochoidalPath[0].x, trochoidalPath[0].y, this.retractHeight),
          endPoint: new THREE.Vector3(trochoidalPath[0].x, trochoidalPath[0].y, zLevel),
          feedrate: params.plungeRate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Execute trochoidal path
        for (let i = 1; i < trochoidalPath.length; i++) {
          segments.push({
            type: 'linear',
            startPoint: new THREE.Vector3(trochoidalPath[i-1].x, trochoidalPath[i-1].y, zLevel),
            endPoint: new THREE.Vector3(trochoidalPath[i].x, trochoidalPath[i].y, zLevel),
            feedrate: params.feedrate,
            spindleSpeed: params.spindleSpeed
          });
        }
        
        // Retract at end of level
        const lastPoint = trochoidalPath[trochoidalPath.length - 1];
        segments.push({
          type: 'retract',
          startPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, zLevel),
          endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.retractHeight),
          feedrate: params.retractRate
        });
      }
    }
    
    // Final retract to safe height
    if (segments.length > 0) {
      const lastPoint = segments[segments.length - 1].endPoint;
      segments.push({
        type: 'retract',
        startPoint: lastPoint,
        endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
        feedrate: params.retractRate
      });
    }
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_ROUGH_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private generateTrochoidalPath(center: THREE.Vector3, width: number, length: number, toolDiameter: number, stepover: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const trochoidRadius = toolDiameter * 0.05; // Small trochoidal motion
    const stepoverDistance = stepover;
    
    // Calculate bounds
    const minX = center.x - width / 2 + toolDiameter / 2;
    const maxX = center.x + width / 2 - toolDiameter / 2;
    const minY = center.y - length / 2 + toolDiameter / 2;
    const maxY = center.y + length / 2 - toolDiameter / 2;
    
    let currentX = minX;
    let currentY = minY;
    let direction = 1; // 1 for +Y, -1 for -Y
    let angle = 0;
    
    while (currentX <= maxX) {
      const targetY = direction > 0 ? maxY : minY;
      
      while ((direction > 0 && currentY <= targetY) || (direction < 0 && currentY >= targetY)) {
        // Add trochoidal motion
        const trochX = currentX + Math.cos(angle) * trochoidRadius;
        const trochY = currentY + Math.sin(angle) * trochoidRadius;
        
        points.push(new THREE.Vector3(trochX, trochY, 0));
        
        currentY += direction * stepoverDistance / 10; // Small steps for smooth motion
        angle += 0.5; // Increment angle for trochoidal motion
      }
      
      currentX += stepoverDistance;
      direction *= -1; // Change direction for next pass
      currentY = direction > 0 ? minY : maxY; // Reset Y position
    }
    
    return points;
  }

  private generateContourFinishingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const boundaryVertices = feature.boundaryVertices;
    
    if (!boundaryVertices || boundaryVertices.length < 3) {
      console.warn('Insufficient boundary vertices for contour finishing');
      return {
        id: `TP_FINISH_${feature.id}`,
        segments: [],
        estimatedTime: 0,
        materialRemovalRate: 0,
        totalLength: 0
      };
    }
    
    // Calculate finish allowance offset
    const finishAllowance = params.radialDepthOfCut;
    const offsetBoundary = this.offsetBoundary(boundaryVertices, finishAllowance);
    
    // Number of finishing passes
    const numFinishPasses = Math.ceil(feature.depth / params.axialDepthOfCut);
    
    for (let pass = 0; pass < numFinishPasses; pass++) {
      const currentDepth = Math.min((pass + 1) * params.axialDepthOfCut, feature.depth);
      const zLevel = feature.position.z - currentDepth;
      
      if (offsetBoundary.length > 0) {
        // Rapid to start position
        segments.push({
          type: 'rapid',
          startPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, this.safeHeight),
          endPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, this.retractHeight)
        });
        
        // Plunge to depth
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, this.retractHeight),
          endPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, zLevel),
          feedrate: params.plungeRate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Follow contour
        for (let i = 1; i < offsetBoundary.length; i++) {
          segments.push({
            type: 'linear',
            startPoint: new THREE.Vector3(offsetBoundary[i-1].x, offsetBoundary[i-1].y, zLevel),
            endPoint: new THREE.Vector3(offsetBoundary[i].x, offsetBoundary[i].y, zLevel),
            feedrate: params.feedrate,
            spindleSpeed: params.spindleSpeed
          });
        }
        
        // Close contour
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(offsetBoundary[offsetBoundary.length-1].x, offsetBoundary[offsetBoundary.length-1].y, zLevel),
          endPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, zLevel),
          feedrate: params.feedrate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Retract
        segments.push({
          type: 'retract',
          startPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, zLevel),
          endPoint: new THREE.Vector3(offsetBoundary[0].x, offsetBoundary[0].y, this.retractHeight),
          feedrate: params.retractRate
        });
      }
    }
    
    // Final retract to safe height
    if (segments.length > 0) {
      const lastPoint = segments[segments.length - 1].endPoint;
      segments.push({
        type: 'retract',
        startPoint: lastPoint,
        endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
        feedrate: params.retractRate
      });
    }
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_FINISH_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private offsetBoundary(vertices: THREE.Vector3[], offset: number): THREE.Vector3[] {
    if (vertices.length < 3) return vertices;
    
    // Simplified offset algorithm - in practice would use more sophisticated methods
    const offsetVertices: THREE.Vector3[] = [];
    
    for (let i = 0; i < vertices.length; i++) {
      const prev = vertices[(i - 1 + vertices.length) % vertices.length];
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      
      // Calculate offset direction
      const v1 = new THREE.Vector3().subVectors(current, prev).normalize();
      const v2 = new THREE.Vector3().subVectors(next, current).normalize();
      const bisector = new THREE.Vector3().addVectors(v1, v2).normalize();
      
      // Calculate perpendicular offset
      const perpendicular = new THREE.Vector3(-bisector.y, bisector.x, bisector.z).normalize();
      const offsetPoint = current.clone().add(perpendicular.multiplyScalar(offset));
      
      offsetVertices.push(offsetPoint);
    }
    
    return offsetVertices;
  }

  private generateSemiFinishingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    // Semi-finishing is similar to finishing but with larger stepover
    const modifiedParams = { ...params, radialDepthOfCut: params.radialDepthOfCut * 2 };
    return this.generateContourFinishingToolpath(feature, tool, modifiedParams);
  }

  private generateReamingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    
    // Rapid to position
    segments.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      endPoint: new THREE.Vector3(center.x, center.y, this.retractHeight)
    });
    
    // Ream in single pass
    segments.push({
      type: 'linear',
      startPoint: new THREE.Vector3(center.x, center.y, this.retractHeight),
      endPoint: new THREE.Vector3(center.x, center.y, center.z - feature.depth),
      feedrate: params.feedrate,
      spindleSpeed: params.spindleSpeed
    });
    
    // Brief dwell at bottom
    segments.push({
      type: 'dwell',
      startPoint: new THREE.Vector3(center.x, center.y, center.z - feature.depth),
      endPoint: new THREE.Vector3(center.x, center.y, center.z - feature.depth),
      dwellTime: 0.5
    });
    
    // Retract
    segments.push({
      type: 'retract',
      startPoint: new THREE.Vector3(center.x, center.y, center.z - feature.depth),
      endPoint: new THREE.Vector3(center.x, center.y, this.safeHeight),
      feedrate: params.retractRate
    });
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_REAM_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private generateSlotMillingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const width = feature.dimensions.width;
    const length = feature.dimensions.length;
    const depth = feature.depth;
    
    // Calculate number of passes needed
    const numWidthPasses = Math.ceil(width / (tool.diameter * 0.9));
    const numDepthPasses = Math.ceil(depth / params.axialDepthOfCut);
    
    for (let depthPass = 0; depthPass < numDepthPasses; depthPass++) {
      const currentDepth = Math.min((depthPass + 1) * params.axialDepthOfCut, depth);
      const zLevel = center.z - currentDepth;
      
      for (let widthPass = 0; widthPass < numWidthPasses; widthPass++) {
        const offsetY = (widthPass - (numWidthPasses - 1) / 2) * tool.diameter * 0.8;
        const startX = center.x - length / 2;
        const endX = center.x + length / 2;
        const currentY = center.y + offsetY;
        
        // Rapid to start position
        segments.push({
          type: 'rapid',
          startPoint: new THREE.Vector3(startX, currentY, this.safeHeight),
          endPoint: new THREE.Vector3(startX, currentY, this.retractHeight)
        });
        
        // Plunge to depth
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(startX, currentY, this.retractHeight),
          endPoint: new THREE.Vector3(startX, currentY, zLevel),
          feedrate: params.plungeRate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Cut along slot
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(startX, currentY, zLevel),
          endPoint: new THREE.Vector3(endX, currentY, zLevel),
          feedrate: params.feedrate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Retract
        segments.push({
          type: 'retract',
          startPoint: new THREE.Vector3(endX, currentY, zLevel),
          endPoint: new THREE.Vector3(endX, currentY, this.retractHeight),
          feedrate: params.retractRate
        });
      }
    }
    
    // Final retract to safe height
    if (segments.length > 0) {
      const lastPoint = segments[segments.length - 1].endPoint;
      segments.push({
        type: 'retract',
        startPoint: lastPoint,
        endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
        feedrate: params.retractRate
      });
    }
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_SLOT_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private generateChamferToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const boundaryVertices = feature.boundaryVertices;
    
    if (!boundaryVertices || boundaryVertices.length < 2) {
      return {
        id: `TP_CHAMFER_${feature.id}`,
        segments: [],
        estimatedTime: 0,
        materialRemovalRate: 0,
        totalLength: 0
      };
    }
    
    const chamferDepth = feature.dimensions.width || 1;
    const zLevel = feature.position.z - chamferDepth;
    
    // Rapid to start
    segments.push({
      type: 'rapid',
      startPoint: new THREE.Vector3(boundaryVertices[0].x, boundaryVertices[0].y, this.safeHeight),
      endPoint: new THREE.Vector3(boundaryVertices[0].x, boundaryVertices[0].y, this.retractHeight)
    });
    
    // Plunge to chamfer depth
    segments.push({
      type: 'linear',
      startPoint: new THREE.Vector3(boundaryVertices[0].x, boundaryVertices[0].y, this.retractHeight),
      endPoint: new THREE.Vector3(boundaryVertices[0].x, boundaryVertices[0].y, zLevel),
      feedrate: params.plungeRate,
      spindleSpeed: params.spindleSpeed
    });
    
    // Follow edge
    for (let i = 1; i < boundaryVertices.length; i++) {
      segments.push({
        type: 'linear',
        startPoint: new THREE.Vector3(boundaryVertices[i-1].x, boundaryVertices[i-1].y, zLevel),
        endPoint: new THREE.Vector3(boundaryVertices[i].x, boundaryVertices[i].y, zLevel),
        feedrate: params.feedrate,
        spindleSpeed: params.spindleSpeed
      });
    }
    
    // Retract
    const lastVertex = boundaryVertices[boundaryVertices.length - 1];
    segments.push({
      type: 'retract',
      startPoint: new THREE.Vector3(lastVertex.x, lastVertex.y, zLevel),
      endPoint: new THREE.Vector3(lastVertex.x, lastVertex.y, this.safeHeight),
      feedrate: params.retractRate
    });
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_CHAMFER_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private generateFacingToolpath(feature: AdvancedFeature, tool: Tool, params: CuttingParameters): Toolpath {
    const segments: ToolpathSegment[] = [];
    const center = new THREE.Vector3(feature.position.x, feature.position.y, feature.position.z);
    const width = feature.dimensions.width;
    const length = feature.dimensions.length;
    const stepHeight = feature.dimensions.height;
    
    const numPasses = Math.ceil(stepHeight / params.axialDepthOfCut);
    const stepover = tool.diameter * 0.8;
    const numCuts = Math.ceil(width / stepover);
    
    for (let pass = 0; pass < numPasses; pass++) {
      const currentDepth = Math.min((pass + 1) * params.axialDepthOfCut, stepHeight);
      const zLevel = center.z - currentDepth;
      
      for (let cut = 0; cut < numCuts; cut++) {
        const offsetX = (cut - (numCuts - 1) / 2) * stepover;
        const startY = center.y - length / 2;
        const endY = center.y + length / 2;
        const currentX = center.x + offsetX;
        
        // Rapid to start
        segments.push({
          type: 'rapid',
          startPoint: new THREE.Vector3(currentX, startY, this.safeHeight),
          endPoint: new THREE.Vector3(currentX, startY, this.retractHeight)
        });
        
        // Plunge
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(currentX, startY, this.retractHeight),
          endPoint: new THREE.Vector3(currentX, startY, zLevel),
          feedrate: params.plungeRate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Face cut
        segments.push({
          type: 'linear',
          startPoint: new THREE.Vector3(currentX, startY, zLevel),
          endPoint: new THREE.Vector3(currentX, endY, zLevel),
          feedrate: params.feedrate,
          spindleSpeed: params.spindleSpeed
        });
        
        // Retract
        segments.push({
          type: 'retract',
          startPoint: new THREE.Vector3(currentX, endY, zLevel),
          endPoint: new THREE.Vector3(currentX, endY, this.retractHeight),
          feedrate: params.retractRate
        });
      }
    }
    
    // Final retract to safe height
    if (segments.length > 0) {
      const lastPoint = segments[segments.length - 1].endPoint;
      segments.push({
        type: 'retract',
        startPoint: lastPoint,
        endPoint: new THREE.Vector3(lastPoint.x, lastPoint.y, this.safeHeight),
        feedrate: params.retractRate
      });
    }
    
    const totalLength = this.calculateToolpathLength(segments);
    const estimatedTime = this.estimateToolpathTime(segments, params);
    const mrr = this.calculateMaterialRemovalRate(feature, params);
    
    return {
      id: `TP_FACE_${feature.id}`,
      segments,
      estimatedTime,
      materialRemovalRate: mrr,
      totalLength
    };
  }

  private calculateToolpathLength(segments: ToolpathSegment[]): number {
    return segments.reduce((total, segment) => {
      return total + segment.startPoint.distanceTo(segment.endPoint);
    }, 0);
  }

  private estimateToolpathTime(segments: ToolpathSegment[], params: CuttingParameters): number {
    let totalTime = 0;
    
    segments.forEach(segment => {
      const distance = segment.startPoint.distanceTo(segment.endPoint);
      const feedrate = segment.feedrate || params.feedrate;
      
      switch (segment.type) {
        case 'rapid':
          totalTime += distance / 5000; // 5000 mm/min rapid rate
          break;
        case 'retract':
          totalTime += distance / (segment.feedrate || params.retractRate);
          break;
        case 'dwell':
          totalTime += segment.dwellTime || 0;
          break;
        default:
          totalTime += distance / feedrate;
      }
    });
    
    return totalTime; // time in minutes
  }

  private calculateMaterialRemovalRate(feature: AdvancedFeature, params: CuttingParameters): number {
    const volume = feature.area * feature.depth; // mm³
    const volumeCm3 = volume / 1000; // cm³
    
    // Estimate based on cutting parameters
    const mrr = params.feedrate * params.axialDepthOfCut * params.radialDepthOfCut / 1000; // cm³/min
    
    return Math.max(0.1, mrr); // Minimum 0.1 cm³/min
  }

  private optimizeOperationSequence(operations: Operation[]): Operation[] {
    // Sort operations by priority and type for optimal machining sequence
    return operations.sort((a, b) => {
      // Primary sort: priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Secondary sort: operation type
      const typeOrder = ['drilling', 'reaming', 'roughing', 'finishing', 'chamfering', 'facing'];
      const aIndex = typeOrder.indexOf(a.type);
      const bIndex = typeOrder.indexOf(b.type);
      
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      
      // Tertiary sort: tool number (minimize tool changes)
      return a.toolNumber - b.toolNumber;
    });
  }

  private generateSetupSheet(operations: Operation[], material: string): SetupSheet {
    const stockSize = this.stockBoundary.getSize(new THREE.Vector3());
    const uniqueTools = [...new Set(operations.map(op => op.tool))];
    
    return {
      stockMaterial: this.materialDatabase[material]?.name || 'Unknown Material',
      stockDimensions: {
        x: Math.round(stockSize.x),
        y: Math.round(stockSize.y),
        z: Math.round(stockSize.z)
      },
      workOffsets: [
        {
          name: 'G54',
          position: { x: 0, y: 0, z: 0 },
          description: 'Primary work offset'
        }
      ],
      requiredTools: uniqueTools,
      fixtures: ['Machine Vise', 'Parallels'],
      notes: [
        'Ensure adequate coolant flow',
        'Check tool condition before start',
        'Verify work offset before machining',
        'Use climb milling where possible'
      ]
    };
  }

  private generateGCode(operations: Operation[], setupSheet: SetupSheet): string {
    const lines: string[] = [];
    
    // Program header
    lines.push('(PRODUCTION CNC PROGRAM)');
    lines.push(`(MATERIAL: ${setupSheet.stockMaterial})`);
    lines.push(`(STOCK: ${setupSheet.stockDimensions.x} x ${setupSheet.stockDimensions.y} x ${setupSheet.stockDimensions.z})`);
    lines.push(`(GENERATED: ${new Date().toISOString()})`);
    lines.push('');
    
    // Program start
    lines.push('G90 G54 G17 G94 G80'); // Absolute, work offset, XY plane, feed rate mode, cancel cycles
    lines.push('G21'); // Metric units
    lines.push('M06 T0'); // Tool change to null tool
    lines.push('M03 S1000'); // Start spindle
    lines.push('G00 Z' + this.safeHeight); // Move to safe height
    lines.push('');
    
    let currentTool = 0;
    
    operations.forEach((operation, index) => {
      // Tool change if needed
      if (operation.toolNumber !== currentTool) {
        lines.push(`(TOOL ${operation.toolNumber}: ${operation.tool.type.toUpperCase()} ${operation.tool.diameter}MM)`);
        lines.push(`M06 T${operation.toolNumber}`);
        lines.push(`M03 S${operation.parameters.spindleSpeed}`);
        lines.push('G00 Z' + this.safeHeight);
        currentTool = operation.toolNumber;
        lines.push('');
      }
      
      // Operation header
      lines.push(`(OPERATION ${index + 1}: ${operation.name})`);
      lines.push(`(FEATURE: ${operation.feature.type.toUpperCase()})`);
      lines.push(`(ESTIMATED TIME: ${operation.estimatedTime.toFixed(1)} MIN)`);
      
      // Coolant control
      if (operation.parameters.coolant) {
        lines.push('M08'); // Coolant ON
      }
      
      // Cutter compensation
      if (operation.parameters.compensation !== 'off') {
        const comp = operation.parameters.compensation === 'left' ? 'G41' : 'G42';
        lines.push(`${comp} D${operation.toolNumber}`);
      }
      
      // Generate toolpath G-code
      operation.toolpath.segments.forEach(segment => {
        const gcode = this.segmentToGCode(segment, operation.parameters);
        if (gcode) lines.push(gcode);
      });
      
      // Cancel compensation
      if (operation.parameters.compensation !== 'off') {
        lines.push('G40'); // Cancel cutter compensation
      }
      
      // Coolant OFF
      if (operation.parameters.coolant) {
        lines.push('M09');
      }
      
      lines.push('');
    });
    
    // Program end
    lines.push('(PROGRAM END)');
    lines.push('G00 Z' + this.safeHeight);
    lines.push('G00 X0 Y0'); // Return to origin
    lines.push('M05'); // Stop spindle
    lines.push('M09'); // Coolant OFF
    lines.push('M30'); // End program
    
    return lines.join('\n');
  }

  private segmentToGCode(segment: ToolpathSegment, params: CuttingParameters): string {
    const x = segment.endPoint.x.toFixed(3);
    const y = segment.endPoint.y.toFixed(3);
    const z = segment.endPoint.z.toFixed(3);
    
    switch (segment.type) {
      case 'rapid':
        return `G00 X${x} Y${y} Z${z}`;
      
      case 'linear':
        const feedrate = segment.feedrate || params.feedrate;
        return `G01 X${x} Y${y} Z${z} F${feedrate}`;
      
      case 'arc_cw':
        if (segment.arcCenter) {
          const i = (segment.arcCenter.x - segment.startPoint.x).toFixed(3);
          const j = (segment.arcCenter.y - segment.startPoint.y).toFixed(3);
          const feedrate = segment.feedrate || params.feedrate;
          return `G02 X${x} Y${y} I${i} J${j} F${feedrate}`;
        }
        break;
      
      case 'arc_ccw':
        if (segment.arcCenter) {
          const i = (segment.arcCenter.x - segment.startPoint.x).toFixed(3);
          const j = (segment.arcCenter.y - segment.startPoint.y).toFixed(3);
          const feedrate = segment.feedrate || params.feedrate;
          return `G03 X${x} Y${y} I${i} J${j} F${feedrate}`;
        }
        break;
      
      case 'drill':
        const plungeRate = segment.feedrate || params.plungeRate;
        return `G01 Z${z} F${plungeRate}`;
      
      case 'retract':
        const retractRate = segment.feedrate || params.retractRate;
        return `G00 Z${z}`;
      
      case 'dwell':
        const dwellTime = segment.dwellTime || 0;
        return `G04 P${dwellTime}`;
      
      default:
        return '';
    }
    
    return '';
  }

  private validateProgram(operations: Operation[]): string[] {
    const warnings: string[] = [];
    
    // Check for tool collisions
    const toolLengths = operations.map(op => op.tool.length);
    const maxDepth = Math.max(...operations.map(op => op.feature.depth));
    
    if (Math.max(...toolLengths) < maxDepth * 1.5) {
      warnings.push('WARNING: Tool length may be insufficient for deep features');
    }
    
    // Check for excessive cutting parameters
    operations.forEach(operation => {
      const params = operation.parameters;
      const tool = operation.tool;
      
      if (params.spindleSpeed > tool.maxRPM) {
        warnings.push(`WARNING: Spindle speed ${params.spindleSpeed} exceeds tool limit ${tool.maxRPM} for ${operation.name}`);
      }
      
      if (params.axialDepthOfCut > tool.diameter) {
        warnings.push(`WARNING: Axial depth of cut exceeds tool diameter for ${operation.name}`);
      }
    });
    
    // Check operation sequence
    const operationTypes = operations.map(op => op.type);
    const hasRoughingBeforeFinishing = operationTypes.indexOf('finishing') > operationTypes.indexOf('roughing');
    
    if (!hasRoughingBeforeFinishing && operationTypes.includes('finishing')) {
      warnings.push('WARNING: Finishing operations should come after roughing');
    }
    
    return warnings;
  }
}