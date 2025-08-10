import React, { useState } from 'react';
import * as THREE from 'three';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Upload, Download, FileText, Eye, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from './ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Model3DViewer from './Model3DViewer';

// Interface for individual machining features detected by AAGNet
interface PythonAAGNetFeature {
  id: string;
  type: string;
  confidence: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  dimensions: Record<string, any>;
  machining_parameters: {
    tool_type: string;
    tool_diameter: number;
    spindle_speed: number;
    feed_rate: number;
    cutting_depth: number;
  };
  face_ids: number[];
  bounding_box: {
    min: number[];
    max: number[];
  };
}

// Interface for the complete AAGNet analysis results
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

const PythonAAGNetAnalyzer: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PythonAAGNetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);
  const [viewerGeometry, setViewerGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [viewerFaces, setViewerFaces] = useState<any[] | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setAnalysisResult(null);
      setError(null);
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      setError('Please select a STEP file first');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress(0);

    try {
      console.log('🚀 Starting Python AAGNet analysis for:', file.name);
      
      // Check file size limit (50MB)
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('File size exceeds 50MB limit');
      }

      console.log('🔄 Converting file...');
      
      // Convert file to text for transmission
      const arrayBuffer = await file.arrayBuffer();
      const stepContent = new TextDecoder().decode(arrayBuffer);
      
      setProgress(30);

      console.log('✅ File converted successfully');
      console.log('🔄 Parsing STEP geometry...');

      // Step 1: Parse STEP geometry on server to get real 3D data
      const { data: geometryData, error: geoError } = await supabase.functions.invoke('step-geometry-parser', {
        body: {
          stepData: stepContent,
          filename: file.name
        }
      });
      
      if (geoError) {
        console.error('❌ Geometry parsing error:', geoError);
        throw new Error(`Geometry parsing failed: ${geoError.message}`);
      }
      
      setProgress(60);
      console.log('✅ STEP geometry parsed successfully');

      // Build Three.js geometry for viewer
      try {
        const geom = new THREE.BufferGeometry();
        if (geometryData?.vertices) {
          geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(geometryData.vertices), 3));
        }
        if (geometryData?.indices) {
          geom.setIndex(geometryData.indices);
        }
        if (geometryData?.normals && geometryData.normals.length > 0) {
          geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(geometryData.normals), 3));
        } else {
          geom.computeVertexNormals();
        }
        geom.computeBoundingBox();
        setViewerGeometry(geom);
        setViewerFaces(geometryData?.faces || null);
      } catch (gErr) {
        console.warn('Geometry build warning:', gErr);
      }

      console.log('🔄 Running PyTorch AAGNet inference (Python)…');

      // Step 2: Run Python AAGNet inference using your trained model
      const stepBase64 = btoa(unescape(encodeURIComponent(stepContent)));
      const { data, error: functionError } = await supabase.functions.invoke('python-aagnet-inference', {
        body: {
          step_data: stepBase64,
          file_name: file.name,
          analysis_params: { use_trained_model: true }
        }
      });

      setProgress(80);

      console.log('📋 AAGNet (Python) response received');

      if (functionError) {
        console.error('❌ AAGNet inference error:', functionError);
        throw new Error(`AAGNet inference failed: ${functionError.message}`);
      }

      if (!data) {
        console.error('❌ No data received from AAGNet inference');
        throw new Error('No data received from AAGNet inference');
      }

      console.log('✅ Analysis data received:', data);
      setProgress(90);

      // Normalize features (use face ids for highlighting)
      const normalizedFeatures = (data.features || []).map((f: any) => {
        const pos = Array.isArray(f.position) ? { x: f.position[0], y: f.position[1], z: f.position[2] } : f.position;
        const faceIds: number[] = f.face_ids || f.faces || [];
        const mp = f.machining_parameters || f.machining_params || {};
        return {
          id: String(f.id),
          type: String(f.type),
          confidence: Number(f.confidence ?? 0),
          position: pos,
          dimensions: f.dimensions || {},
          machining_parameters: {
            tool_type: mp.tool_type || 'unknown',
            tool_diameter: Number(mp.tool_diameter || mp.toolSize || 0),
            spindle_speed: Number(mp.spindle_speed || mp.speed || 0),
            feed_rate: Number(mp.feed_rate || 0),
            cutting_depth: Number(mp.cutting_depth || mp.step_down || 0)
          },
          face_ids: faceIds,
          bounding_box: f.bounding_box || { min: [0,0,0], max: [0,0,0] }
        } as PythonAAGNetFeature;
      });

      // Aggregate stats
      const featureTypeCounts: Record<string, number> = {};
      normalizedFeatures.forEach((f: any) => {
        featureTypeCounts[f.type] = (featureTypeCounts[f.type] || 0) + 1;
      });

      const result: PythonAAGNetResult = {
        features: normalizedFeatures,
        metadata: {
          processingTime: Number(data.metadata?.processingTime || data.metadata?.processing_time || 0),
          modelVersion: String(data.metadata?.modelVersion || data.metadata?.model_file || 'AAGNet (PyTorch)'),
          confidence: Number(data.statistics?.average_confidence || data.metadata?.confidence || 0)
        },
        statistics: {
          totalFeatures: normalizedFeatures.length,
          featureTypes: featureTypeCounts
        }
      };

      setAnalysisResult(result);
      setProgress(100);

      console.log('✅ Python AAGNet analysis completed');
      console.log('🎯 Features detected:', result.features.length);

      toast({
        title: 'AAGNet (PyTorch) Complete',
        description: `Detected ${result.features.length} machining features with your trained model`,
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
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const downloadResults = () => {
    if (!analysisResult) return;
    
    const dataStr = JSON.stringify(analysisResult, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `aagnet_analysis_${file?.name?.split('.')[0] || 'results'}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleFeatureSelection = (featureId: string) => {
    setSelectedFeatureIds(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const getVisualizationData = () => {
    if (!analysisResult) return { features: [], analysisResults: null };
    
    return {
      features: analysisResult.features.map(feature => ({
        id: feature.id,
        type: feature.type,
        position: feature.position,
        dimensions: feature.dimensions,
        confidence: feature.confidence,
        faceIds: feature.face_ids,
        visible: true
      })),
      analysisResults: analysisResult
    };
  };

  const getFeatureColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      'through_hole': '#FF6B6B',
      'blind_hole': '#4ECDC4', 
      'rectangular_pocket': '#45B7D1',
      'circular_end_pocket': '#96CEB4',
      'chamfer': '#FFEAA7',
      'round': '#DDA0DD',
      'rectangular_through_slot': '#98D8C8',
      'triangular_passage': '#F7DC6F',
      'default': '#BDC3C7'
    };
    return colorMap[type] || colorMap.default;
  };

  const getSummaryStats = () => {
    if (!analysisResult) return null;
    
    const { features, metadata } = analysisResult;
    const avgConfidence = features.reduce((sum, f) => sum + f.confidence, 0) / features.length;
    
    return {
      totalFeatures: features.length,
      averageConfidence: avgConfidence,
      processingTime: metadata.processingTime,
      modelVersion: metadata.modelVersion
    };
  };

  const stats = getSummaryStats();
  const vizData = getVisualizationData();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Real Python AAGNet Analysis
          </CardTitle>
          <CardDescription>
            Upload STEP files for machining feature recognition using your actual trained AAGNet model with real geometry parsing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label htmlFor="step-file" className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
                <Upload className="h-4 w-4" />
                <span>{file ? file.name : 'Choose STEP file'}</span>
              </div>
              <input
                id="step-file"
                type="file"
                accept=".step,.stp,.STEP,.STP"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            
            <Button 
              onClick={handleFileUpload} 
              disabled={!file || isAnalyzing}
              className="flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              {isAnalyzing ? 'Analyzing...' : 'Run AAGNet Analysis'}
            </Button>
            
            {analysisResult && (
              <Button 
                variant="outline" 
                onClick={downloadResults}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Results
              </Button>
            )}
          </div>

          {isAnalyzing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing STEP file with real AAGNet model...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {analysisResult && (
        <Tabs defaultValue="results" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="results">Analysis Results</TabsTrigger>
            <TabsTrigger value="features">Feature Details</TabsTrigger>
            <TabsTrigger value="visualization">3D Visualization</TabsTrigger>
          </TabsList>

          <TabsContent value="results" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analysis Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{stats.totalFeatures}</div>
                      <div className="text-sm text-gray-600">Features Detected</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{(stats.averageConfidence * 100).toFixed(1)}%</div>
                      <div className="text-sm text-gray-600">Avg Confidence</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{(stats.processingTime / 1000).toFixed(1)}s</div>
                      <div className="text-sm text-gray-600">Processing Time</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-xl font-bold text-orange-600">Real Model</div>
                      <div className="text-sm text-gray-600">{stats.modelVersion}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Feature Types Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(analysisResult.statistics.featureTypes).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: getFeatureColor(type) }}
                      />
                      <span className="text-sm capitalize">{type.replace(/_/g, ' ')}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Detected Features</CardTitle>
                <CardDescription>
                  Click on features to view details and select for 3D visualization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {analysisResult.features.map((feature) => (
                      <div 
                        key={feature.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedFeatureIds.includes(feature.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleFeatureSelection(feature.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: getFeatureColor(feature.type) }}
                            />
                            <span className="font-medium capitalize">{feature.type.replace(/_/g, ' ')}</span>
                            <Badge variant="outline">{(feature.confidence * 100).toFixed(1)}%</Badge>
                          </div>
                          <Eye className="h-4 w-4 text-gray-400" />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                          <div>
                            <strong>Position:</strong> ({feature.position.x.toFixed(1)}, {feature.position.y.toFixed(1)}, {feature.position.z.toFixed(1)})
                          </div>
                          <div>
                            <strong>Tool:</strong> {feature.machining_parameters.tool_type}
                          </div>
                          <div>
                            <strong>Dimensions:</strong> {Object.entries(feature.dimensions).map(([key, value]) => 
                              `${key}: ${typeof value === 'number' ? value.toFixed(1) : value}`
                            ).join(', ')}
                          </div>
                          <div>
                            <strong>Speed:</strong> {feature.machining_parameters.spindle_speed.toFixed(0)} RPM
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="visualization" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>3D Model Visualization</CardTitle>
                <CardDescription>
                  Interactive 3D view of the STEP file with detected features highlighted
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96 border rounded-lg bg-gray-50">
                  <Model3DViewer
                    geometry={viewerGeometry || undefined}
                    features={vizData.features}
                    selectedFeatureIds={selectedFeatureIds}
                    onFeatureClick={handleFeatureSelection}
                    analysisResults={vizData.analysisResults}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default PythonAAGNetAnalyzer;