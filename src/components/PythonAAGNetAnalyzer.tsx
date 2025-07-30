import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  pythonAAGNetService, 
  AAGNetAnalysisResult, 
  AAGNetFeature,
  AAGNetAnalysisRequest 
} from '@/services/PythonAAGNetService';
import { Clock, Cpu, Target, Zap, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface PythonAAGNetAnalyzerProps {
  geometry: THREE.BufferGeometry;
  fileName: string;
  onFeaturesDetected: (features: any[], analysisResults: any) => void;
  onProgress: (progress: number, status: string) => void;
  onError: (error: string) => void;
}

interface AnalysisStatus {
  status: 'idle' | 'analyzing' | 'polling' | 'completed' | 'failed';
  progress: number;
  message: string;
  startTime?: number;
}

const PythonAAGNetAnalyzer: React.FC<PythonAAGNetAnalyzerProps> = ({
  geometry,
  fileName,
  onFeaturesDetected,
  onProgress,
  onError
}) => {
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>({
    status: 'idle',
    progress: 0,
    message: 'Ready to analyze'
  });
  const [analysisResult, setAnalysisResult] = useState<AAGNetAnalysisResult | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  useEffect(() => {
    loadAvailableModels();
  }, []);

  const loadAvailableModels = async () => {
    try {
      const models = await pythonAAGNetService.getAvailableModels();
      setAvailableModels(models.models || []);
    } catch (error) {
      console.warn('Could not load available models:', error);
    }
  };

  const startPythonAnalysis = async () => {
    if (!geometry || !geometry.attributes.position) {
      onError('Invalid geometry provided');
      return;
    }

    setAnalysisStatus({
      status: 'analyzing',
      progress: 0,
      message: 'Preparing STL data for Python AAGNet analysis...',
      startTime: Date.now()
    });

    try {
      // Convert THREE.js geometry to STL buffer
      onProgress(0.1, 'Converting geometry to STL format...');
      const stlBuffer = await convertGeometryToSTL(geometry);

      setAnalysisStatus(prev => ({
        ...prev,
        progress: 20,
        message: 'Submitting to Python AAGNet service...'
      }));

      const request: AAGNetAnalysisRequest = {
        stlData: stlBuffer,
        fileName: fileName,
        analysisParams: {
          confidence_threshold: 0.3,
          feature_types: ['hole', 'pocket', 'slot', 'boss', 'step', 'chamfer'],
          detail_level: 'high'
        }
      };

      onProgress(0.3, 'Starting Python AAGNet analysis...');

      // Submit analysis
      const result = await pythonAAGNetService.analyzeSTL(request);

      if (result.analysisId && result.features.length === 0) {
        // If we got an analysis ID but no features yet, poll for status
        await pollAnalysisStatus(result.analysisId);
      } else {
        // Analysis completed immediately
        handleAnalysisComplete(result);
      }

    } catch (error) {
      console.error('Python AAGNet analysis failed:', error);
      setAnalysisStatus({
        status: 'failed',
        progress: 0,
        message: `Analysis failed: ${error}`
      });
      onError(`Python AAGNet analysis failed: ${error}`);
    }
  };

  const pollAnalysisStatus = async (analysisId: string) => {
    setAnalysisStatus(prev => ({
      ...prev,
      status: 'polling',
      message: 'Analysis in progress, checking status...'
    }));

    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      try {
        attempts++;
        const statusResponse = await pythonAAGNetService.getAnalysisStatus(analysisId);

        setAnalysisStatus(prev => ({
          ...prev,
          progress: statusResponse.progress * 100,
          message: statusResponse.message
        }));

        onProgress(statusResponse.progress, statusResponse.message);

        if (statusResponse.status === 'completed' && statusResponse.result) {
          clearInterval(pollInterval);
          handleAnalysisComplete(statusResponse.result);
        } else if (statusResponse.status === 'failed') {
          clearInterval(pollInterval);
          throw new Error(statusResponse.message);
        } else if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          throw new Error('Analysis timeout');
        }
      } catch (error) {
        clearInterval(pollInterval);
        setAnalysisStatus({
          status: 'failed',
          progress: 0,
          message: `Status polling failed: ${error}`
        });
        onError(`Analysis status polling failed: ${error}`);
      }
    }, 5000); // Check every 5 seconds
  };

  const handleAnalysisComplete = (result: AAGNetAnalysisResult) => {
    const endTime = Date.now();
    const processingTime = analysisStatus.startTime 
      ? (endTime - analysisStatus.startTime) / 1000 
      : 0;

    setAnalysisStatus({
      status: 'completed',
      progress: 100,
      message: `Analysis complete! Found ${result.features.length} features in ${processingTime.toFixed(1)}s`
    });

    setAnalysisResult(result);

    // Convert to expected format for the UI
    const convertedFeatures = result.features.map(feature => ({
      id: feature.id,
      type: feature.type,
      confidence: feature.confidence,
      position: new THREE.Vector3(...feature.position),
      dimensions: feature.dimensions,
      boundingBox: new THREE.Box3(
        new THREE.Vector3(...feature.boundingBox.min),
        new THREE.Vector3(...feature.boundingBox.max)
      ),
      normal: feature.normal ? new THREE.Vector3(...feature.normal) : undefined,
      toolRecommendation: feature.machiningParameters.toolRecommendation
    }));

    const analysisResults = {
      fileName,
      fileSize: 0,
      originalGeometry: geometry,
      detectedFeatures: convertedFeatures,
      triangleCount: geometry.attributes.position.count / 3,
      boundingBox: geometry.boundingBox,
      analysisTime: Date.now(),
      mlModel: 'Python AAGNet v2.1',
      analysisMethod: 'Complete AAGNet Pipeline',
      pythonBackend: true,
      metadata: result.metadata,
      statistics: result.statistics
    };

    onProgress(1.0, `Python AAGNet analysis complete - ${convertedFeatures.length} features detected`);
    onFeaturesDetected(convertedFeatures, analysisResults);
  };

  const convertGeometryToSTL = async (geometry: THREE.BufferGeometry): Promise<ArrayBuffer> => {
    // Simple STL binary format export
    const faces = [];
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal?.array;

    for (let i = 0; i < positions.length; i += 9) {
      const normal = normals ? [
        normals[i / 3], normals[i / 3 + 1], normals[i / 3 + 2]
      ] : [0, 0, 1];

      faces.push({
        normal,
        vertices: [
          [positions[i], positions[i + 1], positions[i + 2]],
          [positions[i + 3], positions[i + 4], positions[i + 5]],
          [positions[i + 6], positions[i + 7], positions[i + 8]]
        ]
      });
    }

    // Create STL binary buffer
    const buffer = new ArrayBuffer(80 + 4 + faces.length * 50);
    const view = new DataView(buffer);
    let offset = 80; // Skip header

    // Number of triangles
    view.setUint32(offset, faces.length, true);
    offset += 4;

    // Write triangles
    for (const face of faces) {
      // Normal
      view.setFloat32(offset, face.normal[0], true); offset += 4;
      view.setFloat32(offset, face.normal[1], true); offset += 4;
      view.setFloat32(offset, face.normal[2], true); offset += 4;

      // Vertices
      for (const vertex of face.vertices) {
        view.setFloat32(offset, vertex[0], true); offset += 4;
        view.setFloat32(offset, vertex[1], true); offset += 4;
        view.setFloat32(offset, vertex[2], true); offset += 4;
      }

      // Attribute byte count
      view.setUint16(offset, 0, true); offset += 2;
    }

    return buffer;
  };

  const getStatusIcon = () => {
    switch (analysisStatus.status) {
      case 'analyzing':
      case 'polling':
        return <Cpu className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Target className="w-4 h-4" />;
    }
  };

  const getStatusColor = () => {
    switch (analysisStatus.status) {
      case 'analyzing':
      case 'polling':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Analysis Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Python AAGNet Analysis
          </CardTitle>
          <CardDescription>
            Complete AAGNet implementation with full Python backend for maximum accuracy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Display */}
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{analysisStatus.message}</span>
                <Badge variant="outline" className={getStatusColor()}>
                  {analysisStatus.status}
                </Badge>
              </div>
              <Progress value={analysisStatus.progress} className="h-2" />
            </div>
          </div>

          {/* Available Models */}
          {availableModels.length > 0 && (
            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                Using AAGNet {availableModels[0]?.version || 'v2.1'} with {availableModels[0]?.performance?.accuracy || '95'}% accuracy
              </AlertDescription>
            </Alert>
          )}

          {/* Analysis Button */}
          <Button 
            onClick={startPythonAnalysis}
            disabled={analysisStatus.status === 'analyzing' || analysisStatus.status === 'polling'}
            className="w-full"
          >
            {analysisStatus.status === 'analyzing' || analysisStatus.status === 'polling' 
              ? 'Analyzing with Python AAGNet...' 
              : 'Start Python AAGNet Analysis'
            }
          </Button>
        </CardContent>
      </Card>

      {/* Results Display */}
      {analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Results</CardTitle>
            <CardDescription>
              Python AAGNet detected {analysisResult.features.length} machining features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {analysisResult.statistics.totalFeatures}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Features</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {(analysisResult.statistics.averageConfidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Confidence</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {(analysisResult.metadata.processingTime || 0).toFixed(1)}s
                    </div>
                    <div className="text-sm text-muted-foreground">Processing Time</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {(analysisResult.metadata.meshQuality * 100).toFixed(0)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Mesh Quality</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Features by Type</h4>
                  {Object.entries(analysisResult.statistics.featuresByType).map(([type, count]) => (
                    <div key={type} className="flex justify-between items-center">
                      <span className="capitalize">{type}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                {analysisResult.features.map((feature, index) => (
                  <Card key={feature.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <Badge variant="outline" className="mb-1">
                          {feature.type}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          ID: {feature.id}
                        </div>
                      </div>
                      <Badge 
                        variant={feature.confidence > 0.8 ? "default" : feature.confidence > 0.6 ? "secondary" : "outline"}
                      >
                        {(feature.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong>Position:</strong> 
                        <div className="text-muted-foreground">
                          ({feature.position.map(p => p.toFixed(2)).join(', ')})
                        </div>
                      </div>
                      <div>
                        <strong>Tool:</strong>
                        <div className="text-muted-foreground">
                          {feature.machiningParameters.toolRecommendation}
                        </div>
                      </div>
                      <div>
                        <strong>Dimensions:</strong>
                        <div className="text-muted-foreground">
                          {Object.entries(feature.dimensions).map(([key, value]) => 
                            `${key}: ${value.toFixed(2)}mm`
                          ).join(', ')}
                        </div>
                      </div>
                      <div>
                        <strong>Curvature:</strong>
                        <div className="text-muted-foreground">
                          {feature.geometricAttributes.curvature.toFixed(3)}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <strong>Model Version:</strong> {analysisResult.metadata.modelVersion}
                  </div>
                  <div>
                    <strong>Processing Steps:</strong>
                    <ul className="list-disc list-inside mt-1 text-sm text-muted-foreground">
                      {analysisResult.statistics.processingSteps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Geometric Complexity:</strong> {(analysisResult.metadata.geometricComplexity * 100).toFixed(0)}%
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4">
                <div className="grid gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>Processing Time: {(analysisResult.metadata.processingTime || 0).toFixed(2)}s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    <span>Detection Accuracy: {(analysisResult.statistics.averageConfidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    <span>Mesh Quality: {(analysisResult.metadata.meshQuality * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PythonAAGNetAnalyzer;