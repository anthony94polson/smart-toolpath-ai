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
      // First, try the converted model, then fallback to a direct URL
      let modelResponse;
      
      try {
        // Try loading from Supabase storage first
        const modelUrl = 'https://hxdtchuvjzafnajbhkok.supabase.co/storage/v1/object/public/models/aagnet.onnx';
        console.log('🔍 Attempting to load ONNX model from:', modelUrl);
        
        modelResponse = await fetch(modelUrl);
        console.log('📡 Fetch response status:', modelResponse.status, modelResponse.statusText);
        console.log('📡 Response headers:', Object.fromEntries(modelResponse.headers.entries()));
        
      } catch (error) {
        console.log('📦 Model fetch failed:', error);
        console.log('💡 This could mean:');
        console.log('   - Storage bucket is not public');
        console.log('   - File aagnet.onnx does not exist in storage');
        console.log('   - Network connectivity issue');
        // Fallback to a public model or create a demo model
        throw new Error('ONNX model not found. Please check: 1) File "aagnet.onnx" exists in storage, 2) Storage bucket "models" is public, 3) File permissions are correct.');
      }
      
      if (!modelResponse.ok) {
        throw new Error(`Failed to load ONNX model: ${modelResponse.statusText}. Please use the Model Converter to convert your PyTorch model.`);
      }

      const modelArrayBuffer = await modelResponse.arrayBuffer();
      console.log(`📦 Model loaded: ${(modelArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

      // Create ONNX Runtime session with more conservative settings
      this.session = await ort.InferenceSession.create(modelArrayBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'basic', // Changed from 'all' to 'basic'
        enableCpuMemArena: false, // Disable memory arena to avoid cloning issues
        enableMemPattern: false, // Disable memory pattern optimization
        executionMode: 'sequential', // Use sequential execution
      });

      this.modelLoaded = true;
      console.log('✅ ONNX AAGNet model loaded successfully');
      console.log('📊 Model inputs:', this.session.inputNames);
      console.log('📊 Model outputs:', this.session.outputNames);
      
      // STEP 1: Inspect model input specifications
      await this.inspectModelInputs();

    } catch (error) {
      console.error('❌ Failed to load ONNX model:', error);
      throw new Error(`Failed to initialize ONNX AAGNet model: ${error}`);
    }
  }

  // STEP 1: Model input inspection method
  private async inspectModelInputs(): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    console.log('🔍 Inspecting ONNX model input specifications...');
    
    try {
      // Get input metadata
      for (const inputName of this.session.inputNames) {
        const input = this.session.inputMetadata[inputName];
        console.log(`📋 Input '${inputName}':`, {
          type: input.type,
          dims: input.dims,
        });
      }

      // Get output metadata
      for (const outputName of this.session.outputNames) {
        const output = this.session.outputMetadata[outputName];
        console.log(`📤 Output '${outputName}':`, {
          type: output.type,
          dims: output.dims,
        });
      }
    } catch (error) {
      console.warn('⚠️ Could not inspect model metadata:', error);
    }
  }

  async analyzeSTL(stlData: ArrayBuffer): Promise<OnnxAAGNetResult> {
    const startTime = performance.now();

    try {
      console.log('🔍 Starting ONNX AAGNet analysis...');
      console.log('📊 Input STL size:', stlData.byteLength, 'bytes');
      
      // Ensure model is loaded
      console.log('⏳ Checking model status...');
      await this.loadModel();

      if (!this.session) {
        throw new Error('ONNX model not loaded');
      }

      console.log('✅ Model is ready, preprocessing STL...');
      
      // Convert STL to graph representation for AAGNet
      const graphInputs = await this.preprocessSTLForAAGNet(stlData);
      
      console.log('✅ Preprocessing complete, running inference...');
      console.log('📊 Input tensor shapes:');
      console.log('  - node_x:', graphInputs.node_x.dims);
      console.log('  - node_uv:', graphInputs.node_uv.dims);
      console.log('  - face_attr:', graphInputs.face_attr.dims);
      console.log('  - edge_x:', graphInputs.edge_x.dims);
      console.log('  - src:', graphInputs.src.dims);
      console.log('  - dst:', graphInputs.dst.dims);
      
      // STEP 3: Validate input tensors before inference
      this.validateModelInputs(graphInputs);
      
      // Run inference with all 6 inputs: node_x, node_uv, face_attr, edge_x, src, dst
      const feeds = {
        'node_x': graphInputs.node_x,
        'node_uv': graphInputs.node_uv,
        'face_attr': graphInputs.face_attr,
        'edge_x': graphInputs.edge_x,
        'src': graphInputs.src,
        'dst': graphInputs.dst
      };
      
      console.log('🚀 Running ONNX inference...');
      
      const results = await this.runInferenceWithValidation(feeds);

      // Process outputs
      const features = await this.postprocessResults(results);
      
      const processingTime = performance.now() - startTime;
      
      console.log(`✅ ONNX inference completed in ${processingTime.toFixed(2)}ms`);
      console.log(`🎯 Detected ${features.length} features`);

      return {
        features,
        metadata: {
          processingTime,
          modelVersion: 'aagnet.onnx',
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
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw new Error(`ONNX AAGNet analysis failed: ${error}`);
    }
  }

  private async preprocessSTLForAAGNet(stlData: ArrayBuffer): Promise<{
    node_x: ort.Tensor;
    node_uv: ort.Tensor;
    face_attr: ort.Tensor;
    edge_x: ort.Tensor;
    src: ort.Tensor;
    dst: ort.Tensor;
  }> {
    console.log('🔄 Converting STL to AAGNet graph format...');
    
    // Parse STL file to extract triangular mesh
    const mesh = this.parseSTL(stlData);
    const numNodes = mesh.vertices.length;
    const numEdges = mesh.edges.length;
    
    console.log(`📊 Mesh: ${numNodes} nodes, ${numEdges} edges`);
    
    // Create node features (node_attr_dim = 10)
    const nodeFeatures = new Float32Array(numNodes * 10);
    for (let i = 0; i < numNodes; i++) {
      const vertex = mesh.vertices[i];
      const baseIdx = i * 10;
      // Position features
      nodeFeatures[baseIdx] = vertex.x;
      nodeFeatures[baseIdx + 1] = vertex.y;
      nodeFeatures[baseIdx + 2] = vertex.z;
      // Normal features
      nodeFeatures[baseIdx + 3] = vertex.nx || 0;
      nodeFeatures[baseIdx + 4] = vertex.ny || 0;
      nodeFeatures[baseIdx + 5] = vertex.nz || 0;
      // Additional geometric features
      nodeFeatures[baseIdx + 6] = vertex.curvature || 0;
      nodeFeatures[baseIdx + 7] = vertex.area || 0;
      nodeFeatures[baseIdx + 8] = vertex.dihedral || 0;
      nodeFeatures[baseIdx + 9] = vertex.planarity || 0;
    }
    
    // Create UV coordinates (node_grid_dim = 7, shape: [N, 7, 1, 1])
    const uvData = new Float32Array(numNodes * 7 * 1 * 1);
    for (let i = 0; i < numNodes; i++) {
      const vertex = mesh.vertices[i];
      const baseIdx = i * 7;
      uvData[baseIdx] = vertex.u || 0;
      uvData[baseIdx + 1] = vertex.v || 0;
      uvData[baseIdx + 2] = vertex.x / 100; // Normalized position
      uvData[baseIdx + 3] = vertex.y / 100;
      uvData[baseIdx + 4] = vertex.z / 100;
      uvData[baseIdx + 5] = vertex.area || 0;
      uvData[baseIdx + 6] = vertex.boundary || 0;
    }
    
    // STEP 2: Fix face_attr tensor generation
    // Calculate actual number of faces from triangular mesh
    const numTriangles = Math.floor(numNodes / 3);
    console.log(`🔺 Calculated triangles: ${numTriangles} from ${numNodes} vertices`);
    
    // Create face attributes for actual triangular faces
    const faceAttr = new Float32Array(numTriangles * 3); // 3 features per face
    for (let i = 0; i < numTriangles; i++) {
      const faceBaseIdx = i * 3;
      // Calculate face normal and area from triangle vertices
      const v1Idx = i * 3;
      const v2Idx = i * 3 + 1;
      const v3Idx = i * 3 + 2;
      
      if (v1Idx < numNodes && v2Idx < numNodes && v3Idx < numNodes) {
        const v1 = mesh.vertices[v1Idx];
        const v2 = mesh.vertices[v2Idx];
        const v3 = mesh.vertices[v3Idx];
        
        // Calculate face area using cross product
        const edge1 = [v2.x - v1.x, v2.y - v1.y, v2.z - v1.z];
        const edge2 = [v3.x - v1.x, v3.y - v1.y, v3.z - v1.z];
        const crossProduct = [
          edge1[1] * edge2[2] - edge1[2] * edge2[1],
          edge1[2] * edge2[0] - edge1[0] * edge2[2],
          edge1[0] * edge2[1] - edge1[1] * edge2[0]
        ];
        const area = 0.5 * Math.sqrt(crossProduct[0] ** 2 + crossProduct[1] ** 2 + crossProduct[2] ** 2);
        
        faceAttr[faceBaseIdx] = area; // Face area
        faceAttr[faceBaseIdx + 1] = Math.sqrt(crossProduct[0] ** 2 + crossProduct[1] ** 2 + crossProduct[2] ** 2); // Normal magnitude
        faceAttr[faceBaseIdx + 2] = 0; // Face type (could be convex/concave classification)
      } else {
        faceAttr[faceBaseIdx] = 0;
        faceAttr[faceBaseIdx + 1] = 0;
        faceAttr[faceBaseIdx + 2] = 0;
      }
    }
    
    // Create edge features (edge_attr_dim = 12)
    const edgeFeatures = new Float32Array(numEdges * 12);
    const srcIndices = new Int32Array(numEdges); // Changed from BigInt64Array
    const dstIndices = new Int32Array(numEdges); // Changed from BigInt64Array
    
    for (let i = 0; i < numEdges; i++) {
      const edge = mesh.edges[i];
      const baseIdx = i * 12;
      
      srcIndices[i] = edge.src; // Remove BigInt conversion
      dstIndices[i] = edge.dst; // Remove BigInt conversion
      
      // Edge geometric features
      edgeFeatures[baseIdx] = edge.length || 0;
      edgeFeatures[baseIdx + 1] = edge.angle || 0;
      edgeFeatures[baseIdx + 2] = edge.convexity || 0;
      edgeFeatures[baseIdx + 3] = edge.sharpness || 0;
      edgeFeatures[baseIdx + 4] = edge.curvature || 0;
      edgeFeatures[baseIdx + 5] = edge.boundary || 0;
      edgeFeatures[baseIdx + 6] = edge.manifold || 0;
      edgeFeatures[baseIdx + 7] = edge.planarity || 0;
      edgeFeatures[baseIdx + 8] = edge.regularity || 0;
      edgeFeatures[baseIdx + 9] = edge.smoothness || 0;
      edgeFeatures[baseIdx + 10] = edge.feature || 0;
      edgeFeatures[baseIdx + 11] = edge.type || 0;
    }
    
    try {
      console.log(`📊 Creating tensors - nodes: ${numNodes}, triangles: ${numTriangles}, edges: ${numEdges}`);
      
      // Create tensors with corrected dimensions
      const tensors = {
        node_x: new ort.Tensor('float32', nodeFeatures, [numNodes, 10]),
        node_uv: new ort.Tensor('float32', uvData, [numNodes, 7, 1, 1]),
        face_attr: new ort.Tensor('float32', faceAttr, [numTriangles, 3]), // Fixed: 3 features per face
        edge_x: new ort.Tensor('float32', edgeFeatures, [numEdges, 12]),
        src: new ort.Tensor('int32', srcIndices, [numEdges]),
        dst: new ort.Tensor('int32', dstIndices, [numEdges])
      };
      
      console.log('✅ Tensors created successfully with shapes:');
      Object.entries(tensors).forEach(([name, tensor]) => {
        console.log(`  ${name}: [${tensor.dims.join(', ')}]`);
      });
      
      return tensors;
    } catch (error) {
      console.error('❌ Failed to create input tensors:', error);
      throw new Error(`Tensor creation failed: ${error}`);
    }
  }
  
  private parseSTL(stlData: ArrayBuffer): { vertices: any[]; edges: any[] } {
    // Basic STL parsing - this is a simplified version
    // In practice, you'd need proper mesh processing to extract features
    const dataView = new DataView(stlData);
    const isASCII = this.isASCIISTL(stlData);
    
    const vertices: any[] = [];
    const edges: any[] = [];
    
    if (isASCII) {
      // Parse ASCII STL (simplified)
      const text = new TextDecoder().decode(stlData);
      const lines = text.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('vertex')) {
          const coords = line.split(/\s+/).slice(1);
          vertices.push({
            x: parseFloat(coords[0]) || 0,
            y: parseFloat(coords[1]) || 0,
            z: parseFloat(coords[2]) || 0,
            nx: 0, ny: 0, nz: 1, // Default normal
            curvature: 0, area: 1, dihedral: 0, planarity: 1,
            u: 0, v: 0, boundary: 0, faceType: 0
          });
        }
      }
    } else {
      // Parse binary STL
      const numTriangles = dataView.getUint32(80, true);
      let offset = 84;
      
      for (let i = 0; i < numTriangles; i++) {
        // Normal vector
        const nx = dataView.getFloat32(offset, true); offset += 4;
        const ny = dataView.getFloat32(offset, true); offset += 4;
        const nz = dataView.getFloat32(offset, true); offset += 4;
        
        // Three vertices
        for (let j = 0; j < 3; j++) {
          const x = dataView.getFloat32(offset, true); offset += 4;
          const y = dataView.getFloat32(offset, true); offset += 4;
          const z = dataView.getFloat32(offset, true); offset += 4;
          
          vertices.push({
            x, y, z, nx, ny, nz,
            curvature: 0, area: 1, dihedral: 0, planarity: 1,
            u: 0, v: 0, boundary: 0, faceType: 0
          });
        }
        offset += 2; // Skip attribute byte count
      }
    }
    
    // Create edges from triangular connectivity
    for (let i = 0; i < vertices.length; i += 3) {
      // Triangle edges
      if (i + 2 < vertices.length) {
        edges.push({ src: i, dst: i + 1, length: 1, angle: 0, convexity: 0, sharpness: 0, curvature: 0, boundary: 0, manifold: 1, planarity: 1, regularity: 1, smoothness: 1, feature: 0, type: 0 });
        edges.push({ src: i + 1, dst: i + 2, length: 1, angle: 0, convexity: 0, sharpness: 0, curvature: 0, boundary: 0, manifold: 1, planarity: 1, regularity: 1, smoothness: 1, feature: 0, type: 0 });
        edges.push({ src: i + 2, dst: i, length: 1, angle: 0, convexity: 0, sharpness: 0, curvature: 0, boundary: 0, manifold: 1, planarity: 1, regularity: 1, smoothness: 1, feature: 0, type: 0 });
      }
    }
    
    return { vertices, edges };
  }
  
  private isASCIISTL(stlData: ArrayBuffer): boolean {
    const header = new Uint8Array(stlData, 0, 80);
    const headerText = new TextDecoder().decode(header).toLowerCase();
    return headerText.includes('solid');
  }

  // STEP 3: Input validation method
  private validateModelInputs(inputs: any): void {
    console.log('🔍 Validating input tensors...');
    
    if (!this.session) {
      throw new Error('Session not initialized for validation');
    }

    const requiredInputs = this.session.inputNames;
    const providedInputs = Object.keys(inputs);

    console.log('📋 Required inputs:', requiredInputs);
    console.log('📋 Provided inputs:', providedInputs);

    // Check if all required inputs are provided
    for (const inputName of requiredInputs) {
      if (!providedInputs.includes(inputName)) {
        throw new Error(`Missing required input: ${inputName}`);
      }
    }

    // Validate each input tensor
    for (const inputName of requiredInputs) {
      const tensor = inputs[inputName];
      const expectedMetadata = this.session.inputMetadata[inputName];
      
      console.log(`🔍 Validating ${inputName}:`);
      console.log(`  Expected: type=${expectedMetadata?.type}, dims=${expectedMetadata?.dims}`);
      console.log(`  Actual: type=${tensor.type}, dims=[${tensor.dims.join(', ')}]`);

      // Validate data types
      if (expectedMetadata?.type && tensor.type !== expectedMetadata.type) {
        console.warn(`⚠️ Type mismatch for ${inputName}: expected ${expectedMetadata.type}, got ${tensor.type}`);
      }

      // Validate non-empty tensors
      if (!tensor.data || tensor.data.length === 0) {
        throw new Error(`Input ${inputName} has empty data`);
      }

      // Check for NaN or infinite values
      const data = Array.from(tensor.data as ArrayLike<number>);
      const hasNaN = data.some(val => isNaN(val as number));
      const hasInfinite = data.some(val => !isFinite(val as number));
      
      if (hasNaN) {
        throw new Error(`Input ${inputName} contains NaN values`);
      }
      if (hasInfinite) {
        throw new Error(`Input ${inputName} contains infinite values`);
      }
    }

    console.log('✅ Input validation passed');
  }

  // STEP 4: Enhanced inference with validation
  private async runInferenceWithValidation(feeds: any): Promise<ort.InferenceSession.ReturnType> {
    console.log('🚀 Running ONNX inference with validation...');
    
    try {
      const results = await this.session!.run(feeds);
      console.log('📊 Raw ONNX outputs:', Object.keys(results));
      return results;
    } catch (inferenceError) {
      console.error('❌ ONNX inference failed with detailed error:', {
        name: inferenceError.name,
        message: inferenceError.message,
        stack: inferenceError.stack
      });
      
      console.error('🔍 Input tensor analysis:');
      Object.entries(feeds).forEach(([name, tensor]: [string, any]) => {
        console.error(`  ${name}:`, {
          dims: tensor.dims,
          type: tensor.type,
          dataLength: tensor.data.length,
          dataType: typeof tensor.data,
          firstFewValues: Array.from(tensor.data.slice(0, 5))
        });
      });
      
      // Check if this is a shape mismatch error
      if (inferenceError.message.includes('invalid input') || inferenceError.message.includes('shape')) {
        throw new Error(`Model input validation failed: ${inferenceError.message}. The ONNX model expects different input shapes than provided. Please check the model's input specifications.`);
      }
      
      throw new Error(`ONNX inference failed: ${inferenceError.message}`);
    }
  }

  private async postprocessResults(results: ort.InferenceSession.ReturnType): Promise<OnnxAAGNetFeature[]> {
    console.log('🔍 Processing AAGNet segmentation outputs...');
    
    const features: OnnxAAGNetFeature[] = [];
    
    // Process segmentation output (shape: [N, 25] for 25 classes)
    for (const [outputName, tensor] of Object.entries(results)) {
      console.log(`📊 Output ${outputName}:`, tensor.dims, tensor.type);
      
      if (outputName === 'segmentation' && tensor.data && tensor.data.length > 0) {
        const data = tensor.data as Float32Array;
        const [numNodes, numClasses] = tensor.dims as [number, number];
        
        console.log(`🎯 Processing segmentation: ${numNodes} nodes, ${numClasses} classes`);
        
        // Group nodes by predicted class
        const classGroups: { [key: number]: number[] } = {};
        
        for (let nodeIdx = 0; nodeIdx < numNodes; nodeIdx++) {
          // Find the class with highest probability for this node
          let maxProb = -Infinity;
          let predictedClass = 0;
          
          for (let classIdx = 0; classIdx < numClasses; classIdx++) {
            const prob = data[nodeIdx * numClasses + classIdx];
            if (prob > maxProb) {
              maxProb = prob;
              predictedClass = classIdx;
            }
          }
          
          // Only consider nodes with high confidence
          if (maxProb > 0.3) { // Adjust threshold as needed
            if (!classGroups[predictedClass]) {
              classGroups[predictedClass] = [];
            }
            classGroups[predictedClass].push(nodeIdx);
          }
        }
        
        // Convert class groups to features
        for (const [classId, nodeIndices] of Object.entries(classGroups)) {
          const classIdx = parseInt(classId);
          if (nodeIndices.length > 5) { // Minimum cluster size for a feature
            const featureType = this.getFeatureTypeFromClass(classIdx);
            
            // Calculate average position and confidence for this feature
            let avgX = 0, avgY = 0, avgZ = 0, avgConf = 0;
            for (const nodeIdx of nodeIndices) {
              // Get confidence for this node's predicted class
              const confidence = data[nodeIdx * numClasses + classIdx];
              avgConf += confidence;
              
              // For position, we'd need the original vertex coordinates
              // This is simplified - in practice you'd track vertex positions
              avgX += nodeIdx * 0.1; // Placeholder
              avgY += nodeIdx * 0.1;
              avgZ += nodeIdx * 0.1;
            }
            
            avgX /= nodeIndices.length;
            avgY /= nodeIndices.length;
            avgZ /= nodeIndices.length;
            avgConf /= nodeIndices.length;
            
            features.push({
              type: featureType,
              confidence: Math.min(avgConf, 1.0),
              position: [avgX * 100, avgY * 100, avgZ * 100],
              dimensions: [
                Math.sqrt(nodeIndices.length) * 2, // Approximate size
                Math.sqrt(nodeIndices.length) * 2
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
    
    console.log(`🎯 Extracted ${features.length} features from segmentation`);
    return features;
  }

  private getFeatureTypeFromClass(classIdx: number): string {
    // Map AAGNet class indices to feature types (you'll need to update this based on your actual class labels)
    const classToFeature: { [key: number]: string } = {
      0: 'Background',
      1: 'Hole', 2: 'Hole_Blind', 3: 'Hole_Through',
      4: 'Pocket', 5: 'Pocket_Rectangular', 6: 'Pocket_Circular',
      7: 'Slot', 8: 'Slot_Through', 9: 'Slot_Blind',
      10: 'Boss', 11: 'Boss_Cylindrical', 12: 'Boss_Rectangular',
      13: 'Step', 14: 'Step_Up', 15: 'Step_Down',
      16: 'Fillet', 17: 'Fillet_Round', 18: 'Fillet_Chamfer',
      19: 'Chamfer', 20: 'Chamfer_Edge', 21: 'Chamfer_Corner',
      22: 'Thread', 23: 'Surface', 24: 'Edge'
    };
    return classToFeature[classIdx] || 'Unknown';
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