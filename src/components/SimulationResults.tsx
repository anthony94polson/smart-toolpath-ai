import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle, 
  Clock, 
  Box, 
  AlertTriangle,
  Download, 
  Share, 
  RotateCcw,
  FileText,
  Settings
} from "lucide-react";

interface SimulationResultsProps {
  results: {
    totalTime: string;
    materialRemoved: string;
    toolChanges: number;
    warnings: number;
  };
  onExport: () => void;
  onStartOver: () => void;
}

const SimulationResults = ({ results, onExport, onStartOver }: SimulationResultsProps) => {
  const exportOptions = [
    { name: "G-Code (ISO)", extension: ".nc", description: "Standard CNC format" },
    { name: "Mastercam", extension: ".mcam", description: "Native Mastercam file" },
    { name: "Fusion 360", extension: ".f3d", description: "Autodesk Fusion format" },
    { name: "SolidWorks CAM", extension: ".sldprt", description: "SolidWorks integration" },
    { name: "Siemens NX", extension: ".prt", description: "NX CAM format" }
  ];

  const qualityMetrics = [
    { metric: "Surface Finish", value: "Ra 0.8μm", status: "excellent" },
    { metric: "Dimensional Accuracy", value: "±0.02mm", status: "good" },
    { metric: "Tool Wear Prediction", value: "Low", status: "excellent" },
    { metric: "Collision Detection", value: "Clear", status: "excellent" },
    { metric: "Chip Evacuation", value: "Adequate", status: "warning" }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "excellent": return "text-success";
      case "good": return "text-primary";
      case "warning": return "text-warning";
      case "error": return "text-destructive";
      default: return "text-muted-foreground";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "excellent": return <Badge className="bg-success text-success-foreground">Excellent</Badge>;
      case "good": return <Badge className="bg-primary text-primary-foreground">Good</Badge>;
      case "warning": return <Badge variant="outline" className="border-warning text-warning">Warning</Badge>;
      case "error": return <Badge variant="destructive">Error</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Simulation Complete</h2>
          <p className="text-muted-foreground">
            Your machining program has been validated and is ready for production
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 text-center">
            <Clock className="w-8 h-8 mx-auto mb-3 text-primary" />
            <h3 className="font-semibold mb-1">Total Cycle Time</h3>
            <p className="text-2xl font-bold text-primary">{results.totalTime}</p>
            <p className="text-sm text-muted-foreground">Including tool changes</p>
          </Card>

          <Card className="p-6 text-center">
            <Box className="w-8 h-8 mx-auto mb-3 text-accent" />
            <h3 className="font-semibold mb-1">Material Removed</h3>
            <p className="text-2xl font-bold text-accent">{results.materialRemoved}</p>
            <p className="text-sm text-muted-foreground">Aluminum 6061</p>
          </Card>

          <Card className="p-6 text-center">
            <Settings className="w-8 h-8 mx-auto mb-3 text-success" />
            <h3 className="font-semibold mb-1">Tool Changes</h3>
            <p className="text-2xl font-bold text-success">{results.toolChanges}</p>
            <p className="text-sm text-muted-foreground">Optimized sequence</p>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Quality Assessment */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Quality Assessment</h3>
              {results.warnings > 0 && (
                <Badge variant="outline" className="border-warning text-warning">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {results.warnings} Warning
                </Badge>
              )}
            </div>
            
            <div className="space-y-4">
              {qualityMetrics.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.metric}</p>
                    <p className={`text-sm ${getStatusColor(item.status)}`}>{item.value}</p>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              ))}
            </div>

            {results.warnings > 0 && (
              <div className="mt-6 p-4 bg-warning/10 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-warning">Chip Evacuation Warning</h4>
                    <p className="text-sm text-warning/80">
                      Deep pocket operations may require air blast or flood coolant for optimal chip removal.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Export Options */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Export to CAM System</h3>
            <div className="space-y-3">
              {exportOptions.map((option, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="font-medium">{option.name}</p>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{option.extension}</Badge>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <Button onClick={onExport} className="w-full bg-gradient-primary hover:shadow-medium transition-spring">
                <Download className="w-4 h-4 mr-2" />
                Download Complete Package
              </Button>
              
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline">
                  <Share className="w-4 h-4 mr-2" />
                  Share Project
                </Button>
                <Button variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Report
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="flex justify-center space-x-4 mt-8 pt-6 border-t">
          <Button variant="outline" onClick={onStartOver}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Process New File
          </Button>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Adjust Parameters
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SimulationResults;