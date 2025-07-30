import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Zap, Clock, Target, CheckCircle } from 'lucide-react';
import PythonAAGNetAnalyzer from './PythonAAGNetAnalyzer';
import Model3DViewer from './Model3DViewer';
import * as THREE from 'three';

interface MachinableFeature {
  id: string;
  type: string;
  confidence: number;
  position: THREE.Vector3;
  dimensions: {
    length?: number;
    width?: number;
    height?: number;
    diameter?: number;
    depth?: number;
  };
  boundingBox: THREE.Box3;
  normal?: THREE.Vector3;
  axis?: THREE.Vector3;
  toolRecommendation: string;
}

interface EnhancedMLFeatureDetectionProps {
  geometry?: THREE.BufferGeometry;
  onFeaturesSelected: (features: MachinableFeature[]) => void;
}

const EnhancedMLFeatureDetection = ({ geometry, onFeaturesSelected }: EnhancedMLFeatureDetectionProps) => {
  const [features, setFeatures] = useState<MachinableFeature[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any>(null);

  const handleFeaturesDetected = (detectedFeatures: MachinableFeature[], results: any) => {
    setFeatures(detectedFeatures);
    setAnalysisResults(results);
    setIsAnalyzing(false);
    setProgress(100);
    setStatus('Analysis complete');
    
    // Auto-select high-confidence features
    const highConfidenceFeatures = detectedFeatures
      .filter(f => f.confidence > 0.7)
      .map(f => f.id);
    setSelectedFeatures(new Set(highConfidenceFeatures));
  };

  const handleProgress = (progressValue: number, statusText: string) => {
    setProgress(Math.round(progressValue * 100));
    setStatus(statusText);
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setIsAnalyzing(false);
    setProgress(0);
    setStatus('Analysis failed');
  };

  const startAnalysis = () => {
    if (!geometry) return;
    
    setIsAnalyzing(true);
    setError(null);
    setProgress(0);
    setStatus('Starting ML analysis...');
    setFeatures([]);
    setSelectedFeatures(new Set());
  };

  const toggleFeatureSelection = (featureId: string) => {
    const newSelection = new Set(selectedFeatures);
    if (newSelection.has(featureId)) {
      newSelection.delete(featureId);
    } else {
      newSelection.add(featureId);
    }
    setSelectedFeatures(newSelection);
  };

  const handleProceedToTooling = () => {
    const selected = features.filter(f => selectedFeatures.has(f.id));
    onFeaturesSelected(selected);
  };

  const getFeatureStats = () => {
    const stats = features.reduce((acc, feature) => {
      acc[feature.type] = (acc[feature.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(stats).map(([type, count]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
      count,
      color: getFeatureColor(type)
    }));
  };

  const getFeatureColor = (type: string) => {
    const colors = {
      hole: 'bg-blue-500',
      pocket: 'bg-green-500',
      edge: 'bg-yellow-500',
      slot: 'bg-purple-500',
      step: 'bg-red-500'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-500';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Python AAGNet Analysis Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="h-6 w-6 text-primary" />
              <CardTitle>Python AAGNet Feature Detection</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Full Implementation</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!geometry ? (
            <Alert>
              <AlertDescription>
                Please upload an STL file to begin Python AAGNet feature detection.
              </AlertDescription>
            </Alert>
          ) : !isAnalyzing && features.length === 0 ? (
            <div className="space-y-4">
              <Alert>
                <Code className="h-4 w-4" />
                <AlertDescription>
                  <strong>Python AAGNet Analysis</strong><br />
                  Complete implementation using geometric attributed adjacency graphs, 
                  topological analysis, and graph neural networks for maximum accuracy.
                </AlertDescription>
              </Alert>
              
              <Button 
                onClick={startAnalysis}
                disabled={isAnalyzing}
                className="flex items-center gap-2"
                size="lg"
              >
                <Code className="h-4 w-4" />
                Start Python AAGNet Analysis
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Feature Detection Results */}
      {features.length > 0 && (
        <>
          {/* Feature Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Detection Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {getFeatureStats().map(({ type, count, color }) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <span className="text-sm font-medium">{type}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 text-sm text-muted-foreground">
                Detected {features.length} features using Python AAGNet with high-confidence geometric analysis
              </div>
            </CardContent>
          </Card>

          {/* Feature Details and Visualization */}
          <Tabs defaultValue="list" className="space-y-4">
            <TabsList>
              <TabsTrigger value="list">Feature List</TabsTrigger>
              <TabsTrigger value="3d">3D Visualization</TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Detected Features</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Select features to include in toolpath generation
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {features.map((feature) => (
                      <div
                        key={feature.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedFeatures.has(feature.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => toggleFeatureSelection(feature.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${getFeatureColor(feature.type)}`} />
                            <div>
                              <div className="font-medium capitalize">{feature.type}</div>
                              <div className="text-sm text-muted-foreground">
                                {feature.toolRecommendation}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className={`text-sm font-medium ${getConfidenceColor(feature.confidence)}`}>
                              {Math.round(feature.confidence * 100)}% confidence
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {feature.dimensions.diameter && `⌀${feature.dimensions.diameter.toFixed(1)}mm`}
                              {feature.dimensions.length && feature.dimensions.width && 
                                `${feature.dimensions.length.toFixed(1)}×${feature.dimensions.width.toFixed(1)}mm`}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="3d">
              <Card>
                <CardHeader>
                  <CardTitle>3D Feature Visualization</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-96 rounded-lg overflow-hidden">
                    <Model3DViewer
                      geometry={geometry}
                      features={features.map(f => ({ ...f, visible: true }))}
                      selectedFeatureIds={Array.from(selectedFeatures)}
                      onFeatureClick={toggleFeatureSelection}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Proceed Button */}
          {selectedFeatures.size > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {selectedFeatures.size} feature{selectedFeatures.size !== 1 ? 's' : ''} selected
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Ready for tool assignment and toolpath generation
                    </div>
                  </div>
                  <Button onClick={handleProceedToTooling} size="lg">
                    Proceed to Tool Assignment
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Python AAGNet Analyzer Component */}
      {geometry && (
        <PythonAAGNetAnalyzer
          geometry={geometry}
          fileName="uploaded-model.stl"
          onFeaturesDetected={handleFeaturesDetected}
          onProgress={handleProgress}
          onError={handleError}
        />
      )}
    </div>
  );
};

export default EnhancedMLFeatureDetection;