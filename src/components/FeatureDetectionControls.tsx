import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Settings, RefreshCw, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface SensitivityParams {
  featureSizeMultiplier: number;
  confidenceThreshold: number;
  surfaceGroupingTolerance: number;
  detectSmallFeatures: boolean;
  detectCompoundFeatures: boolean;
}

interface FeatureDetectionControlsProps {
  params: SensitivityParams;
  onParamsChange: (params: SensitivityParams) => void;
  onReanalyze: () => void;
  isAnalyzing: boolean;
  featureCount: number;
}

export const FeatureDetectionControls: React.FC<FeatureDetectionControlsProps> = ({
  params,
  onParamsChange,
  onReanalyze,
  isAnalyzing,
  featureCount
}) => {
  const handleSliderChange = (key: keyof SensitivityParams, value: number[]) => {
    onParamsChange({
      ...params,
      [key]: value[0]
    });
  };

  const handleSwitchChange = (key: keyof SensitivityParams, checked: boolean) => {
    onParamsChange({
      ...params,
      [key]: checked
    });
  };

  const resetToDefaults = () => {
    onParamsChange({
      featureSizeMultiplier: 1.0,
      confidenceThreshold: 0.3,
      surfaceGroupingTolerance: 0.85,
      detectSmallFeatures: true,
      detectCompoundFeatures: true
    });
  };

  const getDetectionModeLabel = () => {
    if (params.confidenceThreshold < 0.3) return "Aggressive";
    if (params.confidenceThreshold < 0.6) return "Balanced";
    return "Conservative";
  };

  const getDetectionModeColor = () => {
    if (params.confidenceThreshold < 0.3) return "destructive";
    if (params.confidenceThreshold < 0.6) return "default";
    return "secondary";
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Detection Sensitivity
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={getDetectionModeColor()}>
            {getDetectionModeLabel()}
          </Badge>
          <Badge variant="outline">
            {featureCount} features
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <TooltipProvider>
          {/* Feature Size Sensitivity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Feature Size Sensitivity</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Lower values detect smaller features. Higher values focus on larger features.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Slider
              value={[params.featureSizeMultiplier]}
              onValueChange={(value) => handleSliderChange('featureSizeMultiplier', value)}
              min={0.1}
              max={3.0}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fine Detail (0.1x)</span>
              <span>{params.featureSizeMultiplier.toFixed(1)}x</span>
              <span>Large Features (3.0x)</span>
            </div>
          </div>

          {/* Confidence Threshold */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Detection Confidence</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Lower values detect more features but may include false positives.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Slider
              value={[params.confidenceThreshold]}
              onValueChange={(value) => handleSliderChange('confidenceThreshold', value)}
              min={0.1}
              max={0.9}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Aggressive (0.1)</span>
              <span>{params.confidenceThreshold.toFixed(2)}</span>
              <span>Conservative (0.9)</span>
            </div>
          </div>

          {/* Surface Grouping */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Surface Grouping</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Controls how aggressively surfaces are merged. Lower values preserve more detail.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Slider
              value={[params.surfaceGroupingTolerance]}
              onValueChange={(value) => handleSliderChange('surfaceGroupingTolerance', value)}
              min={0.5}
              max={0.95}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Detailed (0.5)</span>
              <span>{params.surfaceGroupingTolerance.toFixed(2)}</span>
              <span>Merged (0.95)</span>
            </div>
          </div>

          {/* Feature Type Controls */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Feature Detection Options</Label>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm">Detect Small Features</Label>
                <p className="text-xs text-muted-foreground">
                  Include features smaller than the minimum size threshold
                </p>
              </div>
              <Switch
                checked={params.detectSmallFeatures}
                onCheckedChange={(checked) => handleSwitchChange('detectSmallFeatures', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm">Detect Compound Features</Label>
                <p className="text-xs text-muted-foreground">
                  Find nested and intersecting features (e.g., holes in pockets)
                </p>
              </div>
              <Switch
                checked={params.detectCompoundFeatures}
                onCheckedChange={(checked) => handleSwitchChange('detectCompoundFeatures', checked)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button 
              onClick={onReanalyze}
              disabled={isAnalyzing}
              className="flex-1"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-analyze Features
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={resetToDefaults}
              disabled={isAnalyzing}
            >
              Reset Defaults
            </Button>
          </div>

          {/* Detection Tips */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-medium">💡 Detection Tips</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• For parts with many small features: Lower confidence threshold</li>
              <li>• For clean, large features: Higher confidence threshold</li>
              <li>• Missing features? Enable small feature detection</li>
              <li>• Too many false positives? Increase confidence threshold</li>
            </ul>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};