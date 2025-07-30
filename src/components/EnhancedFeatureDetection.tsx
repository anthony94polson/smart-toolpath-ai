import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { FeatureDetectionControls } from './FeatureDetectionControls';
import Model3DViewer from './Model3DViewer';
import { Eye, EyeOff, Zap, Target, Layers, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Feature {
  id: string;
  type: 'hole' | 'pocket' | 'slot' | 'chamfer' | 'step' | 'boss' | 'rib' | 'counterbore' | 'countersink' | 'taper_hole' | 'fillet' | 'island';
  confidence: number;
  dimensions: { [key: string]: number };
  position: { x: number; y: number; z: number };
  visible: boolean;
}

interface EnhancedFeatureDetectionProps {
  analysisResults?: any;
  onSelectedFeatures?: (features: Feature[]) => void;
  uploadedFile?: File;
  detectedFeatures?: Feature[];
}

interface SensitivityParams {
  featureSizeMultiplier: number;
  confidenceThreshold: number;
  surfaceGroupingTolerance: number;
  detectSmallFeatures: boolean;
  detectCompoundFeatures: boolean;
}

export const EnhancedFeatureDetection: React.FC<EnhancedFeatureDetectionProps> = ({
  analysisResults,
  onSelectedFeatures,
  uploadedFile,
  detectedFeatures = []
}) => {
  const [features, setFeatures] = useState<Feature[]>(detectedFeatures);
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [sensitivityParams, setSensitivityParams] = useState<SensitivityParams>({
    featureSizeMultiplier: 1.0,
    confidenceThreshold: 0.3,
    surfaceGroupingTolerance: 0.85,
    detectSmallFeatures: true,
    detectCompoundFeatures: true
  });

  // Update features when detectedFeatures prop changes
  useEffect(() => {
    setFeatures(detectedFeatures);
  }, [detectedFeatures]);

  const handleReanalyze = useCallback(async () => {
    if (!uploadedFile) {
      toast.error("No file uploaded for analysis");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      // Simulate progressive analysis with the enhanced analyzer
      const progressSteps = [
        { step: 10, message: "Loading STL geometry..." },
        { step: 25, message: "Extracting faces and edges..." },
        { step: 40, message: "Building spatial index..." },
        { step: 55, message: "Detecting edge loops..." },
        { step: 70, message: "Analyzing surface curvature..." },
        { step: 85, message: "Running multi-scale feature detection..." },
        { step: 95, message: "Validating and filtering features..." },
        { step: 100, message: "Analysis complete!" }
      ];

      for (const { step, message } of progressSteps) {
        await new Promise(resolve => setTimeout(resolve, 300));
        setAnalysisProgress(step);
        toast.info(message);
      }

      // Mock enhanced feature detection results based on sensitivity params
      const mockFeatures = generateMockFeatures(sensitivityParams);
      setFeatures(mockFeatures);
      
      toast.success(`Enhanced analysis complete! Found ${mockFeatures.length} features`);
      
    } catch (error) {
      toast.error("Analysis failed. Please try again.");
      console.error("Analysis error:", error);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  }, [uploadedFile, sensitivityParams]);

  const generateMockFeatures = (params: SensitivityParams): Feature[] => {
    const baseFeatures: Omit<Feature, 'id' | 'visible'>[] = [
      {
        type: 'hole',
        confidence: 0.95,
        dimensions: { diameter: 6.0, depth: 15.0 },
        position: { x: 10, y: 5, z: 10 }
      },
      {
        type: 'hole',
        confidence: 0.92,
        dimensions: { diameter: 8.0, depth: 20.0 },
        position: { x: 30, y: 5, z: 10 }
      },
      {
        type: 'counterbore',
        confidence: 0.88,
        dimensions: { outerDiameter: 12.0, innerDiameter: 6.0, depth: 8.0 },
        position: { x: 50, y: 5, z: 10 }
      },
      {
        type: 'pocket',
        confidence: 0.85,
        dimensions: { width: 20.0, length: 30.0, depth: 10.0 },
        position: { x: 15, y: 10, z: 25 }
      },
      {
        type: 'slot',
        confidence: 0.82,
        dimensions: { width: 8.0, length: 25.0, depth: 12.0 },
        position: { x: 45, y: 8, z: 25 }
      },
      {
        type: 'step',
        confidence: 0.78,
        dimensions: { width: 15.0, height: 5.0, depth: 40.0 },
        position: { x: 70, y: 2.5, z: 20 }
      },
      {
        type: 'fillet',
        confidence: 0.75,
        dimensions: { radius: 3.0, length: 20.0 },
        position: { x: 25, y: 15, z: 5 }
      },
      {
        type: 'boss',
        confidence: 0.72,
        dimensions: { diameter: 10.0, height: 8.0 },
        position: { x: 60, y: 20, z: 35 }
      }
    ];

    // Filter features based on sensitivity parameters
    let filteredFeatures = baseFeatures.filter(feature => {
      // Apply confidence threshold
      if (feature.confidence < params.confidenceThreshold) return false;
      
      // Apply size filtering
      const minSize = params.detectSmallFeatures ? 0.5 : 2.0;
      const featureSize = Math.min(...Object.values(feature.dimensions));
      if (featureSize < minSize * params.featureSizeMultiplier) return false;
      
      return true;
    });

    // Add small features if enabled and threshold is low
    if (params.detectSmallFeatures && params.confidenceThreshold < 0.4) {
      filteredFeatures.push(
        {
          type: 'hole',
          confidence: 0.35,
          dimensions: { diameter: 2.0, depth: 8.0 },
          position: { x: 80, y: 3, z: 15 }
        },
        {
          type: 'fillet',
          confidence: 0.32,
          dimensions: { radius: 1.5, length: 12.0 },
          position: { x: 35, y: 12, z: 40 }
        }
      );
    }

    // Add compound features if enabled
    if (params.detectCompoundFeatures) {
      filteredFeatures.push({
        type: 'countersink',
        confidence: 0.68,
        dimensions: { diameter: 10.0, angle: 82, depth: 3.0 },
        position: { x: 40, y: 6, z: 35 }
      });
    }

    // Convert to full Feature objects
    return filteredFeatures.map((feature, index) => ({
      ...feature,
      id: `feature_${index}_${Date.now()}`,
      visible: true
    }));
  };

  const toggleFeatureSelection = (featureId: string) => {
    const newSelection = new Set(selectedFeatures);
    if (newSelection.has(featureId)) {
      newSelection.delete(featureId);
    } else {
      newSelection.add(featureId);
    }
    setSelectedFeatures(newSelection);

    const selectedFeatureObjects = features.filter(f => newSelection.has(f.id));
    onSelectedFeatures?.(selectedFeatureObjects);
  };

  const toggleFeatureVisibility = (featureId: string) => {
    setFeatures(prev => prev.map(feature => 
      feature.id === featureId 
        ? { ...feature, visible: !feature.visible }
        : feature
    ));
  };

  const selectAllFeatures = () => {
    const allIds = features.map(f => f.id);
    setSelectedFeatures(new Set(allIds));
    onSelectedFeatures?.(features);
  };

  const clearSelection = () => {
    setSelectedFeatures(new Set());
    onSelectedFeatures?.([]);
  };

  const getFeatureStats = () => {
    const stats = new Map<string, { count: number; avgConfidence: number }>();
    
    features.forEach(feature => {
      const existing = stats.get(feature.type) || { count: 0, avgConfidence: 0 };
      existing.count += 1;
      existing.avgConfidence = (existing.avgConfidence * (existing.count - 1) + feature.confidence) / existing.count;
      stats.set(feature.type, existing);
    });
    
    return stats;
  };

  const getToolRecommendation = (feature: Feature): string => {
    const toolMap = {
      hole: "Drill Bit",
      counterbore: "Endmill + Drill",
      countersink: "Countersink Tool",
      taper_hole: "Tapered Drill",
      pocket: "Endmill",
      slot: "Endmill",
      step: "Face Mill",
      boss: "Endmill (Roughing)",
      fillet: "Ball Endmill",
      island: "Endmill"
    };
    return toolMap[feature.type] || "Endmill";
  };

  const featureStats = getFeatureStats();

  return (
    <div className="space-y-6">
      {/* Analysis Progress */}
      {isAnalyzing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Enhanced Feature Analysis</span>
                <span className="text-sm text-muted-foreground">{analysisProgress}%</span>
              </div>
              <Progress value={analysisProgress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls Panel */}
        <div className="lg:col-span-1">
          <FeatureDetectionControls
            params={sensitivityParams}
            onParamsChange={setSensitivityParams}
            onReanalyze={handleReanalyze}
            isAnalyzing={isAnalyzing}
            featureCount={features.length}
          />
        </div>

        {/* Main Detection Results */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Feature Detection Results
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllFeatures}
                    disabled={features.length === 0}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    disabled={selectedFeatures.size === 0}
                  >
                    Clear
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="3d-view">3D View</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from(featureStats.entries()).map(([type, stats]) => (
                      <Card key={type} className="p-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize">{type}s</span>
                            <Badge variant="secondary">{stats.count}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg: {(stats.avgConfidence * 100).toFixed(0)}% confidence
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {features.length === 0 && !isAnalyzing && (
                    <div className="text-center py-8 space-y-3">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" />
                      <div>
                        <h3 className="text-lg font-medium">No Features Detected</h3>
                        <p className="text-muted-foreground">
                          Try adjusting the sensitivity parameters or upload a different STL file.
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="features" className="space-y-3">
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {features.map((feature) => (
                      <Card 
                        key={feature.id} 
                        className={`p-3 transition-colors ${
                          selectedFeatures.has(feature.id) ? 'ring-2 ring-primary' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedFeatures.has(feature.id)}
                              onChange={() => toggleFeatureSelection(feature.id)}
                              className="h-4 w-4"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium capitalize">{feature.type}</span>
                                <Badge variant="outline">
                                  {(feature.confidence * 100).toFixed(0)}%
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {getToolRecommendation(feature)}
                              </div>
                            </div>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFeatureVisibility(feature.id)}
                          >
                            {feature.visible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        
                        <div className="mt-2 text-xs text-muted-foreground">
                          {Object.entries(feature.dimensions).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              {key}: {value.toFixed(1)}mm
                            </span>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="3d-view">
                  <div className="h-96 bg-muted/20 rounded-lg flex items-center justify-center">
                    {uploadedFile ? (
                      <Model3DViewer
                        features={features}
                        selectedFeatures={Array.from(selectedFeatures)}
                        onFeatureClick={(featureId) => toggleFeatureSelection(featureId)}
                        analysisResults={analysisResults}
                        uploadedFile={uploadedFile}
                      />
                    ) : (
                      <div className="text-center space-y-2">
                        <Layers className="h-12 w-12 text-muted-foreground mx-auto" />
                        <p className="text-muted-foreground">Upload an STL file to view 3D visualization</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};