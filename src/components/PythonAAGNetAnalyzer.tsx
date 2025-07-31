import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import FileUpload from "./FileUpload";
import Model3DViewer from "./Model3DViewer";
import { useToast } from "./ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PythonAAGNetFeature {
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
    if (!file.name.toLowerCase().endsWith('.stl')) {
      setError('Please upload an STL file');
      return;
    }

    try {
      setIsAnalyzing(true);
      setError(null);
      setProgress(10);
      setUploadedFile(file);

      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      setProgress(30);

      console.log('🚀 Starting Python AAGNet analysis...');
      console.log('📊 File size:', file.size, 'bytes');

      // Call Python AAGNet inference edge function
      const { data, error: functionError } = await supabase.functions.invoke('python-aagnet-inference', {
        body: {
          stl_data: base64Data,
          file_name: file.name,
          analysis_params: {
            confidence_threshold: 0.3,
            feature_types: ['hole', 'pocket', 'slot', 'boss', 'step', 'fillet', 'chamfer']
          }
        }
      });

      setProgress(80);

      if (functionError) {
        throw new Error(`Python inference failed: ${functionError.message}`);
      }

      if (!data) {
        throw new Error('No data received from Python inference');
      }

      setProgress(90);

      // Process the results
      const result: PythonAAGNetResult = {
        features: data.features || [],
        metadata: {
          processingTime: data.processing_time || 0,
          modelVersion: data.model_version || 'aagnet.pth',
          confidence: data.overall_confidence || 0
        },
        statistics: {
          totalFeatures: data.features?.length || 0,
          featureTypes: data.feature_types || {}
        }
      };

      setAnalysisResult(result);
      setProgress(100);

      console.log('✅ Python AAGNet analysis completed');
      console.log('🎯 Features detected:', result.features.length);

      toast({
        title: "Analysis Complete",
        description: `Detected ${result.features.length} machining features using PyTorch AAGNet model`,
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
      fileName: uploadedFile?.name || 'unknown.stl',
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
        position: feature.position,
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
    const avgConfidence = features.length > 0 
      ? features.reduce((sum, f) => sum + f.confidence, 0) / features.length 
      : 0;

    return {
      totalFeatures: features.length,
      averageConfidence: avgConfidence,
      processingTime: analysisResult.metadata.processingTime,
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
            Advanced machining feature recognition using the native PyTorch AAGNet model.
            This analyzer uses the original .pth model file for maximum accuracy and compatibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FileUpload 
            onFileUploaded={handleFileUpload}
          />

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
                        {((getSummaryStats()?.averageConfidence || 0) * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Confidence</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-primary">
                        {(getSummaryStats()?.processingTime || 0).toFixed(2)}s
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
                              Confidence: {(feature.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <strong>Position:</strong> 
                            ({feature.position[0].toFixed(2)}, {feature.position[1].toFixed(2)}, {feature.position[2].toFixed(2)})
                          </div>
                          <div>
                            <strong>Dimensions:</strong> {feature.dimensions.map(d => d.toFixed(2)).join(' × ')}
                          </div>
                          <div>
                            <strong>Tool:</strong> {feature.machiningParameters.toolRecommendation}
                          </div>
                          <div>
                            <strong>Feed Rate:</strong> {feature.machiningParameters.feedRate} mm/min
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
              
              <TabsContent value="visualization">
                <div className="h-96 flex items-center justify-center border rounded-lg bg-muted/50">
                  <div className="text-center">
                    <p className="text-muted-foreground">3D Visualization</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Upload an STL file and analyze it to see features in 3D
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}