import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import STLLoaderComponent from "./STLLoader";
import * as THREE from 'three';

interface FileUploadProps {
  onFileUploaded: (file: File, analysisResults: any, features?: any[]) => void;
}

const FileUpload = ({ onFileUploaded }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analyzedFeatures, setAnalyzedFeatures] = useState<any[] | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  const { toast } = useToast();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const stlFile = files.find(file => 
      file.name.toLowerCase().endsWith('.stl')
    );
    
    if (stlFile) {
      processFile(stlFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload an STL (.stl) file",
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
    setAnalyzedFeatures(null);
    setAnalysisResults(null);

    try {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.stl')) {
        throw new Error('Invalid file type. Please upload an STL (.stl) file.');
      }

      // Start with basic file loading progress
      setUploadProgress(25);
      
      // The actual STL loading and analysis will happen in the STLLoaderComponent
      // We'll wait for the analysis to complete via callbacks

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

  const handleGeometryLoaded = (geometry: THREE.BufferGeometry) => {
    console.log('FileUpload: STL geometry loaded');
    setUploadProgress(75);
  };

  const handleFeaturesAnalyzed = (features: any[], results: any) => {
    console.log('FileUpload: Features analyzed:', features.length);
    setAnalyzedFeatures(features);
    setAnalysisResults(results);
    setUploadProgress(100);
    setIsProcessing(false);
    
    // Call the parent callback with the real analysis results
    onFileUploaded(uploadedFile!, results, features);
    
    const totalFeatures = Object.values(results.features).reduce((a: any, b: any) => Number(a) + Number(b), 0);
    toast({
      title: "Analysis Complete",
      description: `Successfully processed ${uploadedFile?.name} with ${totalFeatures} features detected.`,
    });
  };

  const handleAnalysisError = (error: string) => {
    console.error('FileUpload: Analysis error:', error);
    toast({
      title: "Analysis Failed",
      description: error,
      variant: "destructive",
    });
    setIsProcessing(false);
    setUploadedFile(null);
    setUploadProgress(0);
  };

  return (
    <Card className="p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Upload STL File</h2>
        <p className="text-muted-foreground">
          Drag and drop your STL file or click to browse
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
            Drop your 3D file here
          </p>
          <p className="text-muted-foreground mb-4">
            Supports .stl files up to 100MB
          </p>
          <Button onClick={() => document.getElementById('file-input')?.click()}>
            Browse Files
          </Button>
          <input
            id="file-input"
            type="file"
            accept=".stl"
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
              setAnalyzedFeatures(null);
              setAnalysisResults(null);
            }}
            className="w-full"
          >
            Upload Different File
          </Button>
          
          {/* STL Loader Component */}
          {uploadedFile && uploadedFile.name.toLowerCase().endsWith('.stl') && (
            <STLLoaderComponent
              file={uploadedFile}
              onGeometryLoaded={handleGeometryLoaded}
              onError={handleAnalysisError}
              onFeaturesAnalyzed={handleFeaturesAnalyzed}
            />
          )}
        </div>
      )}
    </Card>
  );
};

export default FileUpload;