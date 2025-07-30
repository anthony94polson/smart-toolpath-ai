import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Upload, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  FileCode,
  Zap,
  Brain,
  Settings
} from 'lucide-react';
import { modelConverterService, type ConversionRequest, type ModelInfo } from '../services/ModelConverterService';
import { useToast } from '@/hooks/use-toast';

export const ModelConverter: React.FC = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [conversionSettings, setConversionSettings] = useState<ConversionRequest>({
    modelName: 'weight_88-epoch',
    inputShape: [1, 3, 512, 512],
    outputFormat: 'onnx'
  });

  const { toast } = useToast();

  React.useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setIsLoading(true);
    try {
      const result = await modelConverterService.listModels();
      if (result.success && result.models) {
        setModels(result.models);
        console.log('📋 Loaded models:', result.models);
      } else {
        setError(result.error || 'Failed to load models');
      }
    } catch (error) {
      console.error('❌ Failed to load models:', error);
      setError('Failed to load models');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pth')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PyTorch (.pth) model file",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      console.log(`📤 Uploading model: ${file.name}`);
      
      const uploadResult = await modelConverterService.uploadPyTorchModel(file);
      
      if (uploadResult.success) {
        toast({
          title: "Upload successful",
          description: `${file.name} has been uploaded to storage`,
        });
        
        // Refresh models list
        await loadModels();
        
        // Set as selected model for conversion
        setSelectedModel(file.name);
        setConversionSettings(prev => ({
          ...prev,
          modelName: file.name.replace('.pth', '')
        }));
        
      } else {
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      setError(`Upload failed: ${error}`);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleConversion = async () => {
    if (!conversionSettings.modelName) {
      toast({
        title: "Model name required",
        description: "Please specify a model name for conversion",
        variant: "destructive"
      });
      return;
    }

    setIsConverting(true);
    setError(null);
    setConversionResult(null);
    setProgress(0);

    try {
      console.log('🔄 Starting model conversion:', conversionSettings);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const result = await modelConverterService.convertModel(conversionSettings);
      
      clearInterval(progressInterval);
      setProgress(100);

      console.log('✅ Conversion completed:', result);
      setConversionResult(result);

      if (result.success) {
        toast({
          title: "Conversion successful",
          description: result.message,
        });
        
        // Refresh models list to show the new ONNX model
        await loadModels();
      } else {
        setError(result.error || 'Conversion failed');
        toast({
          title: "Conversion failed",
          description: result.error || 'Unknown error',
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('❌ Conversion failed:', error);
      setError(`Conversion failed: ${error}`);
      toast({
        title: "Conversion failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsConverting(false);
      setProgress(0);
    }
  };

  const downloadModel = async (fileName: string) => {
    try {
      const url = await modelConverterService.getModelUrl(fileName);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      
      toast({
        title: "Download started",
        description: `Downloading ${fileName}`,
      });
    } catch (error) {
      console.error('❌ Download failed:', error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    }
  };

  const getModelTypeIcon = (type: string) => {
    return type === 'pytorch' ? <Brain className="h-4 w-4" /> : <Zap className="h-4 w-4" />;
  };

  const getModelTypeBadge = (type: string) => {
    return type === 'pytorch' ? (
      <Badge variant="outline" className="bg-blue-50 text-blue-700">PyTorch</Badge>
    ) : (
      <Badge variant="outline" className="bg-green-50 text-green-700">ONNX</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-2 border-blue-200 dark:border-blue-800">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <Brain className="h-8 w-8 text-blue-600" />
            <RefreshCw className="h-6 w-6 text-purple-500" />
            <Zap className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            PyTorch to ONNX Model Converter
          </CardTitle>
          <CardDescription className="text-lg">
            Automatically convert your trained PyTorch models to ONNX format for browser deployment
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="convert" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload">Upload Model</TabsTrigger>
              <TabsTrigger value="convert">Convert</TabsTrigger>
              <TabsTrigger value="manage">Manage Models</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Upload className="h-5 w-5" />
                    <span>Upload PyTorch Model</span>
                  </CardTitle>
                  <CardDescription>
                    Upload your trained .pth model file to prepare for conversion
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                      <FileCode className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium mb-2">
                        Drop your PyTorch model here
                      </p>
                      <p className="text-muted-foreground mb-4">
                        Supports .pth files up to 500MB
                      </p>
                      <Button 
                        onClick={() => document.getElementById('model-file-input')?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? 'Uploading...' : 'Browse Files'}
                      </Button>
                      <input
                        id="model-file-input"
                        type="file"
                        accept=".pth"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {isUploading && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Uploading model...</span>
                          <span>Please wait</span>
                        </div>
                        <Progress value={50} className="h-2" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="convert" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Conversion Settings</span>
                  </CardTitle>
                  <CardDescription>
                    Configure your model conversion parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="model-name">Model Name</Label>
                      <Input
                        id="model-name"
                        value={conversionSettings.modelName}
                        onChange={(e) => setConversionSettings(prev => ({ ...prev, modelName: e.target.value }))}
                        placeholder="weight_88-epoch"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="output-format">Output Format</Label>
                      <Select 
                        value={conversionSettings.outputFormat} 
                        onValueChange={(value) => setConversionSettings(prev => ({ ...prev, outputFormat: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onnx">ONNX</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="input-shape">Input Shape (comma-separated)</Label>
                      <Input
                        id="input-shape"
                        value={conversionSettings.inputShape?.join(', ')}
                        onChange={(e) => {
                          const shape = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                          setConversionSettings(prev => ({ ...prev, inputShape: shape }));
                        }}
                        placeholder="1, 3, 512, 512"
                      />
                    </div>
                  </div>

                  <Button 
                    onClick={handleConversion} 
                    disabled={isConverting || !conversionSettings.modelName}
                    className="w-full"
                  >
                    {isConverting ? 'Converting...' : 'Convert Model'}
                  </Button>

                  {isConverting && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Converting model to ONNX...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  {conversionResult && (
                    <Alert className={conversionResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                      {conversionResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                      <AlertDescription>
                        <div className="space-y-2">
                          <p className="font-medium">{conversionResult.message}</p>
                          {conversionResult.success && conversionResult.fileName && (
                            <div className="text-sm text-muted-foreground">
                              <p>File: {conversionResult.fileName}</p>
                              <p>Size: {(conversionResult.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                              <p>Input Shape: [{conversionResult.inputShape?.join(', ')}]</p>
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manage" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <FileCode className="h-5 w-5" />
                      <span>Model Storage</span>
                    </CardTitle>
                    <CardDescription>
                      Manage your uploaded and converted models
                    </CardDescription>
                  </div>
                  <Button onClick={loadModels} variant="outline" size="sm" disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                      <span>Loading models...</span>
                    </div>
                  ) : models.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileCode className="h-12 w-12 mx-auto mb-4" />
                      <p>No models found. Upload a PyTorch model to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {models.map((model, index) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            {getModelTypeIcon(model.type)}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-medium">{model.name}</span>
                                {getModelTypeBadge(model.type)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {(model.size / 1024 / 1024).toFixed(2)} MB • 
                                Last modified: {new Date(model.lastModified).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <Button 
                            onClick={() => downloadModel(model.name)}
                            variant="outline" 
                            size="sm"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};