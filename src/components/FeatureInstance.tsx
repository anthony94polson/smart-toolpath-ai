import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface FeatureInstanceProps {
  feature: {
    id: string;
    type: string;
    confidence: number;
    position: number[];
    dimensions: {
      diameter?: number;
      width: number;
      height: number;
      depth: number;
    };
    machining_params: {
      tool_type: string;
      tool_diameter: number;
      speed: number;
      feed_rate: number;
      [key: string]: any;
    };
  };
  onSelect?: (feature: any) => void;
  isSelected?: boolean;
}

export default function FeatureInstance({ feature, onSelect, isSelected }: FeatureInstanceProps) {
  const getFeatureColor = (type: string) => {
    const colorMap: { [key: string]: string } = {
      'through_hole': 'bg-blue-100 text-blue-800',
      'blind_hole': 'bg-blue-200 text-blue-900',
      'rectangular_pocket': 'bg-green-100 text-green-800',
      'circular_end_pocket': 'bg-green-200 text-green-900',
      'triangular_pocket': 'bg-green-300 text-green-900',
      'rectangular_through_slot': 'bg-purple-100 text-purple-800',
      'chamfer': 'bg-orange-100 text-orange-800',
      'round': 'bg-yellow-100 text-yellow-800',
      'rectangular_blind_step': 'bg-red-100 text-red-800',
      'circular_blind_step': 'bg-red-200 text-red-900',
    };
    return colorMap[type] || 'bg-gray-100 text-gray-800';
  };

  const formatDimensions = (dims: any) => {
    const parts = [];
    if (dims.diameter) {
      parts.push(`Ø${dims.diameter.toFixed(2)}mm`);
    } else {
      parts.push(`${dims.width.toFixed(2)}×${dims.height.toFixed(2)}mm`);
    }
    if (dims.depth) {
      parts.push(`↓${dims.depth.toFixed(2)}mm`);
    }
    return parts.join(' ');
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary shadow-lg' : ''
      }`}
      onClick={() => onSelect?.(feature)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {feature.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </CardTitle>
          <Badge className={getFeatureColor(feature.type)}>
            {(feature.confidence * 100).toFixed(1)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            <span className="font-medium">Dimensions:</span> {formatDimensions(feature.dimensions)}
          </div>
          <div>
            <span className="font-medium">Position:</span> ({feature.position.map(p => p.toFixed(1)).join(', ')})
          </div>
          <div>
            <span className="font-medium">Tool:</span> {feature.machining_params.tool_type} 
            (Ø{feature.machining_params.tool_diameter.toFixed(1)}mm)
          </div>
          <div>
            <span className="font-medium">Speed:</span> {feature.machining_params.speed} RPM
          </div>
        </div>
      </CardContent>
    </Card>
  );
}