import { Button } from "@/components/ui/button";
import { Upload, Settings, HelpCircle } from "lucide-react";

const Header = () => {
  return (
    <header className="bg-card border-b border-border shadow-soft">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-gradient-primary rounded-md flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">M</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">MachinaCAM</h1>
        </div>
        
        <nav className="hidden md:flex items-center space-x-6">
          <a href="#features" className="text-muted-foreground hover:text-foreground transition-smooth">Features</a>
          <a href="#workflow" className="text-muted-foreground hover:text-foreground transition-smooth">Workflow</a>
          <a href="#tools" className="text-muted-foreground hover:text-foreground transition-smooth">Tools</a>
        </nav>
        
        <div className="flex items-center space-x-3">
          <Button variant="ghost" size="sm">
            <HelpCircle className="w-4 h-4 mr-2" />
            Help
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button size="sm" className="bg-gradient-primary hover:shadow-medium transition-spring">
            <Upload className="w-4 h-4 mr-2" />
            <a href="/workspace" className="text-primary-foreground">Upload STEP</a>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;