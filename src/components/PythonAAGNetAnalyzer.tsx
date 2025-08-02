import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import FeatureInstance from "./FeatureInstance";
import Model3DViewer from "./Model3DViewer";

interface PythonAAGNetFeature {
  id?: string;
  type: string;
  confidence: number;
  position: [number, number, number];
  dimensions: {
    diameter?: number;
    width: number;
    height: number;
    depth: number;
  };
  normal?: [number, number, number];
  machining_params?: {
    tool_type: string;
    tool_diameter: number;
    speed: number;
    feed_rate: number;
    [key: string]: any;
  };
}

interface PythonAAGNetResult {
  features: PythonAAGNetFeature[];
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

export default function PythonAAGNetAnalyzer() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PythonAAGNetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.step') && !fileName.endsWith('.stp')) {
      setError('Please upload a STEP file (.step or .stp)');
      return;
    }

    try {
      setIsAnalyzing(true);
      setError(null);
      setProgress(10);
      setUploadedFile(file);

      console.log('🚀 Starting Python AAGNet analysis...');
      console.log('📊 File size:', file.size, 'bytes');

      // Check file size limit (50MB)
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('File size exceeds 50MB limit');
      }

      // Convert file to base64 safely for large files
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Use chunks to avoid stack overflow for large files
      let base64Data = '';
      const chunkSize = 8192; // Process in 8KB chunks
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        base64Data += String.fromCharCode.apply(null, Array.from(chunk));
      }
      
      base64Data = btoa(base64Data);
      
      setProgress(30);

      console.log('✅ File converted to base64 successfully');
      console.log('🔄 Calling Python AAGNet inference...');

      // Call Python AAGNet inference edge function with STEP data
      const { data, error: functionError } = await supabase.functions.invoke('python-aagnet-analysis', {
        body: {
          stepData: base64Data,
          analysisParams: {
            confidence_threshold: 0.5,
            model_type: 'full'
          }
        }
      });

      setProgress(80);

      console.log('📋 Edge function response received');

      if (functionError) {
        console.error('❌ Edge function error:', functionError);
        throw new Error(`Python inference failed: ${functionError.message}`);
      }

      if (!data) {
        console.error('❌ No data received from edge function');
        throw new Error('No data received from Python inference');
      }

      console.log('✅ Analysis data received:', data);
      setProgress(90);

      // Process the results
      const result: PythonAAGNetResult = {
        features: data.features || [],
        metadata: {
          processingTime: data.metadata?.processing_time || 0,
          modelVersion: data.metadata?.model_type || 'AAGNet',
          confidence: data.statistics?.average_confidence || 0
        },
        statistics: {
          totalFeatures: data.features?.length || 0,
          featureTypes: data.statistics?.feature_types || {}
        }
      };

      setAnalysisResult(result);
      setProgress(100);

      console.log('✅ Python AAGNet analysis completed');
      console.log('🎯 Features detected:', result.features.length);

      toast({
        title: "AAGNet Analysis Complete",
        description: `Detected ${result.features.length} machining features from STEP file using your trained model`,
      });

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      setError(error instanceof Error ? error.message : 'Analysis failed');
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  };

  const downloadResults = () => {
    if (!analysisResult) return;

    const resultsData = {
      fileName: uploadedFile?.name || 'unknown.step',
      analysisDate: new Date().toISOString(),
      results: analysisResult
    };

    const blob = new Blob([JSON.stringify(resultsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aagnet_analysis_${uploadedFile?.name || 'results'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Convert results for Model3DViewer
  const getVisualizationData = () => {
    if (!analysisResult || !uploadedFile) return null;

    return {
      file: uploadedFile,
      features: analysisResult.features.map((feature, index) => ({
        id: `feature_${index}`,
        type: feature.type,
        position: {
          x: feature.position[0],
          y: feature.position[1], 
          z: feature.position[2]
        },
        dimensions: {
          diameter: feature.dimensions.diameter || 0,
          width: feature.dimensions.width,
          height: feature.dimensions.height,
          depth: feature.dimensions.depth
        },
        visible: true,
        confidence: feature.confidence,
        color: getFeatureColor(feature.type),
        description: `${feature.type} (${(feature.confidence * 100).toFixed(1)}% confidence)`
      }))
    };
  };

  const getFeatureColor = (type: string): string => {
    const colors: Record<string, string> = {
      'hole': '#ff4444',
      'pocket': '#44ff44', 
      'slot': '#4444ff',
      'boss': '#ffff44',
      'step': '#ff44ff',
      'fillet': '#44ffff',
      'chamfer': '#ff8844'
    };
    return colors[type.toLowerCase()] || '#888888';
  };

  const getSummaryStats = () => {
    if (!analysisResult) return null;

    const features = analysisResult.features;
    
    // Ensure confidence values are numbers
    const validConfidences = features
      .map(f => typeof f.confidence === 'number' ? f.confidence : 0)
      .filter(c => !isNaN(c));
    
    const avgConfidence = validConfidences.length > 0 
      ? validConfidences.reduce((sum, c) => sum + c, 0) / validConfidences.length 
      : 0;

    // Ensure processingTime is a number
    const processingTime = typeof analysisResult.metadata.processingTime === 'number' 
      ? analysisResult.metadata.processingTime 
      : 0;

    return {
      totalFeatures: features.length,
      averageConfidence: Number(avgConfidence) || 0,
      processingTime: Number(processingTime) || 0,
      featureBreakdown: analysisResult.statistics.featureTypes
    };
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🐍 Python AAGNet Analyzer
            <Badge variant="secondary">PyTorch</Badge>
          </CardTitle>
          <CardDescription>
            Advanced machining feature recognition using your trained AAGNet model with STEP file support.
            This analyzer uses your exact model architecture and weight_on_MFInstseg.pth for maximum accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".step,.stp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              disabled={isAnalyzing}
              className="hidden"
              id="step-upload"
            />
            <label 
              htmlFor="step-upload" 
              className={`cursor-pointer block ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-gray-500 mb-2">
                <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-lg font-medium">Click to upload STEP file</p>
              <p className="text-sm text-gray-500">Supports .step and .stp files • Maximum: 50MB</p>
            </label>
          </div>

          {isAnalyzing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing with PyTorch AAGNet...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {analysisResult && (
            <Tabs defaultValue="results" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="visualization">3D View</TabsTrigger>
              </TabsList>
              
              <TabsContent value="results" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-primary">
                        {getSummaryStats()?.totalFeatures || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Features Found</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-primary">
                        {(Number(getSummaryStats()?.averageConfidence || 0) * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Confidence</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-primary">
                        {Number(getSummaryStats()?.processingTime || 0).toFixed(2)}s
                      </div>
                      <div className="text-sm text-muted-foreground">Processing Time</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-primary">
                        {analysisResult.metadata.modelVersion}
                      </div>
                      <div className="text-sm text-muted-foreground">Model Version</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex gap-2">
                  <Button onClick={downloadResults} variant="outline">
                    Download Results
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="features" className="space-y-4">
                <div className="grid gap-4">
                  {analysisResult.features.map((feature, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="secondary" 
                              style={{ backgroundColor: getFeatureColor(feature.type) + '20' }}
                            >
                              {feature.type}
                            </Badge>
                            <span className="text-sm font-medium">
                              Confidence: {(Number(feature.confidence || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <strong>Position:</strong> 
                            ({Number(feature.position[0] || 0).toFixed(2)}, {Number(feature.position[1] || 0).toFixed(2)}, {Number(feature.position[2] || 0).toFixed(2)})
                          </div>
                          <div>
                            <strong>Dimensions:</strong> 
                            {feature.dimensions.diameter 
                              ? `Ø${Number(feature.dimensions.diameter || 0).toFixed(2)}mm`
                              : `${Number(feature.dimensions.width || 0).toFixed(2)} × ${Number(feature.dimensions.height || 0).toFixed(2)} × ${Number(feature.dimensions.depth || 0).toFixed(2)}mm`
                            }
                          </div>
                          <div>
                            <strong>Tool:</strong> {feature.machining_params?.tool_type || 'N/A'}
                          </div>
                          <div>
                            <strong>Feed Rate:</strong> {Number(feature.machining_params?.feed_rate || 0).toFixed(1)} mm/min
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="visualization">
                {getVisualizationData() ? (
                  <div className="h-96">
                    <Model3DViewer 
                      features={getVisualizationData()?.features || []}
                      selectedFeatureIds={[]}
                      uploadedFile={uploadedFile}
                      analysisResults={analysisResult}
                    />
                  </div>
                ) : (
                  <div className="h-96 flex items-center justify-center border rounded-lg bg-muted/50">
                    <div className="text-center">
                      <p className="text-muted-foreground">3D Visualization</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Upload a STEP file and analyze it to see detected features in 3D space
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}