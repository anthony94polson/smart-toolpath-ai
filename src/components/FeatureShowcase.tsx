import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  Database, 
  Zap, 
  Clock, 
  Eye, 
  Download,
  ChevronRight,
  Target,
  Wrench,
  Activity
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Feature Recognition",
    description: "Advanced machine learning automatically identifies pockets, holes, slots, chamfers, and steps in STEP files",
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    icon: Database,
    title: "Comprehensive Tool Library",
    description: "Built-in database of cutting tools with detailed parameters, holders, and optimized cutting strategies",
    color: "text-accent",
    bgColor: "bg-accent/10"
  },
  {
    icon: Zap,
    title: "Smart Toolpath Generation",
    description: "Physics-aware optimization generates efficient toolpaths with proper step-downs and entry points",
    color: "text-success",
    bgColor: "bg-success/10"
  },
  {
    icon: Clock,
    title: "Intelligent Time Estimation",
    description: "Accurate cycle time predictions based on tooling characteristics and machining strategies",
    color: "text-warning",
    bgColor: "bg-warning/10"
  },
  {
    icon: Eye,
    title: "Visual CNC Simulation",
    description: "Real-time material removal simulation acts as a digital twin for path validation",
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    icon: Download,
    title: "Seamless CAM Export",
    description: "Export machining plans with preserved geometry, setups, and tooling for downstream workflows",
    color: "text-accent",
    bgColor: "bg-accent/10"
  }
];

const FeatureShowcase = () => {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">
            Advanced Capabilities
          </Badge>
          <h2 className="text-4xl font-bold mb-4">
            Complete CAM Workflow Automation
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From feature recognition to toolpath generation, our AI-powered platform 
            handles every aspect of modern CNC machining preparation.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <Card key={index} className="p-6 hover:shadow-medium transition-spring group">
              <div className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-spring`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </Card>
          ))}
        </div>
        
        <div className="bg-gradient-tech rounded-2xl p-8 text-center">
          <div className="max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-primary-foreground mb-4">
              Ready to Transform Your Manufacturing Workflow?
            </h3>
            <p className="text-primary-foreground/80 mb-6">
              Join leading manufacturers using AI-powered feature recognition 
              to reduce programming time and optimize machining operations.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="secondary" size="lg" className="hover:shadow-medium transition-spring">
                <Target className="w-5 h-5 mr-2" />
                Start Free Trial
              </Button>
              <Button variant="outline" size="lg" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10">
                <Activity className="w-5 h-5 mr-2" />
                View Technical Demo
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeatureShowcase;