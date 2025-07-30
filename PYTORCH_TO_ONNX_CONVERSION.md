# Convert PyTorch (.pth) Model to ONNX for Browser Use

## Overview
Your `weight_88-epoch.pth` PyTorch model needs to be converted to ONNX format to run in the browser using ONNX.js.

## Conversion Steps

### 1. Install Required Dependencies
```bash
pip install torch torchvision onnx onnxruntime
```

### 2. Convert Your Model
Create this Python script to convert your model:

```python
import torch
import torch.onnx
import numpy as np

# Load your trained model
model_path = "weight_88-epoch.pth"
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Load the model (adjust this based on your model architecture)
# You'll need to define your model class here
class YourAAGNetModel(torch.nn.Module):
    def __init__(self):
        super(YourAAGNetModel, self).__init__()
        # Define your model architecture here
        # This should match exactly what you used during training
        pass
    
    def forward(self, x):
        # Define your forward pass
        pass

# Initialize the model
model = YourAAGNetModel()

# Load the trained weights
checkpoint = torch.load(model_path, map_location=device)
if isinstance(checkpoint, dict):
    # If checkpoint contains state_dict
    model.load_state_dict(checkpoint['state_dict'] if 'state_dict' in checkpoint else checkpoint)
else:
    # If checkpoint is the model directly
    model = checkpoint

model.eval()

# Define input tensor dimensions (adjust based on your model's input)
# This should match the input your model was trained on
batch_size = 1
channels = 3  # or whatever your model expects
height = 1024  # adjust based on your model
width = 1024   # adjust based on your model

dummy_input = torch.randn(batch_size, channels, height, width)

# Convert to ONNX
onnx_path = "aagnet-model.onnx"
torch.onnx.export(
    model,
    dummy_input,
    onnx_path,
    export_params=True,
    opset_version=11,  # Use opset 11 for better browser compatibility
    do_constant_folding=True,
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={
        'input': {0: 'batch_size'},
        'output': {0: 'batch_size'}
    }
)

print(f"Model converted to ONNX: {onnx_path}")

# Verify the conversion
import onnx
onnx_model = onnx.load(onnx_path)
onnx.checker.check_model(onnx_model)
print("ONNX model verification passed!")

# Test the ONNX model
import onnxruntime as ort
ort_session = ort.InferenceSession(onnx_path)

# Test with dummy input
test_input = dummy_input.numpy()
ort_inputs = {ort_session.get_inputs()[0].name: test_input}
ort_outputs = ort_session.run(None, ort_inputs)

print(f"ONNX model output shape: {ort_outputs[0].shape}")
print("Conversion successful!")
```

### 3. Upload ONNX Model
After conversion, you need to make the ONNX model accessible to your web app:

#### Option A: Serve from Public Directory
1. Copy `aagnet-model.onnx` to your `public/api/models/` directory
2. The model will be accessible at `/api/models/aagnet-model.onnx`

#### Option B: Upload to Supabase Storage
```javascript
// Upload to Supabase storage bucket
const { data, error } = await supabase.storage
  .from('models')
  .upload('aagnet-model.onnx', onnxFile);
```

### 4. Model Requirements
Make sure your conversion script matches:
- **Input format**: Your model's expected input (point cloud, voxel grid, etc.)
- **Output format**: Feature predictions (class, confidence, position, dimensions)
- **Preprocessing**: How STL files are converted to model input
- **Postprocessing**: How model outputs are interpreted

### 5. Update Input Preprocessing
In `src/services/OnnxAAGNetService.ts`, update the `preprocessSTL` method to match your model's training data format:

```typescript
private async preprocessSTL(stlData: ArrayBuffer): Promise<ort.Tensor> {
  // Parse STL file
  const stlParser = new STLParser();
  const triangles = stlParser.parse(stlData);
  
  // Convert to your model's input format
  // This depends on how you trained your model:
  // - Point cloud representation?
  // - Voxel grid?
  // - 2D projections?
  // - Distance fields?
  
  // Example for point cloud input:
  const pointCloud = this.trianglesToPointCloud(triangles);
  const normalizedPoints = this.normalizePointCloud(pointCloud);
  
  // Convert to tensor format expected by your model
  const inputTensor = new ort.Tensor('float32', normalizedPoints, [1, 3, 1024]);
  
  return inputTensor;
}
```

### 6. Update Output Postprocessing
Update the `postprocessResults` method to interpret your model's specific output format:

```typescript
private async postprocessResults(results: ort.InferenceSession.ReturnType): Promise<OnnxAAGNetFeature[]> {
  // Interpret your model's outputs
  // This depends on your model's output format:
  // - Classification scores?
  // - Bounding box coordinates?
  // - Feature embeddings?
  
  const features: OnnxAAGNetFeature[] = [];
  
  // Example: if your model outputs [batch, num_features, feature_dim]
  const predictions = results.output.data as Float32Array;
  
  // Parse based on your model's output structure
  // ...
  
  return features;
}
```

## Troubleshooting

### Model Architecture Issues
If you get errors during conversion:
1. Ensure your model class definition matches the training code exactly
2. Check that all custom layers are properly defined
3. Verify the input/output dimensions

### Browser Compatibility
- Use ONNX opset version 11 for best browser support
- Avoid dynamic shapes if possible
- Keep model size under 100MB for reasonable loading times

### Performance Optimization
- Use quantization to reduce model size
- Consider using WebAssembly backend for better performance
- Implement progressive loading for large models

## Next Steps
1. Convert your PyTorch model using the script above
2. Place the ONNX model in the `public/api/models/` directory
3. Test the conversion with a sample STL file
4. Adjust preprocessing/postprocessing to match your training data

The ONNX AAGNet analyzer is now ready to use your actual trained model instead of the simulation!