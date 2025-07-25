import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, Wrench, Settings, CheckCircle } from "lucide-react";

interface Tool {
  id: string;
  name: string;
  type: "end_mill" | "drill" | "chamfer" | "reamer" | "tap";
  diameter: number;
  length: number;
  flutes: number;
  material: "HSS" | "Carbide" | "Ceramic";
  coating: string;
  maxRPM: number;
  feedRate: number;
  stepdown: number;
  manufacturer: string;
  partNumber: string;
  cost: number;
  inStock: boolean;
  compatibility: string[];
}

interface ToolLibraryProps {
  selectedFeatures: any[];
  onToolsAssigned: (assignments: any[]) => void;
}

const ToolLibrary = ({ selectedFeatures, onToolsAssigned }: ToolLibraryProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [toolAssignments, setToolAssignments] = useState<Record<string, string>>({});

  const tools: Tool[] = [
    {
      id: "EM_12_4F",
      name: "12mm 4-Flute End Mill",
      type: "end_mill",
      diameter: 12,
      length: 75,
      flutes: 4,
      material: "Carbide",
      coating: "TiAlN",
      maxRPM: 3000,
      feedRate: 1200,
      stepdown: 3,
      manufacturer: "Sandvik",
      partNumber: "R216.42-12030-AK26N",
      cost: 89.50,
      inStock: true,
      compatibility: ["pocket", "slot"]
    },
    {
      id: "EM_8_3F", 
      name: "8mm 3-Flute End Mill",
      type: "end_mill",
      diameter: 8,
      length: 60,
      flutes: 3,
      material: "Carbide",
      coating: "TiCN",
      maxRPM: 4500,
      feedRate: 900,
      stepdown: 2,
      manufacturer: "Kennametal",
      partNumber: "B051A080075M06",
      cost: 67.25,
      inStock: true,
      compatibility: ["pocket", "slot"]
    },
    {
      id: "DR_6_HSS",
      name: "6mm HSS Drill",
      type: "drill", 
      diameter: 6,
      length: 100,
      flutes: 2,
      material: "HSS",
      coating: "TiN",
      maxRPM: 2400,
      feedRate: 180,
      stepdown: 6,
      manufacturer: "Guhring",
      partNumber: "5512-6.000",
      cost: 23.75,
      inStock: true,
      compatibility: ["hole"]
    },
    {
      id: "DR_8_CARB",
      name: "8mm Carbide Drill",
      type: "drill",
      diameter: 8,
      length: 120,
      flutes: 2,
      material: "Carbide",
      coating: "AlCrN",
      maxRPM: 3200,
      feedRate: 320,
      stepdown: 8,
      manufacturer: "OSG",
      partNumber: "EX-SUS-GDR-8.0",
      cost: 45.90,
      inStock: false,
      compatibility: ["hole"]
    },
    {
      id: "CM_45_6",
      name: "45° Chamfer Mill 6mm",
      type: "chamfer",
      diameter: 6,
      length: 50,
      flutes: 6,
      material: "Carbide",
      coating: "Diamond",
      maxRPM: 5000,
      feedRate: 500,
      stepdown: 1,
      manufacturer: "Harvey Tool",
      partNumber: "29284-C2",
      cost: 156.80,
      inStock: true,
      compatibility: ["chamfer"]
    }
  ];

  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.partNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || tool.type === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleToolAssignment = (featureId: string, toolId: string) => {
    setToolAssignments(prev => ({
      ...prev,
      [featureId]: toolId
    }));
  };

  const handleProceedToToolpaths = () => {
    // Auto-assign tools if none selected
    if (Object.keys(toolAssignments).length === 0) {
      const autoAssignments = selectedFeatures.map(feature => {
        const suitableTools = tools.filter(tool => 
          tool.compatibility.includes(feature.type)
        );
        const bestTool = suitableTools[0] || tools[0];
        
        return {
          id: `${feature.id}-${bestTool.id}`,
          featureId: feature.id,
          toolId: bestTool.id,
          toolName: bestTool.name,
          featureType: feature.type,
          strategy: getDefaultStrategy(feature.type),
          parameters: getDefaultParameters(bestTool, feature),
          estimatedTime: calculateEstimatedTime(bestTool, feature)
        };
      });
      
      onToolsAssigned(autoAssignments);
    } else {
      const assignments = selectedFeatures.map(feature => {
        const toolId = toolAssignments[feature.id];
        const tool = tools.find(t => t.id === toolId);
        
        return {
          id: `${feature.id}-${toolId}`,
          featureId: feature.id,
          toolId: toolId,
          toolName: tool?.name || 'Unknown Tool',
          featureType: feature.type,
          strategy: getDefaultStrategy(feature.type),
          parameters: tool ? getDefaultParameters(tool, feature) : {},
          estimatedTime: tool ? calculateEstimatedTime(tool, feature) : 0
        };
      }).filter(assignment => assignment.toolName !== 'Unknown Tool');
      
      onToolsAssigned(assignments);
    }
  };

  const getDefaultParameters = (tool: Tool, feature: any) => {
    const baseSpeed = tool.maxRPM * 0.6;
    const baseFeed = baseSpeed * tool.flutes * 0.1;
    
    return {
      spindleSpeed: Math.round(baseSpeed),
      feedRate: Math.round(baseFeed),
      stepdown: Math.min(tool.diameter * 0.3, feature.dimensions?.depth || tool.diameter),
      stepover: tool.diameter * 0.4
    };
  };

  const calculateEstimatedTime = (tool: Tool, feature: any) => {
    const volume = feature.dimensions ? 
      Object.values(feature.dimensions).reduce((a: number, b: any) => a * Number(b), 1) : 100;
    const mrr = tool.diameter * 0.5; // Material removal rate approximation
    return Math.round((Number(volume) / mrr) * 1.5 + Math.random() * 5);
  };

  const getDefaultStrategy = (featureType: string) => {
    const strategies = {
      pocket: "Adaptive Clearing",
      hole: "Peck Drilling", 
      slot: "Slot Milling",
      chamfer: "Chamfer Profile",
      step: "2.5D Contour"
    };
    return strategies[featureType] || "Standard";
  };

  const getToolTypeIcon = (type: string) => {
    switch (type) {
      case "end_mill": return "🔧";
      case "drill": return "⚫";
      case "chamfer": return "◣";
      case "reamer": return "🔹";
      case "tap": return "🌀";
      default: return "🔨";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Tool Assignment</h2>
            <p className="text-muted-foreground">
              Match optimal tools to {selectedFeatures.length} selected features
            </p>
          </div>
          <Badge variant="outline" className="bg-warning/10">
            {Object.keys(toolAssignments).length}/{selectedFeatures.length} Assigned
          </Badge>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Feature Assignment Panel */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Feature Assignment</h3>
            {selectedFeatures.map((feature) => (
              <Card key={feature.id} className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold">{feature.id}</h4>
                    <p className="text-sm text-muted-foreground capitalize">
                      {feature.type} • {Object.entries(feature.dimensions).map(([k, v]) => `${k}: ${v}mm`).join(", ")}
                    </p>
                  </div>
                  {toolAssignments[feature.id] && (
                    <CheckCircle className="w-5 h-5 text-success" />
                  )}
                </div>
                
                {toolAssignments[feature.id] ? (
                  <div className="bg-success/10 p-3 rounded-lg">
                    <p className="font-medium text-success">
                      {tools.find(t => t.id === toolAssignments[feature.id])?.name}
                    </p>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setToolAssignments(prev => {
                        const newAssignments = { ...prev };
                        delete newAssignments[feature.id];
                        return newAssignments;
                      })}
                    >
                      Change Tool
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Compatible Tools:</p>
                    {filteredTools
                      .filter(tool => tool.compatibility.includes(feature.type))
                      .slice(0, 3)
                      .map(tool => (
                        <Button
                          key={tool.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleToolAssignment(feature.id, tool.id)}
                        >
                          <span className="mr-2">{getToolTypeIcon(tool.type)}</span>
                          {tool.name}
                          <Badge variant="outline" className="ml-auto">
                            {tool.inStock ? "In Stock" : "Order"}
                          </Badge>
                        </Button>
                      ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Tool Library Panel */}
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search tools..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="all">All Tools</TabsTrigger>
                <TabsTrigger value="end_mill">End Mills</TabsTrigger>
                <TabsTrigger value="drill">Drills</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedCategory} className="space-y-2 max-h-96 overflow-y-auto">
                {filteredTools.map((tool) => (
                  <Card key={tool.id} className="p-4 hover:shadow-soft transition-spring">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-lg">{getToolTypeIcon(tool.type)}</span>
                          <h4 className="font-semibold">{tool.name}</h4>
                          <Badge variant={tool.inStock ? "default" : "destructive"}>
                            {tool.inStock ? "In Stock" : "Order"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div>Ø{tool.diameter}mm • {tool.flutes}F</div>
                          <div>{tool.material} • {tool.coating}</div>
                          <div>{tool.maxRPM} RPM max</div>
                          <div>${tool.cost}</div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {tool.manufacturer} • {tool.partNumber}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="flex justify-between items-center mt-6 pt-6 border-t">
          <div className="text-sm text-muted-foreground">
            <p>{Object.keys(toolAssignments).length} features assigned</p>
            <p>Estimated tool cost: ${tools.filter(t => Object.values(toolAssignments).includes(t.id)).reduce((sum, t) => sum + t.cost, 0).toFixed(2)}</p>
          </div>
          <Button
            onClick={handleProceedToToolpaths}
            disabled={Object.keys(toolAssignments).length !== selectedFeatures.length}
            className="bg-gradient-primary hover:shadow-medium transition-spring"
          >
            Generate Toolpaths
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ToolLibrary;