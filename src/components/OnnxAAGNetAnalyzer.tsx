import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Brain, Download, Upload, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import FileUpload from './FileUpload';
import Model3DViewer from './Model3DViewer';
import { onnxAAGNetService, type OnnxAAGNetResult } from '../services/OnnxAAGNetService';
import * as THREE from 'three';

export const OnnxAAGNetAnalyzer: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<OnnxAAGNetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);

  React.useEffect(() => {
    // Initialize ONNX model on component mount
    initializeModel();
  }, []);

  const initializeModel = async () => {
    try {
      setModelStatus('loading');
      console.log('🚀 Initializing ONNX AAGNet model...');
      
      await onnxAAGNetService.loadModel();
      setModelStatus('ready');
      console.log('✅ ONNX model ready for inference');
      
    } catch (error) {
      console.error('❌ Failed to initialize ONNX model:', error);
      setModelStatus('error');
      setError(`Failed to load ONNX model: ${error}`);
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      setError('Please upload an STL file');
      return;
    }

    if (modelStatus !== 'ready') {
      setError('ONNX model is not ready. Please wait for initialization to complete.');
      return;
    }

    setUploadedFile(file);
    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setProgress(0);

    try {
      console.log(`🔥 Starting ONNX analysis of: ${file.name}`);
      console.log(`📦 File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // Convert file to ArrayBuffer
      setProgress(20);
      const arrayBuffer = await file.arrayBuffer();
      console.log('📊 STL file loaded into memory');

      // Run ONNX inference
      setProgress(40);
      const result = await onnxAAGNetService.analyzeSTL(arrayBuffer);
      
      clearInterval(progressInterval);
      setProgress(100);

      console.log('🎯 ONNX Analysis completed:', result);
      setAnalysisResult(result);

    } catch (error) {
      console.error('❌ ONNX analysis failed:', error);
      setError(`Analysis failed: ${error}`);
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  }, [modelStatus]);

  const downloadResults = useCallback(() => {
    if (!analysisResult) return;

    const dataStr = JSON.stringify(analysisResult, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `onnx-aagnet-analysis-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [analysisResult]);

  // Convert analysis results to 3D viewer format
  const convertedFeatures = analysisResult?.features.map((feature, index) => ({
    id: `feature-${index}`,
    type: feature.type,
    position: { 
      x: feature.position[0], 
      y: feature.position[1], 
      z: feature.position[2] 
    },
    dimensions: feature.dimensions.reduce((acc, dim, idx) => {
      acc[`dim${idx}`] = dim;
      return acc;
    }, {} as { [key: string]: number }),
    visible: true
  })) || [];

  const analysisResults = analysisResult ? {
    material: 'Aluminum',
    complexity: 'High',
    recommendedTool: analysisResult.features[0]?.machiningParameters.toolRecommendation || 'End mill',
    estimatedTime: `${(analysisResult.metadata.processingTime / 1000).toFixed(1)}s`
  } : undefined;

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-2 border-purple-200 dark:border-purple-800">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <Brain className="h-8 w-8 text-purple-600" />
            <Zap className="h-6 w-6 text-yellow-500" />
          </div>
          <CardTitle className="text-2xl bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            ONNX AAGNet Feature Analyzer
          </CardTitle>
          <CardDescription className="text-lg">
            Real-time STL analysis using your trained PyTorch model (ONNX format)
          </CardDescription>
          
          <div className="flex items-center justify-center space-x-4 mt-4">
            <div className="flex items-center space-x-2">
              {modelStatus === 'loading' && (
                <>
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="text-sm text-yellow-600">Loading Model...</span>
                </>
              )}
              {modelStatus === 'ready' && (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">Model Ready</span>
                </>
              )}
              {modelStatus === 'error' && (
                <>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">Model Error</span>
                </>
              )}
            </div>
            <Badge variant="secondary" className="bg-purple-100 text-purple-800">
              weight_88-epoch.onnx
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <FileUpload
              onFileUploaded={(file, results, features) => handleFileUpload(file)}
            />

            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Running ONNX Inference...</span>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {uploadedFile && !isAnalyzing && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Uploaded: {uploadedFile.name} ({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              </div>
            )}
          </div>

          {analysisResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-white/50 dark:bg-gray-800/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-center">
                      {analysisResult.statistics.totalFeatures}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Total Features</p>
                  </CardContent>
                </Card>

                <Card className="bg-white/50 dark:bg-gray-800/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-center">
                      {typeof analysisResult.metadata.processingTime === 'number' 
                        ? `${analysisResult.metadata.processingTime.toFixed(0)}ms`
                        : analysisResult.metadata.processingTime}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Processing Time</p>
                  </CardContent>
                </Card>

                <Card className="bg-white/50 dark:bg-gray-800/50">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-center">
                      {typeof analysisResult.metadata.confidence === 'number'
                        ? `${(analysisResult.metadata.confidence * 100).toFixed(1)}%`
                        : analysisResult.metadata.confidence}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Avg Confidence</p>
                  </CardContent>
                </Card>

                <Card className="bg-white/50 dark:bg-gray-800/50">
                  <CardContent className="pt-6">
                    <div className="text-sm font-bold text-center">
                      {analysisResult.metadata.modelVersion}
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Model Version</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <Brain className="h-5 w-5 text-purple-600" />
                      <span>Detection Results</span>
                    </CardTitle>
                    <CardDescription>
                      Detected {analysisResult.statistics.totalFeatures} features using ONNX AAGNet with high-confidence geometric analysis
                    </CardDescription>
                  </div>
                  <Button onClick={downloadResults} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(analysisResult.statistics.featureTypes).map(([type, count]) => (
                      <Badge key={type} variant="secondary" className="bg-blue-100 text-blue-800">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>

                  <Tabs defaultValue="features" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="features">Feature List</TabsTrigger>
                      <TabsTrigger value="3d">3D Visualization</TabsTrigger>
                    </TabsList>

                    <TabsContent value="features" className="space-y-4">
                      <div className="space-y-2">
                        {analysisResult.features.map((feature, index) => (
                          <Card key={index} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline">{feature.type}</Badge>
                                  <span className="text-sm font-medium">
                                    Confidence: {typeof feature.confidence === 'number' 
                                      ? `${(feature.confidence * 100).toFixed(1)}%`
                                      : feature.confidence}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Position: ({feature.position.map(p => 
                                    typeof p === 'number' ? p.toFixed(2) : p
                                  ).join(', ')})
                                  {feature.dimensions && feature.dimensions.length > 0 && (
                                    <span className="ml-4">
                                      Dimensions: {feature.dimensions.map(d => 
                                        typeof d === 'number' ? d.toFixed(2) : d
                                      ).join(' × ')}mm
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right text-xs text-muted-foreground">
                                <div>Tool: {feature.machiningParameters.toolRecommendation}</div>
                                <div>Speed: {feature.machiningParameters.spindleSpeed} RPM</div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="3d">
                      <div className="border rounded-lg overflow-hidden">
                        <Model3DViewer
                          features={convertedFeatures}
                          selectedFeatureIds={[]}
                          analysisResults={analysisResults}
                          uploadedFile={uploadedFile}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};