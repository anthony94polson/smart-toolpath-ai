import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
  import { Eye, EyeOff, Settings, Target } from "lucide-react";
  import { Checkbox } from "@/components/ui/checkbox";
import Model3DViewer from "./Model3DViewer";

interface Feature {
  id: string;
  type: "pocket" | "hole" | "slot" | "chamfer" | "step";
  dimensions: { [key: string]: number };
  position: { x: number; y: number; z: number };
  confidence: number;
  toolRecommendation?: string;
  visible: boolean;
}

interface FeatureDetectionProps {
  analysisResults: any;
  onFeaturesSelected: (features: Feature[]) => void;
  uploadedFile?: File;
  analyzedFeatures?: Feature[];
}

const FeatureDetection = ({ analysisResults, onFeaturesSelected, uploadedFile, analyzedFeatures }: FeatureDetectionProps) => {
  // Convert analyzed features to the expected format
  const [features] = useState<Feature[]>(() => {
    if (analyzedFeatures && analyzedFeatures.length > 0) {
      return analyzedFeatures.map((feature: any, index: number) => ({
        id: feature.id || `F${index.toString().padStart(3, '0')}`,
        type: feature.type,
        dimensions: feature.dimensions,
        position: feature.position,
        confidence: feature.confidence || 0.9,
        toolRecommendation: getToolRecommendation(feature),
        visible: true
      }));
    }
    
    // Fallback mock data only if no real features detected
    return [
      {
        id: "P001",
        type: "pocket",
        dimensions: { width: 25, length: 40, depth: 8 },
        position: { x: 50, y: 30, z: 0 },
        confidence: 0.95,
        toolRecommendation: "12mm End Mill",
        visible: true
      },
      {
        id: "H001",
        type: "hole",
        dimensions: { diameter: 6, depth: 20 },
        position: { x: 25, y: 25, z: 0 },
        confidence: 0.98,
        toolRecommendation: "6mm Drill",
        visible: true
      }
    ];
  });

  const getToolRecommendation = (feature: any): string => {
    switch (feature.type) {
      case 'hole':
        return `${feature.dimensions.diameter}mm Drill`;
      case 'pocket':
        return `${Math.min(feature.dimensions.width, feature.dimensions.length) / 2}mm End Mill`;
      case 'slot':
        return `${feature.dimensions.width}mm End Mill`;
      case 'chamfer':
        return `${feature.dimensions.angle}° Chamfer Tool`;
      case 'step':
        return `${feature.dimensions.width / 2}mm End Mill`;
      default:
        return "General Purpose End Mill";
    }
  };

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const getFeatureColor = (type: string) => {
    const colors = {
      pocket: "bg-primary",
      hole: "bg-accent", 
      slot: "bg-success",
      chamfer: "bg-warning",
      step: "bg-destructive"
    };
    return colors[type as keyof typeof colors] || "bg-muted";
  };

  const getFeatureIcon = (type: string) => {
    switch (type) {
      case "pocket": return "⬜";
      case "hole": return "⚪";
      case "slot": return "▬";
      case "chamfer": return "◤";
      case "step": return "⬛";
      default: return "●";
    }
  };

  const toggleFeatureSelection = (featureId: string) => {
    setSelectedFeatures(prev => 
      prev.includes(featureId)
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFeatures.length === features.length) {
      setSelectedFeatures([]);
    } else {
      setSelectedFeatures(features.map(f => f.id));
    }
  };

  const isAllSelected = selectedFeatures.length === features.length;
  const isIndeterminate = selectedFeatures.length > 0 && selectedFeatures.length < features.length;
  
  const checkboxRef = useRef<any>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  const toggleFeatureVisibility = (featureId: string) => {
    // In a real app, this would update the features state
    console.log(`Toggle visibility for feature ${featureId}`);
  };

  const handleProceedToTooling = () => {
    const selected = features.filter(f => selectedFeatures.includes(f.id));
    onFeaturesSelected(selected);
  };

  const featuresByType = features.reduce((acc, feature) => {
    if (!acc[feature.type]) acc[feature.type] = [];
    acc[feature.type].push(feature);
    return acc;
  }, {} as Record<string, Feature[]>);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Feature Detection Results</h2>
            <p className="text-muted-foreground">
              {features.length} features detected with AI confidence scoring
            </p>
          </div>
          <Badge variant="outline" className="bg-success/10">
            Analysis Complete
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {Object.entries(analysisResults.features).map(([type, count]) => (
            <Card key={type} className="p-4 text-center">
              <div className={`w-8 h-8 rounded-full ${getFeatureColor(type)} mx-auto mb-2 flex items-center justify-center text-white`}>
                {getFeatureIcon(type)}
              </div>
              <h3 className="font-semibold capitalize">{type}s</h3>
              <p className="text-2xl font-bold text-primary">{count as number}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Feature List</TabsTrigger>
            <TabsTrigger value="3d">3D View</TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="space-y-4">
            <div className="flex items-center space-x-2 mb-4 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="select-all"
                checked={isAllSelected}
                onCheckedChange={toggleSelectAll}
                ref={checkboxRef}
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                Select All Features ({features.length})
              </label>
            </div>
            {Object.entries(featuresByType).map(([type, typeFeatures]) => (
              <div key={type} className="space-y-2">
                <h3 className="font-semibold capitalize text-lg">{type}s</h3>
                {typeFeatures.map((feature) => (
                  <Card 
                    key={feature.id}
                    className={`p-4 cursor-pointer transition-all hover:shadow-soft ${
                      selectedFeatures.includes(feature.id) ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => toggleFeatureSelection(feature.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${getFeatureColor(feature.type)}`}></div>
                        <div>
                          <h4 className="font-semibold">{feature.id}</h4>
                          <p className="text-sm text-muted-foreground">
                            {Object.entries(feature.dimensions).map(([key, value]) => 
                              `${key}: ${value}mm`
                            ).join(", ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline">
                          {Math.round(feature.confidence * 100)}% confidence
                        </Badge>
                        <Badge className="bg-accent">
                          {feature.toolRecommendation}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFeatureVisibility(feature.id);
                          }}
                        >
                          {feature.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ))}
          </TabsContent>
          
          <TabsContent value="3d">
            <Card className="p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">3D Model View</h3>
                <p className="text-sm text-muted-foreground">
                  Click features to select them. Use mouse to orbit, scroll to zoom.
                </p>
              </div>
              
              <Model3DViewer
                features={features}
                selectedFeatures={selectedFeatures}
                onFeatureClick={toggleFeatureSelection}
                analysisResults={analysisResults}
                uploadedFile={uploadedFile}
              />
              
              <div className="flex justify-center space-x-2 mt-4">
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  View Options
                </Button>
                <Button variant="outline" size="sm">Reset View</Button>
                <Button variant="outline" size="sm">Export View</Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center mt-6 pt-6 border-t">
          <p className="text-sm text-muted-foreground">
            {selectedFeatures.length} of {features.length} features selected
          </p>
          <Button 
            onClick={handleProceedToTooling}
            disabled={selectedFeatures.length === 0}
            className="bg-gradient-primary hover:shadow-medium transition-spring"
          >
            Proceed to Tool Assignment
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default FeatureDetection;