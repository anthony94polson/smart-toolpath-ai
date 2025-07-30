import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime for WebAssembly
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@latest/dist/';
ort.env.wasm.numThreads = 1;

export interface OnnxAAGNetFeature {
  type: string;
  confidence: number;
  position: [number, number, number];
  dimensions: number[];
  normal?: [number, number, number];
  machiningParameters: {
    toolRecommendation: string;
    feedRate: number;
    spindleSpeed: number;
    depthOfCut: number;
  };
}

export interface OnnxAAGNetResult {
  features: OnnxAAGNetFeature[];
  metadata: {
    processingTime: number;
    modelVersion: string;
    confidence: number;
  };
  statistics: {
    totalFeatures: number;
    featureTypes: Record<string, number>;
  };
}

class OnnxAAGNetService {
  private static instance: OnnxAAGNetService;
  private session: ort.InferenceSession | null = null;
  private modelLoaded = false;

  static getInstance(): OnnxAAGNetService {
    if (!OnnxAAGNetService.instance) {
      OnnxAAGNetService.instance = new OnnxAAGNetService();
    }
    return OnnxAAGNetService.instance;
  }

  async loadModel(): Promise<void> {
    if (this.modelLoaded && this.session) {
      return;
    }

    try {
      console.log('🔥 Loading ONNX AAGNet model...');
      
      // Try to load the converted ONNX model from Supabase storage
      const modelResponse = await fetch('/api/models/aagnet-model.onnx');
      
      if (!modelResponse.ok) {
        throw new Error(`Failed to load ONNX model: ${modelResponse.statusText}`);
      }

      const modelArrayBuffer = await modelResponse.arrayBuffer();
      console.log(`📦 Model loaded: ${(modelArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

      // Create ONNX Runtime session
      this.session = await ort.InferenceSession.create(modelArrayBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });

      this.modelLoaded = true;
      console.log('✅ ONNX AAGNet model loaded successfully');
      console.log('📊 Model inputs:', this.session.inputNames);
      console.log('📊 Model outputs:', this.session.outputNames);

    } catch (error) {
      console.error('❌ Failed to load ONNX model:', error);
      throw new Error(`Failed to initialize ONNX AAGNet model: ${error}`);
    }
  }

  async analyzeSTL(stlData: ArrayBuffer): Promise<OnnxAAGNetResult> {
    const startTime = performance.now();

    try {
      // Ensure model is loaded
      await this.loadModel();

      if (!this.session) {
        throw new Error('ONNX model not loaded');
      }

      console.log('🔍 Preprocessing STL data for ONNX inference...');
      
      // Convert STL to point cloud/voxel representation
      const inputTensor = await this.preprocessSTL(stlData);
      
      console.log('🚀 Running ONNX inference...');
      
      // Run inference
      const feeds = { [this.session.inputNames[0]]: inputTensor };
      const results = await this.session.run(feeds);

      console.log('📊 Raw ONNX outputs:', Object.keys(results));

      // Process outputs
      const features = await this.postprocessResults(results);
      
      const processingTime = performance.now() - startTime;
      
      console.log(`✅ ONNX inference completed in ${processingTime.toFixed(2)}ms`);
      console.log(`🎯 Detected ${features.length} features`);

      return {
        features,
        metadata: {
          processingTime,
          modelVersion: 'weight_88-epoch.onnx',
          confidence: features.length > 0 ? features.reduce((sum, f) => sum + f.confidence, 0) / features.length : 0
        },
        statistics: {
          totalFeatures: features.length,
          featureTypes: features.reduce((acc, feature) => {
            acc[feature.type] = (acc[feature.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      };

    } catch (error) {
      console.error('❌ ONNX inference failed:', error);
      throw new Error(`ONNX AAGNet analysis failed: ${error}`);
    }
  }

  private async preprocessSTL(stlData: ArrayBuffer): Promise<ort.Tensor> {
    // Convert STL to the input format expected by your model
    // This will depend on how your PyTorch model was trained
    
    console.log('🔄 Converting STL to tensor format...');
    
    // Example: Convert to point cloud or voxel grid
    // You'll need to implement this based on your model's input requirements
    const inputSize = 1024; // Adjust based on your model
    const channels = 3; // RGB or XYZ coordinates
    
    // Placeholder preprocessing - replace with your actual preprocessing
    const inputData = new Float32Array(1 * channels * inputSize * inputSize);
    
    // TODO: Implement actual STL parsing and conversion to your model's input format
    // This might involve:
    // 1. Parsing STL triangles
    // 2. Converting to point cloud
    // 3. Normalizing coordinates
    // 4. Creating voxel grid or other representation
    
    // For now, fill with sample data
    for (let i = 0; i < inputData.length; i++) {
      inputData[i] = Math.random() * 2 - 1; // Random values between -1 and 1
    }
    
    return new ort.Tensor('float32', inputData, [1, channels, inputSize, inputSize]);
  }

  private async postprocessResults(results: ort.InferenceSession.ReturnType): Promise<OnnxAAGNetFeature[]> {
    console.log('🔍 Processing ONNX model outputs...');
    
    const features: OnnxAAGNetFeature[] = [];
    
    // Process the output tensors based on your model's output format
    // This will depend on how your PyTorch model outputs predictions
    
    for (const [outputName, tensor] of Object.entries(results)) {
      console.log(`📊 Output ${outputName}:`, tensor.dims, tensor.type);
      
      if (tensor.data && tensor.data.length > 0) {
        // Example output processing - adjust based on your model
        const data = tensor.data as Float32Array;
        
        // Assuming your model outputs feature predictions
        // You'll need to implement this based on your model's output format
        for (let i = 0; i < Math.min(10, data.length / 7); i++) { // Assuming 7 values per feature
          const baseIdx = i * 7;
          const confidence = data[baseIdx];
          
          if (confidence > 0.5) { // Confidence threshold
            const featureType = this.getFeatureType(data[baseIdx + 1]);
            
            features.push({
              type: featureType,
              confidence,
              position: [
                data[baseIdx + 2] * 100, // Scale to reasonable coordinates
                data[baseIdx + 3] * 100,
                data[baseIdx + 4] * 100
              ],
              dimensions: [
                Math.abs(data[baseIdx + 5]) * 10,
                Math.abs(data[baseIdx + 6]) * 10
              ],
              machiningParameters: {
                toolRecommendation: this.getToolRecommendation(featureType),
                feedRate: this.getFeedRate(featureType),
                spindleSpeed: this.getSpindleSpeed(featureType),
                depthOfCut: this.getDepthOfCut(featureType)
              }
            });
          }
        }
      }
    }
    
    console.log(`🎯 Extracted ${features.length} features from ONNX outputs`);
    return features;
  }

  private getFeatureType(typeValue: number): string {
    // Map model output to feature types based on your training labels
    const types = ['Hole', 'Pocket', 'Slot', 'Boss', 'Step', 'Fillet', 'Chamfer'];
    const index = Math.floor(Math.abs(typeValue) * types.length) % types.length;
    return types[index];
  }

  private getToolRecommendation(featureType: string): string {
    const tools = {
      'Hole': 'Drill bit',
      'Pocket': 'End mill',
      'Slot': 'Slot mill',
      'Boss': 'Face mill',
      'Step': 'End mill',
      'Fillet': 'Ball nose mill',
      'Chamfer': 'Chamfer mill'
    };
    return tools[featureType] || 'End mill';
  }

  private getFeedRate(featureType: string): number {
    const feedRates = {
      'Hole': 0.1,
      'Pocket': 0.2,
      'Slot': 0.15,
      'Boss': 0.25,
      'Step': 0.2,
      'Fillet': 0.1,
      'Chamfer': 0.15
    };
    return feedRates[featureType] || 0.2;
  }

  private getSpindleSpeed(featureType: string): number {
    const speeds = {
      'Hole': 1200,
      'Pocket': 800,
      'Slot': 1000,
      'Boss': 600,
      'Step': 800,
      'Fillet': 1500,
      'Chamfer': 1000
    };
    return speeds[featureType] || 800;
  }

  private getDepthOfCut(featureType: string): number {
    const depths = {
      'Hole': 2.0,
      'Pocket': 1.5,
      'Slot': 1.0,
      'Boss': 2.0,
      'Step': 1.5,
      'Fillet': 0.5,
      'Chamfer': 1.0
    };
    return depths[featureType] || 1.5;
  }
}

export const onnxAAGNetService = OnnxAAGNetService.getInstance();