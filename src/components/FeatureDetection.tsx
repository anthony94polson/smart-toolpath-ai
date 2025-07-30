import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import EnhancedMLFeatureDetection from './EnhancedMLFeatureDetection';
import Model3DViewer from './Model3DViewer';
import { Eye, EyeOff, Settings, ChevronRight } from 'lucide-react';

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
  onFeaturesSelected: (features: any[]) => void;
  uploadedFile?: File;
  analyzedFeatures?: Feature[];
}

const FeatureDetection = ({ analysisResults, onFeaturesSelected, uploadedFile, analyzedFeatures }: FeatureDetectionProps) => {
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
      {/* Use Enhanced ML Feature Detection instead of old system */}
      <EnhancedMLFeatureDetection
        geometry={analysisResults?.originalGeometry}
        onFeaturesSelected={onFeaturesSelected}
      />
    </div>
  );
};

export default FeatureDetection;