import { useState } from "react";
import Header from "@/components/Header";
import FileUpload from "@/components/FileUpload";
import FeatureDetection from "@/components/FeatureDetection";
import ToolLibrary from "@/components/ToolLibrary";
import ToolpathGeneration from "@/components/ToolpathGeneration";
import SimulationResults from "@/components/SimulationResults";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

type WorkflowStep = "upload" | "features" | "tools" | "toolpaths" | "results";

const Workspace = () => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("upload");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<any[]>([]);
  const [toolAssignments, setToolAssignments] = useState<any[]>([]);
  const [simulationResults, setSimulationResults] = useState<any>(null);

  const steps: { key: WorkflowStep; label: string; description: string }[] = [
    { key: "upload", label: "Upload", description: "Load STEP file" },
    { key: "features", label: "Features", description: "AI detection" },
    { key: "tools", label: "Tools", description: "Assignment" },
    { key: "toolpaths", label: "Toolpaths", description: "Generation" },
    { key: "results", label: "Results", description: "Export" }
  ];

  const currentStepIndex = steps.findIndex(step => step.key === currentStep);
  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

  const handleFileUploaded = (file: File, results: any) => {
    setUploadedFile(file);
    setAnalysisResults(results);
    setCurrentStep("features");
  };

  const handleFeaturesSelected = (features: any[]) => {
    setSelectedFeatures(features);
    setCurrentStep("tools");
  };

  const handleToolsAssigned = (assignments: any[]) => {
    setToolAssignments(assignments);
    setCurrentStep("toolpaths");
  };

  const handleSimulationComplete = (results: any) => {
    setSimulationResults(results);
    setCurrentStep("results");
  };

  const handleExport = () => {
    // Implementation for export functionality
    console.log("Exporting project...");
  };

  const handleStartOver = () => {
    setCurrentStep("upload");
    setUploadedFile(null);
    setAnalysisResults(null);
    setSelectedFeatures([]);
    setToolAssignments([]);
    setSimulationResults(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold">Machining Workflow</h1>
            <Badge variant="outline" className="bg-primary/10">
              Step {currentStepIndex + 1} of {steps.length}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-4 mb-4">
            {steps.map((step, index) => (
              <div 
                key={step.key}
                className={`flex items-center space-x-2 ${
                  index < currentStepIndex ? 'text-success' :
                  index === currentStepIndex ? 'text-primary' :
                  'text-muted-foreground'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  index < currentStepIndex ? 'bg-success text-success-foreground' :
                  index === currentStepIndex ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <div className="hidden sm:block">
                  <p className="font-semibold">{step.label}</p>
                  <p className="text-xs">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className={`hidden sm:block w-8 h-0.5 ${
                    index < currentStepIndex ? 'bg-success' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
          
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Current Step Content */}
        <div className="space-y-6">
          {currentStep === "upload" && (
            <FileUpload onFileUploaded={handleFileUploaded} />
          )}
          
          {currentStep === "features" && analysisResults && (
            <FeatureDetection 
              analysisResults={analysisResults}
              onFeaturesSelected={handleFeaturesSelected}
            />
          )}
          
          {currentStep === "tools" && selectedFeatures.length > 0 && (
            <ToolLibrary 
              selectedFeatures={selectedFeatures}
              onToolsAssigned={handleToolsAssigned}
            />
          )}
          
          {currentStep === "toolpaths" && toolAssignments.length > 0 && (
            <ToolpathGeneration 
              toolAssignments={toolAssignments}
              onSimulationComplete={handleSimulationComplete}
            />
          )}
          
          {currentStep === "results" && simulationResults && (
            <SimulationResults 
              results={simulationResults}
              onExport={handleExport}
              onStartOver={handleStartOver}
            />
          )}
        </div>

        {/* File Info Sidebar (when file is loaded) */}
        {uploadedFile && currentStep !== "upload" && (
          <div className="fixed bottom-4 right-4 w-80">
            <div className="bg-card border border-border rounded-lg p-4 shadow-strong">
              <h3 className="font-semibold mb-2">Current Project</h3>
              <p className="text-sm font-medium">{uploadedFile.name}</p>
              <p className="text-xs text-muted-foreground mb-3">
                {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {analysisResults && (
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Features:</span>
                    <span>{String(Object.values(analysisResults.features).reduce((a: number, b: unknown) => a + Number(b), 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Volume:</span>
                    <span>{analysisResults.geometry.volume} cm³</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Material:</span>
                    <span>{analysisResults.materials[0]}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Workspace;