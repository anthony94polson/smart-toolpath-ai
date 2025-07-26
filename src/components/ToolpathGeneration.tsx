import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { MaterialRemovalSimulation } from './MaterialRemovalSimulation';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Settings, 
  Download,
  Clock,
  Zap,
  Route,
  AlertTriangle
} from "lucide-react";

interface ToolpathGenerationProps {
  toolAssignments: any[];
  onSimulationComplete: (results: any) => void;
  uploadedFile?: File;
  analysisResults?: any;
}

const ToolpathGeneration = ({ toolAssignments, onSimulationComplete, uploadedFile, analysisResults }: ToolpathGenerationProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [selectedOperation, setSelectedOperation] = useState(0);
  const [feedrateOverride, setFeedrateOverride] = useState([100]);
  const [spindleOverride, setSpindleOverride] = useState([100]);

  const [operations] = useState([
    {
      id: "OP001",
      type: "Roughing",
      feature: "Pocket P001",
      tool: "12mm 4-Flute End Mill",
      strategy: "Adaptive Clearing",
      stepdown: 3,
      stepover: 6,
      feedrate: 1200,
      spindle: 2400,
      estimatedTime: "18 min",
      status: "generated"
    },
    {
      id: "OP002", 
      type: "Finishing",
      feature: "Pocket P001",
      tool: "12mm 4-Flute End Mill", 
      strategy: "Parallel Finishing",
      stepdown: 0.5,
      stepover: 1.2,
      feedrate: 800,
      spindle: 2400,
      estimatedTime: "12 min",
      status: "generated"
    },
    {
      id: "OP003",
      type: "Drilling",
      feature: "Holes H001-H002",
      tool: "6mm HSS Drill",
      strategy: "Peck Drilling",
      stepdown: 2,
      stepover: 0,
      feedrate: 180,
      spindle: 2400,
      estimatedTime: "8 min",
      status: "generated"
    },
    {
      id: "OP004",
      type: "Chamfering", 
      feature: "Chamfer C001",
      tool: "45° Chamfer Mill",
      strategy: "Chamfer Profile",
      stepdown: 1,
      stepover: 0,
      feedrate: 500,
      spindle: 5000,
      estimatedTime: "5 min",
      status: "generated"
    }
  ]);

  const generateToolpaths = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);

    const stages = [
      "Analyzing tool assignments and features...",
      "Computing optimal entry and exit points...", 
      "Generating adaptive roughing strategies...",
      "Calculating precision finishing passes...",
      "Optimizing tool change sequences...",
      "Running collision detection analysis...",
      "Validating feed rates and speeds...",
      "Generating verified G-code output..."
    ];

    try {
      for (let i = 0; i < stages.length; i++) {
        // Simulate realistic processing time
        const delay = 700 + Math.random() * 400;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        setGenerationProgress(((i + 1) / stages.length) * 100);
      }

      setIsGenerating(false);
    } catch (error) {
      console.error('Toolpath generation failed:', error);
      setIsGenerating(false);
    }
  };

  const startSimulation = async () => {
    setIsSimulating(true);
    setSimulationProgress(0);

    try {
      for (let i = 0; i <= 100; i += 2) {
        await new Promise(resolve => setTimeout(resolve, 150));
        setSimulationProgress(i);
      }

      // Calculate realistic results based on operations
      const totalFeatures = toolAssignments.length;
      const uniqueTools = new Set(toolAssignments.map(a => a.toolId || 'default')).size;
      const estimatedTime = operations.reduce((sum, op) => {
        const minutes = parseInt(op.estimatedTime.split(' ')[0]);
        return sum + minutes;
      }, 0);

      const setupTime = uniqueTools * 2; // 2 min per tool change
      const actualTime = estimatedTime + setupTime;

      const results = {
        totalTime: `${actualTime} minutes`,
        machiningTime: estimatedTime,
        setupTime: setupTime,
        toolChanges: uniqueTools,
        operations: totalFeatures,
        totalDistance: (estimatedTime * 85 + Math.random() * 1000).toFixed(1),
        materialRemoved: (totalFeatures * 2.5 + Math.random() * 5).toFixed(1) + " cm³",
        quality: actualTime < 30 ? "Excellent" : actualTime < 60 ? "Good" : "Fair",
        warnings: uniqueTools > 5 ? 2 : Math.random() > 0.7 ? 1 : 0,
        gcode: {
          lines: Math.floor(totalFeatures * 800 + estimatedTime * 50),
          size: (totalFeatures * 45 + estimatedTime * 3.2).toFixed(1) + " KB"
        },
        efficiency: Math.min(95, 70 + (30 - actualTime) / 2)
      };

      setIsSimulating(false);
      onSimulationComplete(results);
    } catch (error) {
      console.error('Simulation failed:', error);
      setIsSimulating(false);
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case "Roughing": return "🔨";
      case "Finishing": return "✨";
      case "Drilling": return "⚫";
      case "Chamfering": return "◣";
      default: return "🔧";
    }
  };

  const totalEstimatedTime = operations.reduce((total, op) => {
    const minutes = parseInt(op.estimatedTime.split(' ')[0]);
    return total + minutes;
  }, 0);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Toolpath Generation</h2>
            <p className="text-muted-foreground">
              Generate optimized toolpaths for {toolAssignments.length} operations
            </p>
          </div>
          <Badge variant="outline" className="bg-primary/10">
            {operations.length} Operations
          </Badge>
        </div>

        {!isGenerating && generationProgress === 0 && (
          <div className="text-center py-12">
            <Route className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Ready to Generate Toolpaths</h3>
            <p className="text-muted-foreground mb-6">
              Physics-aware optimization will create efficient machining strategies
            </p>
            <Button onClick={generateToolpaths} className="bg-gradient-primary hover:shadow-medium transition-spring">
              <Zap className="w-5 h-5 mr-2" />
              Generate Toolpaths
            </Button>
          </div>
        )}

        {isGenerating && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Generating toolpaths...</span>
              <span>{generationProgress}%</span>
            </div>
            <Progress value={generationProgress} className="h-3" />
            <p className="text-xs text-muted-foreground text-center">
              Optimizing tool movements and calculating material removal rates
            </p>
          </div>
        )}

        {generationProgress === 100 && (
          <Tabs defaultValue="operations" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="simulation">Simulation</TabsTrigger>
              <TabsTrigger value="parameters">Parameters</TabsTrigger>
            </TabsList>

            <TabsContent value="operations" className="space-y-4">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  {operations.map((operation, index) => (
                    <Card 
                      key={operation.id}
                      className={`p-4 cursor-pointer transition-all hover:shadow-soft ${
                        selectedOperation === index ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedOperation(index)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg">{getOperationIcon(operation.type)}</span>
                          <div>
                            <h4 className="font-semibold">{operation.id} - {operation.type}</h4>
                            <p className="text-sm text-muted-foreground">
                              {operation.feature} • {operation.tool}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-success text-success-foreground mb-1">
                            {operation.estimatedTime}
                          </Badge>
                          <p className="text-xs text-muted-foreground">{operation.strategy}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="p-4">
                  <h3 className="font-semibold mb-4">Operation Details</h3>
                  {operations[selectedOperation] && (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium">{operations[selectedOperation].id}</h4>
                        <p className="text-sm text-muted-foreground">{operations[selectedOperation].strategy}</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Stepdown:</span>
                          <span>{operations[selectedOperation].stepdown}mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stepover:</span>
                          <span>{operations[selectedOperation].stepover}mm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Feedrate:</span>
                          <span>{operations[selectedOperation].feedrate} mm/min</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spindle:</span>
                          <span>{operations[selectedOperation].spindle} RPM</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full">
                        <Settings className="w-4 h-4 mr-2" />
                        Edit Parameters
                      </Button>
                    </div>
                  )}
                </Card>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="font-semibold">Total Time: {totalEstimatedTime} minutes</span>
                  </div>
                  <Badge variant="outline" className="bg-warning/10">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    1 Warning
                  </Badge>
                </div>
                <Button onClick={startSimulation} className="bg-gradient-primary hover:shadow-medium transition-spring">
                  <Play className="w-4 h-4 mr-2" />
                  Run Simulation
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="simulation">
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-xl font-semibold mb-2">CNC Simulation</h3>
                  <p className="text-muted-foreground">
                    Real-time material removal with toolpath visualization
                  </p>
                </div>

                <div className="h-[600px]">
                  <MaterialRemovalSimulation 
                    operations={operations.map(op => ({
                      id: op.id,
                      type: op.type.toLowerCase() as 'roughing' | 'finishing' | 'drilling' | 'chamfering',
                      name: op.id + ' - ' + op.type,
                      tool: op.tool,
                      feature: op.feature,
                      duration: parseInt(op.estimatedTime.split(' ')[0]) / 10, // Scale down for demo
                      toolpath: []
                    }))}
                    onSimulationComplete={() => {
                      const totalFeatures = toolAssignments.length;
                      const uniqueTools = new Set(toolAssignments.map(a => a.toolId || 'default')).size;
                      const estimatedTime = operations.reduce((sum, op) => {
                        const minutes = parseInt(op.estimatedTime.split(' ')[0]);
                        return sum + minutes;
                      }, 0);

                      const setupTime = uniqueTools * 2;
                      const actualTime = estimatedTime + setupTime;

                      const results = {
                        totalTime: `${actualTime} minutes`,
                        machiningTime: estimatedTime,
                        setupTime: setupTime,
                        toolChanges: uniqueTools,
                        operations: totalFeatures,
                        totalDistance: (estimatedTime * 85 + Math.random() * 1000).toFixed(1),
                        materialRemoved: (totalFeatures * 2.5 + Math.random() * 5).toFixed(1) + " cm³",
                        quality: actualTime < 30 ? "Excellent" : actualTime < 60 ? "Good" : "Fair",
                        warnings: uniqueTools > 5 ? 2 : Math.random() > 0.7 ? 1 : 0,
                        gcode: {
                          lines: Math.floor(totalFeatures * 800 + estimatedTime * 50),
                          size: (totalFeatures * 45 + estimatedTime * 3.2).toFixed(1) + " KB"
                        },
                        efficiency: Math.min(95, 70 + (30 - actualTime) / 2)
                      };

                      onSimulationComplete(results);
                    }}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="parameters">
              <Card className="p-6">
                <h3 className="text-xl font-semibold mb-6">Override Parameters</h3>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-medium mb-4 block">
                        Feedrate Override: {feedrateOverride[0]}%
                      </label>
                      <Slider
                        value={feedrateOverride}
                        onValueChange={setFeedrateOverride}
                        max={200}
                        min={10}
                        step={5}
                        className="w-full"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium mb-4 block">
                        Spindle Override: {spindleOverride[0]}%
                      </label>
                      <Slider
                        value={spindleOverride}
                        onValueChange={setSpindleOverride}
                        max={150}
                        min={50}
                        step={5}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="font-semibold mb-2">Current Settings</h4>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span>Adjusted Feedrate:</span>
                          <span>{Math.round(1200 * feedrateOverride[0] / 100)} mm/min</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Adjusted Spindle:</span>
                          <span>{Math.round(2400 * spindleOverride[0] / 100)} RPM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Est. Time Change:</span>
                          <span className={`${feedrateOverride[0] > 100 ? 'text-success' : 'text-warning'}`}>
                            {feedrateOverride[0] > 100 ? '-' : '+'}
                            {Math.abs(Math.round((100 - feedrateOverride[0]) * 0.43))} min
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button className="w-full bg-gradient-primary hover:shadow-medium transition-spring">
                      <Download className="w-4 h-4 mr-2" />
                      Export G-Code
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </Card>
    </div>
  );
};

export default ToolpathGeneration;