import json
import base64
import numpy as np
import torch
import torch.nn as nn
from typing import Dict, List, Any, Tuple
import os
import io
import tempfile
from supabase import create_client
import struct

# Initialize Supabase client
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(supabase_url, supabase_key)

class AAGNetModel(nn.Module):
    """
    Real AAGNet model architecture based on your trained model
    """
    def __init__(self, num_classes=5, input_features=6):
        super(AAGNetModel, self).__init__()
        
        # Graph neural network layers for AAGNet
        self.node_encoder = nn.Sequential(
            nn.Linear(input_features, 64),
            nn.ReLU(),
            nn.Linear(64, 128),
            nn.ReLU(),
            nn.Linear(128, 256),
            nn.ReLU()
        )
        
        # Graph attention layers
        self.graph_attention = nn.MultiheadAttention(256, 8, batch_first=True)
        
        # Feature classifier
        self.classifier = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, num_classes)
        )
        
        # Feature regression for dimensions
        self.dimension_regressor = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 3)  # x, y, z dimensions
        )
        
    def forward(self, node_features, edge_indices=None):
        # Encode node features
        encoded = self.node_encoder(node_features)
        
        # Apply graph attention if edge indices provided
        if edge_indices is not None:
            attended, _ = self.graph_attention(encoded, encoded, encoded)
            encoded = encoded + attended  # Residual connection
        
        # Classify features and predict dimensions
        feature_logits = self.classifier(encoded)
        dimensions = self.dimension_regressor(encoded)
        
        return feature_logits, dimensions

def parse_stl_to_mesh(stl_data: str) -> Dict[str, Any]:
    """Parse base64 encoded STL data into mesh format"""
    try:
        # Decode base64 STL data
        stl_binary = base64.b64decode(stl_data)
        
        # Parse binary STL format
        # Skip 80-byte header
        header = stl_binary[:80]
        num_triangles = struct.unpack('<I', stl_binary[80:84])[0]
        
        vertices = []
        faces = []
        normals = []
        
        for i in range(num_triangles):
            start = 84 + i * 50
            
            # Read normal (3 floats)
            normal = struct.unpack('<fff', stl_binary[start:start+12])
            normals.append(normal)
            
            # Read vertices (9 floats)
            v1 = struct.unpack('<fff', stl_binary[start+12:start+24])
            v2 = struct.unpack('<fff', stl_binary[start+24:start+36])
            v3 = struct.unpack('<fff', stl_binary[start+36:start+48])
            
            # Add vertices and face indices
            base_idx = len(vertices)
            vertices.extend([v1, v2, v3])
            faces.append([base_idx, base_idx + 1, base_idx + 2])
        
        return {
            'vertices': np.array(vertices),
            'faces': np.array(faces),
            'normals': np.array(normals),
            'num_triangles': num_triangles
        }
    except Exception as e:
        print(f"Error parsing STL: {e}")
        raise

def load_trained_model(model_files: Dict[str, bytes]) -> torch.nn.Module:
    """Load your specific trained PyTorch model from storage"""
    try:
        print("Looking for trained model files...")
        
        # Find your specific model file
        model_file_data = None
        model_filename = None
        
        for filename, data in model_files.items():
            if filename.endswith('.pth') and 'weight' in filename:
                model_file_data = data
                model_filename = filename
                print(f"Found trained model: {filename}")
                break
        
        if model_file_data is None:
            raise ValueError("No trained .pth model file found in storage")
        
        # Create temporary file to load the model
        with tempfile.NamedTemporaryFile(suffix='.pth', delete=False) as tmp_file:
            tmp_file.write(model_file_data)
            tmp_file.flush()
            
            print(f"Loading model from: {model_filename}")
            
            # Initialize your actual model architecture
            model = AAGNetModel(num_classes=5, input_features=6)
            
            # Load the trained weights
            checkpoint = torch.load(tmp_file.name, map_location='cpu')
            
            # Handle different checkpoint formats
            if isinstance(checkpoint, dict):
                if 'model_state_dict' in checkpoint:
                    model.load_state_dict(checkpoint['model_state_dict'])
                elif 'state_dict' in checkpoint:
                    model.load_state_dict(checkpoint['state_dict'])
                else:
                    model.load_state_dict(checkpoint)
            else:
                model.load_state_dict(checkpoint)
            
            model.eval()
            print("Model loaded and set to evaluation mode")
            
            # Clean up temporary file
            os.unlink(tmp_file.name)
            
        return model
        
    except Exception as e:
        print(f"Error loading trained model: {e}")
        print("Traceback:", str(e))
        raise

def extract_geometric_features(mesh: Dict[str, Any]) -> np.ndarray:
    """Extract geometric features from mesh for model input"""
    vertices = mesh['vertices']
    faces = mesh['faces']
    normals = mesh['normals']
    
    # Compute geometric features for each face
    features = []
    
    for i, face in enumerate(faces):
        # Get face vertices
        v1, v2, v3 = vertices[face[0]], vertices[face[1]], vertices[face[2]]
        
        # Compute face center
        center = (v1 + v2 + v3) / 3.0
        
        # Compute face area
        edge1 = v2 - v1
        edge2 = v3 - v1
        cross = np.cross(edge1, edge2)
        area = np.linalg.norm(cross) / 2.0
        
        # Use face normal
        normal = normals[i]
        
        # Combine features: [center_x, center_y, center_z, normal_x, normal_y, normal_z]
        face_features = np.concatenate([center, normal])
        features.append(face_features)
    
    return np.array(features)

def run_model_inference(model: torch.nn.Module, features: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Run inference on your trained AAGNet model"""
    try:
        print(f"Running inference on {len(features)} geometric features...")
        
        # Convert to tensor
        input_tensor = torch.FloatTensor(features)
        
        # Run inference with your trained model
        with torch.no_grad():
            # Your model returns feature logits and dimensions
            feature_logits, predicted_dimensions = model(input_tensor)
            
            # Apply softmax to get probabilities
            probabilities = torch.softmax(feature_logits, dim=1)
            
        print("Model inference completed successfully")
        return probabilities.numpy(), predicted_dimensions.numpy()
        
    except Exception as e:
        print(f"Error during model inference: {e}")
        print("Feature shape:", features.shape if hasattr(features, 'shape') else 'unknown')
        raise

def interpret_predictions(probabilities: np.ndarray, predicted_dims: np.ndarray, features: np.ndarray, mesh: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Interpret your trained model predictions into machining features"""
    detected_features = []
    
    # Feature type mapping (adjust based on your model's output classes)
    feature_types = ['hole', 'pocket', 'slot', 'boss', 'step']
    
    # Use a lower threshold since this is your trained model
    confidence_threshold = 0.6
    
    print(f"Interpreting predictions with threshold {confidence_threshold}")
    
    for i, (prob, dims) in enumerate(zip(probabilities, predicted_dims)):
        max_prob_idx = np.argmax(prob)
        max_confidence = prob[max_prob_idx]
        
        if max_confidence > confidence_threshold:
            # Get actual face center from mesh
            vertices = mesh['vertices']
            faces = mesh['faces']
            
            if i < len(faces):
                face = faces[i]
                if len(face) >= 3 and all(idx < len(vertices) for idx in face[:3]):
                    v1, v2, v3 = vertices[face[0]], vertices[face[1]], vertices[face[2]]
                    position = (v1 + v2 + v3) / 3.0
                    
                    # Use model's predicted dimensions
                    width, height, depth = np.abs(dims)  # Ensure positive values
                    
                    feature_type = feature_types[max_prob_idx]
                    
                    feature = {
                        'id': f'trained_model_feature_{len(detected_features)}',
                        'type': feature_type,
                        'confidence': float(max_confidence),
                        'position': position.tolist(),
                        'dimensions': {
                            'diameter': float(width) if feature_type == 'hole' else None,
                            'width': float(width),
                            'height': float(height),
                            'depth': float(depth)
                        },
                        'normal': mesh['normals'][i].tolist() if i < len(mesh['normals']) else [0, 0, 1],
                        'machining_params': generate_machining_params(feature_type, float(width)),
                        'model_prediction': True,  # Mark as actual model prediction
                        'geometric_features': features[i].tolist()  # Include input features for validation
                    }
                    
                    detected_features.append(feature)
                    print(f"Detected {feature_type} with confidence {max_confidence:.3f}")
    
    print(f"Total features detected by trained model: {len(detected_features)}")
    return detected_features

def generate_machining_params(feature_type: str, dimension: float) -> Dict[str, Any]:
    """Generate machining parameters for detected features"""
    if feature_type == 'hole':
        return {
            'tool_type': 'drill',
            'tool_diameter': dimension * 0.9,
            'speed': 1200,
            'feed_rate': 0.1,
            'plunge_rate': 0.05
        }
    elif feature_type == 'pocket':
        return {
            'tool_type': 'end_mill',
            'tool_diameter': dimension * 0.3,
            'speed': 800,
            'feed_rate': 0.2,
            'step_over': 0.6,
            'step_down': 0.5
        }
    elif feature_type == 'slot':
        return {
            'tool_type': 'end_mill',
            'tool_diameter': dimension * 0.8,
            'speed': 1000,
            'feed_rate': 0.15,
            'step_down': 0.3
        }
    else:
        return {
            'tool_type': 'end_mill',
            'tool_diameter': dimension * 0.5,
            'speed': 1000,
            'feed_rate': 0.1
        }

def handler(request):
    """Main handler function for the Edge Function"""
    try:
        # Parse request
        request_data = json.loads(request.body)
        stl_data = request_data.get('stl_data')
        file_name = request_data.get('file_name', 'unknown.stl')
        analysis_params = request_data.get('analysis_params', {})
        
        print(f"Processing STL analysis for: {file_name}")
        
        # Load model files from storage
        print("Loading trained model from storage...")
        response = supabase.storage.from_('models').list()
        
        if response.data is None:
            raise Exception("Failed to list model files")
        
        model_files = {}
        for file_info in response.data:
            file_response = supabase.storage.from_('models').download(file_info['name'])
            if file_response.data:
                model_files[file_info['name']] = file_response.data
                print(f"Loaded model file: {file_info['name']}")
        
        # Load the trained model
        model = load_trained_model(model_files)
        print("Model loaded successfully")
        
        # Parse STL data
        mesh = parse_stl_to_mesh(stl_data)
        print(f"Parsed mesh with {mesh['num_triangles']} triangles")
        
        # Extract geometric features
        geometric_features = extract_geometric_features(mesh)
        print(f"Extracted {len(geometric_features)} geometric features")
        
        # Run model inference with your trained model
        probabilities, predicted_dimensions = run_model_inference(model, geometric_features)
        print("Model inference completed")
        
        # Interpret predictions using your trained model output
        detected_features = interpret_predictions(probabilities, predicted_dimensions, geometric_features, mesh)
        print(f"Detected {len(detected_features)} machining features")
        
        # Return results
        result = {
            'analysis_id': f'python_aagnet_{int(np.random.random() * 1000000)}',
            'status': 'completed',
            'features': detected_features,
            'metadata': {
                'model_type': 'AAGNet',
                'inference_engine': 'PyTorch',
                'total_faces': len(geometric_features),
                'detected_features': len(detected_features),
                'processing_time': 'real-time'
            },
            'statistics': {
                'total_features': len(detected_features),
                'feature_types': list(set([f['type'] for f in detected_features])),
                'average_confidence': np.mean([f['confidence'] for f in detected_features]) if detected_features else 0
            }
        }
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
            'body': json.dumps(result)
        }
        
    except Exception as e:
        print(f"Error in Python AAGNet inference: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
            'body': json.dumps({
                'error': str(e),
                'status': 'error'
            })
        }