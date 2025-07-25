import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  Brain, 
  Wrench, 
  Route, 
  Clock, 
  Play,
  CheckCircle,
  ArrowRight
} from "lucide-react";

const workflowSteps = [
  {
    icon: Upload,
    title: "Load STEP File",
    description: "Import your 3D CAD model",
    status: "completed",
    time: "< 1 min"
  },
  {
    icon: Brain,
    title: "AI Feature Detection",
    description: "Identify machining features",
    status: "completed", 
    time: "2-3 min"
  },
  {
    icon: Wrench,
    title: "Tool Assignment",
    description: "Match optimal tools automatically",
    status: "current",
    time: "1 min"
  },
  {
    icon: Route,
    title: "Toolpath Generation",
    description: "Generate optimized paths",
    status: "pending",
    time: "3-5 min"
  },
  {
    icon: Play,
    title: "Simulation & Export",
    description: "Validate and export to CAM",
    status: "pending",
    time: "2 min"
  }
];

const detectedFeatures = [
  { type: "Pocket", count: 8, color: "bg-primary" },
  { type: "Hole", count: 12, color: "bg-accent" },
  { type: "Slot", count: 4, color: "bg-success" },
  { type: "Chamfer", count: 16, color: "bg-warning" }
];

const WorkflowDemo = () => {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">
            Live Workflow Demo
          </Badge>
          <h2 className="text-4xl font-bold mb-4">
            See MachinaCAM in Action
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Watch as our AI analyzes a complex part and generates 
            complete machining strategies in minutes.
          </p>
        </div>
        
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Workflow Steps */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-primary" />
              Processing Timeline
            </h3>
            <div className="space-y-4">
              {workflowSteps.map((step, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    step.status === 'completed' ? 'bg-success text-success-foreground' :
                    step.status === 'current' ? 'bg-primary text-primary-foreground animate-pulse' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{step.title}</h4>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {step.time}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Overall Progress</span>
                <span>40%</span>
              </div>
              <Progress value={40} className="h-2" />
            </div>
          </Card>
          
          {/* Feature Detection Results */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <Brain className="w-5 h-5 mr-2 text-accent" />
              Detected Features
            </h3>
            <div className="space-y-4">
              {detectedFeatures.map((feature, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${feature.color}`}></div>
                    <span className="font-medium">{feature.type}</span>
                  </div>
                  <Badge variant="secondary">{feature.count} found</Badge>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold text-sm mb-2">Processing Status</h4>
              <p className="text-xs text-muted-foreground">
                Analyzing geometric patterns and grouping faces into feature instances. 
                Tool matching in progress based on feature characteristics.
              </p>
            </div>
          </Card>
          
          {/* Tool Assignment */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-6 flex items-center">
              <Wrench className="w-5 h-5 mr-2 text-success" />
              Tool Assignment
            </h3>
            <div className="space-y-4">
              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-sm">Ø12mm End Mill</h4>
                  <Badge className="bg-success text-success-foreground">Matched</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  For 8 pocket features • HSS, 4-flute
                </p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Speed:</span>
                    <span>2,400 RPM</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Feed:</span>
                    <span>960 mm/min</span>
                  </div>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-sm">Ø6mm Drill</h4>
                  <Badge variant="outline">Processing</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  For 12 hole features • Carbide
                </p>
              </div>
            </div>
            
            <Button className="w-full mt-6 bg-gradient-primary hover:shadow-medium transition-spring">
              Continue to Toolpath Generation
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default WorkflowDemo;