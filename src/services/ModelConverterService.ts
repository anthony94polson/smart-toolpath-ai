import { supabase } from '@/integrations/supabase/client';

export interface ConversionRequest {
  modelName?: string;
  modelPath?: string;
  inputShape?: number[];
  outputFormat?: string;
}

export interface ConversionResult {
  success: boolean;
  message: string;
  modelUrl?: string;
  fileName?: string;
  fileSize?: number;
  inputShape?: number[];
  outputNames?: string[];
  conversionMethod?: string;
  error?: string;
  details?: string;
}

export interface ModelInfo {
  name: string;
  size: number;
  lastModified: string;
  type: 'pytorch' | 'onnx';
}

class ModelConverterService {
  private static instance: ModelConverterService;

  static getInstance(): ModelConverterService {
    if (!ModelConverterService.instance) {
      ModelConverterService.instance = new ModelConverterService();
    }
    return ModelConverterService.instance;
  }

  async convertModel(request: ConversionRequest): Promise<ConversionResult> {
    try {
      console.log('🔄 Starting model conversion:', request);

      const { data, error } = await supabase.functions.invoke('model-converter', {
        body: JSON.stringify(request)
      });

      if (error) {
        console.error('❌ Conversion error:', error);
        throw new Error(`Conversion failed: ${error.message}`);
      }

      console.log('✅ Conversion result:', data);
      return data as ConversionResult;

    } catch (error) {
      console.error('❌ Model conversion service error:', error);
      return {
        success: false,
        message: 'Model conversion failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      };
    }
  }

  async listModels(): Promise<{ success: boolean; models?: ModelInfo[]; error?: string }> {
    try {
      console.log('📂 Listing available models...');

      const { data, error } = await supabase.functions.invoke('model-converter', {
        method: 'GET'
      });

      if (error) {
        console.error('❌ List models error:', error);
        throw new Error(`Failed to list models: ${error.message}`);
      }

      console.log('📋 Available models:', data);
      return data;

    } catch (error) {
      console.error('❌ List models service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async uploadPyTorchModel(file: File): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      console.log(`📤 Uploading PyTorch model: ${file.name}`);

      const { data, error } = await supabase.storage
        .from('models')
        .upload(file.name, file, {
          contentType: 'application/octet-stream',
          upsert: true
        });

      if (error) {
        console.error('❌ Upload error:', error);
        throw error;
      }

      console.log('✅ Model uploaded:', data);
      return {
        success: true,
        path: data.path
      };

    } catch (error) {
      console.error('❌ Upload service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getModelUrl(fileName: string): Promise<string> {
    const { data } = supabase.storage
      .from('models')
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  }

  async downloadModel(fileName: string): Promise<{ success: boolean; data?: ArrayBuffer; error?: string }> {
    try {
      console.log(`📥 Downloading model: ${fileName}`);

      const { data, error } = await supabase.storage
        .from('models')
        .download(fileName);

      if (error) {
        console.error('❌ Download error:', error);
        throw error;
      }

      const arrayBuffer = await data.arrayBuffer();
      console.log(`✅ Model downloaded: ${arrayBuffer.byteLength} bytes`);

      return {
        success: true,
        data: arrayBuffer
      };

    } catch (error) {
      console.error('❌ Download service error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const modelConverterService = ModelConverterService.getInstance();