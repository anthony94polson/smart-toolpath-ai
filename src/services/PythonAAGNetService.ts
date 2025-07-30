import { supabase } from '@/integrations/supabase/client';

export interface AAGNetAnalysisRequest {
  stlData: ArrayBuffer;
  fileName: string;
  analysisParams?: {
    confidence_threshold?: number;
    feature_types?: string[];
    detail_level?: 'low' | 'medium' | 'high';
  };
}

export interface AAGNetFeature {
  id: string;
  type: 'hole' | 'pocket' | 'slot' | 'boss' | 'step' | 'chamfer' | 'fillet' | 'groove';
  confidence: number;
  position: [number, number, number];
  dimensions: Record<string, number>;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  normal?: [number, number, number];
  geometricAttributes: {
    curvature: number;
    planarity: number;
    cylindricity?: number;
    concentricity?: number;
  };
  machiningParameters: {
    toolRecommendation: string;
    feedRate?: number;
    spindleSpeed?: number;
    depthOfCut?: number;
  };
}

export interface AAGNetAnalysisResult {
  analysisId: string;
  features: AAGNetFeature[];
  metadata: {
    modelVersion: string;
    processingTime: number;
    meshQuality: number;
    geometricComplexity: number;
  };
  statistics: {
    totalFeatures: number;
    featuresByType: Record<string, number>;
    averageConfidence: number;
    processingSteps: string[];
  };
}

/**
 * Service for interacting with Python AAGNet backend
 * Supports both Supabase Edge Functions and direct API calls
 */
export class PythonAAGNetService {
  private static instance: PythonAAGNetService;
  private baseUrl: string;
  private apiKey?: string;

  private constructor() {
    // Use Supabase Edge Functions - they're now properly set up
    this.baseUrl = 'https://hxdtchuvjzafnajbhkok.supabase.co/functions/v1';
    this.apiKey = undefined;
  }

  static getInstance(): PythonAAGNetService {
    if (!this.instance) {
      this.instance = new PythonAAGNetService();
    }
    return this.instance;
  }

  /**
   * Submit STL file for full AAGNet analysis
   */
  async analyzeSTL(request: AAGNetAnalysisRequest): Promise<AAGNetAnalysisResult> {
    console.log('PythonAAGNetService: Starting AAGNet analysis...');
    
    try {
      const result = await this.analyzeWithSupabase(request);
      return result;
    } catch (supabaseError) {
      console.warn('Supabase AAGNet failed:', supabaseError);
      throw new Error(`Python AAGNet analysis failed: ${supabaseError}`);
    }
  }

  /**
   * Analyze using Supabase Edge Function with Python runtime
   */
  private async analyzeWithSupabase(request: AAGNetAnalysisRequest): Promise<AAGNetAnalysisResult> {
    console.log('Using Supabase Edge Function for AAGNet analysis...');
    
    // Convert ArrayBuffer to base64 for JSON transport
    const base64Data = this.arrayBufferToBase64(request.stlData);
    
    const { data, error } = await supabase.functions.invoke('aagnet-analysis', {
      body: {
        stl_data: base64Data,
        file_name: request.fileName,
        analysis_params: request.analysisParams || {}
      }
    });

    if (error) {
      throw new Error(`Supabase function error: ${error.message}`);
    }

    return this.processAAGNetResponse(data);
  }

  /**
   * Analyze using direct Python API
   */
  private async analyzeWithDirectAPI(request: AAGNetAnalysisRequest): Promise<AAGNetAnalysisResult> {
    console.log('Using direct Python API for AAGNet analysis...');
    
    const formData = new FormData();
    formData.append('stl_file', new Blob([request.stlData]), request.fileName);
    formData.append('analysis_params', JSON.stringify(request.analysisParams || {}));

    const response = await fetch(`${this.baseUrl}/analyze`, {
      method: 'POST',
      headers: this.apiKey ? {
        'Authorization': `Bearer ${this.apiKey}`,
        'apikey': this.apiKey
      } : {},
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return this.processAAGNetResponse(data);
  }

  /**
   * Get analysis status for long-running operations
   */
  async getAnalysisStatus(analysisId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message: string;
    result?: AAGNetAnalysisResult;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('aagnet-status', {
        body: { analysis_id: analysisId }
      });

      if (error) throw error;
      return data;
    } catch (supabaseError) {
      // Fallback to direct API
      const response = await fetch(`${this.baseUrl}/status/${analysisId}`, {
        headers: this.apiKey ? {
          'Authorization': `Bearer ${this.apiKey}`,
          'apikey': this.apiKey
        } : {}
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
      }

      return response.json();
    }
  }

  /**
   * List available AAGNet models and their capabilities
   */
  async getAvailableModels(): Promise<{
    models: Array<{
      name: string;
      version: string;
      capabilities: string[];
      performance: {
        accuracy: number;
        speed: string;
        memoryUsage: string;
      };
    }>;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('aagnet-models');
      if (error) throw error;
      return data;
    } catch (supabaseError) {
      const response = await fetch(`${this.baseUrl}/models`);
      if (!response.ok) {
        throw new Error(`Models fetch failed: ${response.statusText}`);
      }
      return response.json();
    }
  }

  /**
   * Process and validate AAGNet response
   */
  private processAAGNetResponse(data: any): AAGNetAnalysisResult {
    if (!data || !data.features) {
      throw new Error('Invalid AAGNet response: missing features');
    }

    // Validate and transform response to our interface
    const result: AAGNetAnalysisResult = {
      analysisId: data.analysis_id || `aagnet_${Date.now()}`,
      features: data.features.map((feature: any) => ({
        id: feature.id,
        type: feature.type,
        confidence: feature.confidence,
        position: feature.position,
        dimensions: feature.dimensions,
        boundingBox: feature.bounding_box,
        normal: feature.normal,
        geometricAttributes: feature.geometric_attributes,
        machiningParameters: feature.machining_parameters || {
          toolRecommendation: this.getToolRecommendation(feature.type, feature.dimensions)
        }
      })),
      metadata: {
        modelVersion: data.metadata?.model_version || 'AAGNet-v1.0',
        processingTime: data.metadata?.processing_time || 0,
        meshQuality: data.metadata?.mesh_quality || 0.8,
        geometricComplexity: data.metadata?.geometric_complexity || 0.5
      },
      statistics: {
        totalFeatures: data.features.length,
        featuresByType: this.groupFeaturesByType(data.features),
        averageConfidence: this.calculateAverageConfidence(data.features),
        processingSteps: data.statistics?.processing_steps || []
      }
    };

    console.log('AAGNet analysis processed:', result);
    return result;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private getToolRecommendation(type: string, dimensions: Record<string, number>): string {
    switch (type) {
      case 'hole':
        const diameter = dimensions.diameter || 5;
        return diameter < 3 ? 'Drill Bit (< 3mm)' : 
               diameter < 10 ? 'Standard Drill (3-10mm)' : 
               'Large Drill (> 10mm)';
      case 'pocket':
        return 'End Mill';
      case 'slot':
        return 'Slot Mill';
      case 'chamfer':
        return 'Chamfer Mill';
      case 'step':
        return 'Face Mill';
      default:
        return 'End Mill';
    }
  }

  private groupFeaturesByType(features: any[]): Record<string, number> {
    return features.reduce((acc, feature) => {
      acc[feature.type] = (acc[feature.type] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateAverageConfidence(features: any[]): number {
    if (features.length === 0) return 0;
    const sum = features.reduce((acc, feature) => acc + feature.confidence, 0);
    return sum / features.length;
  }
}

export const pythonAAGNetService = PythonAAGNetService.getInstance();