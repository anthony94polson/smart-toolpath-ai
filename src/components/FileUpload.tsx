import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  onFileUploaded: (file: File, analysisResults: any) => void;
}

const FileUpload = ({ onFileUploaded }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const { toast } = useToast();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const stepFile = files.find(file => 
      file.name.toLowerCase().endsWith('.step') || 
      file.name.toLowerCase().endsWith('.stp')
    );
    
    if (stepFile) {
      processFile(stepFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a STEP (.step or .stp) file",
        variant: "destructive"
      });
    }
  }, [toast]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setUploadedFile(file);
    setIsProcessing(true);
    setUploadProgress(0);

    try {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.step') && !file.name.toLowerCase().endsWith('.stp')) {
        throw new Error('Invalid file type. Please upload a STEP (.step or .stp) file.');
      }

      // Realistic file processing simulation
      const stages = [
        { progress: 15, delay: 600 },
        { progress: 35, delay: 800 },
        { progress: 55, delay: 1000 },
        { progress: 75, delay: 800 },
        { progress: 90, delay: 600 },
        { progress: 100, delay: 400 }
      ];

      for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, stage.delay));
        setUploadProgress(stage.progress);
      }

      // Generate realistic analysis results
      const fileSize = file.size / (1024 * 1024); // MB
      const complexity = fileSize > 10 ? "High" : fileSize > 5 ? "Medium" : "Low";
      
      const mockResults = {
        fileName: file.name,
        fileSize: file.size,
        features: {
          pocket: Math.floor(Math.random() * 3 + 2),
          hole: Math.floor(Math.random() * 6 + 3),
          slot: Math.floor(Math.random() * 3 + 1),
          chamfer: Math.floor(Math.random() * 5 + 2),
          step: Math.floor(Math.random() * 3 + 1)
        },
        geometry: {
          boundingBox: { 
            x: (Math.random() * 50 + 80).toFixed(1), 
            y: (Math.random() * 30 + 50).toFixed(1), 
            z: (Math.random() * 20 + 15).toFixed(1) 
          },
          volume: (fileSize * 20 + Math.random() * 100).toFixed(1),
          surfaceArea: (fileSize * 50 + Math.random() * 200).toFixed(1)
        },
        materials: ["Aluminum 6061-T6", "Steel 1018", "Stainless 316L"][Math.floor(Math.random() * 3)],
        complexity,
        confidence: (0.85 + Math.random() * 0.1).toFixed(2),
        estimatedTime: (fileSize * 15 + Math.random() * 30 + 20).toFixed(0) + " minutes",
        timestamp: new Date().toISOString()
      };

      setIsProcessing(false);
      onFileUploaded(file, mockResults);
      
      const totalFeatures = Object.values(mockResults.features).reduce((a, b) => Number(a) + Number(b), 0);
      toast({
        title: "Analysis Complete",
        description: `Successfully processed ${file.name} with ${totalFeatures} features detected.`,
      });

    } catch (error: any) {
      console.error('File processing failed:', error);
      toast({
        title: "Processing Failed",
        description: error.message || "There was an error processing your file. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
      setUploadedFile(null);
      setUploadProgress(0);
    }
  };

  return (
    <Card className="p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Upload STEP File</h2>
        <p className="text-muted-foreground">
          Drag and drop your STEP file or click to browse
        </p>
      </div>

      {!uploadedFile ? (
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging 
              ? "border-primary bg-primary/5" 
              : "border-border hover:border-primary/50"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">
            Drop your STEP file here
          </p>
          <p className="text-muted-foreground mb-4">
            Supports .step and .stp files up to 100MB
          </p>
          <Button onClick={() => document.getElementById('file-input')?.click()}>
            Browse Files
          </Button>
          <input
            id="file-input"
            type="file"
            accept=".step,.stp"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center space-x-4 p-4 bg-muted rounded-lg">
            <FileText className="w-8 h-8 text-primary" />
            <div className="flex-1">
              <h3 className="font-semibold">{uploadedFile.name}</h3>
              <p className="text-sm text-muted-foreground">
                {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            {isProcessing ? (
              <AlertCircle className="w-6 h-6 text-warning animate-pulse" />
            ) : (
              <CheckCircle className="w-6 h-6 text-success" />
            )}
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing file...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Analyzing geometry and detecting machining features
              </p>
            </div>
          )}

          <Button 
            variant="outline" 
            onClick={() => {
              setUploadedFile(null);
              setUploadProgress(0);
              setIsProcessing(false);
            }}
            className="w-full"
          >
            Upload Different File
          </Button>
        </div>
      )}
    </Card>
  );
};

export default FileUpload;