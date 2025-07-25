import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Zap, Settings, Play } from "lucide-react";
import heroImage from "@/assets/hero-cam.jpg";

const HeroSection = () => {
  return (
    <section className="relative py-20 bg-gradient-to-br from-background to-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl font-bold leading-tight">
                Intelligent{" "}
                <span className="bg-gradient-primary bg-clip-text text-transparent">
                  Feature Recognition
                </span>{" "}
                for Advanced CAM
              </h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Automatically detect machining features in 3D CAD models using AI. 
                Generate optimized toolpaths, estimate cycle times, and simulate 
                machining operations with physics-aware precision.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-gradient-primary hover:shadow-medium transition-spring">
                <Upload className="w-5 h-5 mr-2" />
                Upload STEP File
              </Button>
              <Button variant="outline" size="lg" className="hover:bg-muted transition-smooth">
                <Play className="w-5 h-5 mr-2" />
                Watch Demo
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-6 pt-8">
              <Card className="p-4 text-center hover:shadow-soft transition-spring">
                <Zap className="w-8 h-8 mx-auto mb-2 text-accent" />
                <h3 className="font-semibold text-sm">AI Recognition</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Machine learning powered feature detection
                </p>
              </Card>
              <Card className="p-4 text-center hover:shadow-soft transition-spring">
                <Settings className="w-8 h-8 mx-auto mb-2 text-success" />
                <h3 className="font-semibold text-sm">Smart Toolpaths</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Physics-aware optimization and strategies
                </p>
              </Card>
              <Card className="p-4 text-center hover:shadow-soft transition-spring">
                <Play className="w-8 h-8 mx-auto mb-2 text-warning" />
                <h3 className="font-semibold text-sm">CNC Simulation</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Virtual material removal preview
                </p>
              </Card>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-tech rounded-2xl opacity-20 blur-3xl"></div>
            <Card className="relative overflow-hidden shadow-strong">
              <img 
                src={heroImage} 
                alt="CAM Feature Recognition Interface" 
                className="w-full h-[400px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-card-foreground font-semibold mb-1">
                  Feature Detection in Progress
                </h3>
                <p className="text-muted-foreground text-sm">
                  Identifying pockets, holes, and machining features
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;