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
    AAGNet model for machining feature recognition
    This is a placeholder - replace with your actual model architecture
    """
    def __init__(self, input_dim=6, hidden_dim=128, num_classes=5):
        super(AAGNetModel, self).__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU()
        )
        self.classifier = nn.Linear(hidden_dim // 2, num_classes)
        
    def forward(self, x):
        features = self.encoder(x)
        predictions = self.classifier(features)
        return predictions, features

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
    """Load your trained PyTorch model from storage"""
    try:
        # Find the main model file (.pth)
        model_file = None
        for filename, data in model_files.items():
            if filename.endswith('.pth'):
                model_file = data
                break
        
        if model_file is None:
            raise ValueError("No .pth model file found")
        
        # Create temporary file to load the model
        with tempfile.NamedTemporaryFile(suffix='.pth', delete=False) as tmp_file:
            tmp_file.write(model_file)
            tmp_file.flush()
            
            # Load the model
            # Replace this with your actual model class
            model = AAGNetModel()
            model.load_state_dict(torch.load(tmp_file.name, map_location='cpu'))
            model.eval()
            
            # Clean up temporary file
            os.unlink(tmp_file.name)
            
        return model
    except Exception as e:
        print(f"Error loading model: {e}")
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
    """Run inference on the trained model"""
    try:
        # Convert to tensor
        input_tensor = torch.FloatTensor(features)
        
        # Run inference
        with torch.no_grad():
            predictions, feature_embeddings = model(input_tensor)
            
        # Apply softmax to get probabilities
        probabilities = torch.softmax(predictions, dim=1)
        
        return probabilities.numpy(), feature_embeddings.numpy()
    except Exception as e:
        print(f"Error during inference: {e}")
        raise

def interpret_predictions(probabilities: np.ndarray, features: np.ndarray, mesh: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Interpret model predictions into machining features"""
    detected_features = []
    
    # Feature type mapping
    feature_types = ['hole', 'pocket', 'slot', 'boss', 'step']
    
    # Threshold for feature detection
    confidence_threshold = 0.7
    
    for i, prob in enumerate(probabilities):
        max_prob_idx = np.argmax(prob)
        max_confidence = prob[max_prob_idx]
        
        if max_confidence > confidence_threshold:
            # Get face center as feature position
            face_idx = i
            vertices = mesh['vertices']
            faces = mesh['faces']
            
            if face_idx < len(faces):
                face = faces[face_idx]
                v1, v2, v3 = vertices[face[0]], vertices[face[1]], vertices[face[2]]
                position = (v1 + v2 + v3) / 3.0
                
                # Estimate feature dimensions (simplified)
                edge1 = np.linalg.norm(v2 - v1)
                edge2 = np.linalg.norm(v3 - v1)
                dimension = max(edge1, edge2)
                
                feature = {
                    'id': f'aagnet_feature_{len(detected_features)}',
                    'type': feature_types[max_prob_idx],
                    'confidence': float(max_confidence),
                    'position': position.tolist(),
                    'dimensions': {
                        'diameter': dimension if feature_types[max_prob_idx] == 'hole' else None,
                        'width': dimension,
                        'height': dimension,
                        'depth': dimension * 0.5
                    },
                    'normal': mesh['normals'][i].tolist() if i < len(mesh['normals']) else [0, 0, 1],
                    'machining_params': generate_machining_params(feature_types[max_prob_idx], dimension)
                }
                
                detected_features.append(feature)
    
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
        
        # Run model inference
        probabilities, embeddings = run_model_inference(model, geometric_features)
        print("Model inference completed")
        
        # Interpret predictions
        detected_features = interpret_predictions(probabilities, geometric_features, mesh)
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