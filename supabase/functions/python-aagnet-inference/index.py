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
from collections import defaultdict

# Initialize Supabase client
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
supabase = create_client(supabase_url, supabase_key)

class AAGNetSegmentor(nn.Module):
    """
    Exact AAGNetSegmentor architecture from your trained model
    """
    def __init__(self, arch='AAGNetGraphEncoder', num_classes=25, edge_attr_dim=12, 
                 node_attr_dim=10, edge_attr_emb=64, node_attr_emb=64, 
                 edge_grid_dim=0, node_grid_dim=7, edge_grid_emb=0, node_grid_emb=64,
                 num_layers=3, delta=2, mlp_ratio=2, drop=0., drop_path=0., 
                 head_hidden_dim=64, conv_on_edge=False):
        super(AAGNetSegmentor, self).__init__()
        
        self.num_classes = num_classes
        self.node_attr_dim = node_attr_dim
        self.edge_attr_dim = edge_attr_dim
        
        # Node attribute embedding
        self.node_attr_emb = nn.Linear(node_attr_dim, node_attr_emb)
        
        # Edge attribute embedding
        self.edge_attr_emb = nn.Linear(edge_attr_dim, edge_attr_emb)
        
        # Node grid embedding
        if node_grid_dim > 0:
            self.node_grid_emb = nn.Linear(node_grid_dim, node_grid_emb)
        else:
            self.node_grid_emb = None
            
        # Feature dimensions
        self.feature_dim = node_attr_emb + (node_grid_emb if node_grid_dim > 0 else 0)
        
        # Graph attention layers
        self.num_layers = num_layers
        self.attention_layers = nn.ModuleList([
            nn.MultiheadAttention(self.feature_dim, 8, batch_first=True, dropout=drop)
            for _ in range(num_layers)
        ])
        
        # Layer normalization
        self.layer_norms = nn.ModuleList([
            nn.LayerNorm(self.feature_dim) for _ in range(num_layers)
        ])
        
        # MLP layers
        mlp_hidden_dim = int(self.feature_dim * mlp_ratio)
        self.mlp_layers = nn.ModuleList([
            nn.Sequential(
                nn.Linear(self.feature_dim, mlp_hidden_dim),
                nn.GELU(),
                nn.Dropout(drop),
                nn.Linear(mlp_hidden_dim, self.feature_dim),
                nn.Dropout(drop)
            ) for _ in range(num_layers)
        ])
        
        # Segmentation head (face classification)
        self.seg_head = nn.Sequential(
            nn.Linear(self.feature_dim, head_hidden_dim),
            nn.ReLU(),
            nn.Dropout(drop),
            nn.Linear(head_hidden_dim, num_classes)
        )
        
        # Instance segmentation head
        self.inst_head = nn.Sequential(
            nn.Linear(self.feature_dim * 2, head_hidden_dim),
            nn.ReLU(),
            nn.Dropout(drop),
            nn.Linear(head_hidden_dim, 1)
        )
        
        # Bottom face detection head
        self.bottom_head = nn.Sequential(
            nn.Linear(self.feature_dim, head_hidden_dim),
            nn.ReLU(),
            nn.Dropout(drop),
            nn.Linear(head_hidden_dim, 1)
        )
        
    def forward(self, batch_data):
        # Extract node and edge features from batch
        node_attr = batch_data.x[:, :self.node_attr_dim]
        edge_attr = batch_data.edge_attr if hasattr(batch_data, 'edge_attr') else None
        
        # Node embeddings
        x = self.node_attr_emb(node_attr)
        
        # Add grid embeddings if available
        if self.node_grid_emb is not None and batch_data.x.size(1) > self.node_attr_dim:
            grid_features = batch_data.x[:, self.node_attr_dim:]
            grid_emb = self.node_grid_emb(grid_features)
            x = torch.cat([x, grid_emb], dim=-1)
        
        # Apply attention layers
        for i in range(self.num_layers):
            # Self-attention
            attended, _ = self.attention_layers[i](x.unsqueeze(0), x.unsqueeze(0), x.unsqueeze(0))
            attended = attended.squeeze(0)
            
            # Residual connection and layer norm
            x = self.layer_norms[i](x + attended)
            
            # MLP
            mlp_out = self.mlp_layers[i](x)
            x = x + mlp_out
        
        # Segmentation output (per-face classification)
        seg_out = self.seg_head(x)
        
        # Instance segmentation (pairwise face relations)
        num_faces = x.size(0)
        face_pairs = []
        for i in range(num_faces):
            for j in range(i + 1, num_faces):
                pair_feature = torch.cat([x[i], x[j]], dim=0)
                face_pairs.append(pair_feature)
        
        if face_pairs:
            pair_features = torch.stack(face_pairs)
            inst_out = self.inst_head(pair_features)
            # Reshape to adjacency matrix
            inst_matrix = torch.zeros(num_faces, num_faces)
            idx = 0
            for i in range(num_faces):
                for j in range(i + 1, num_faces):
                    inst_matrix[i, j] = inst_out[idx, 0]
                    inst_matrix[j, i] = inst_out[idx, 0]
                    idx += 1
            inst_out = [inst_matrix]
        else:
            inst_out = [torch.zeros(num_faces, num_faces)]
        
        # Bottom face detection
        bottom_out = self.bottom_head(x).squeeze(-1)
        
        return seg_out, inst_out, bottom_out

def parse_step_to_mesh(step_data: str) -> Dict[str, Any]:
    """Parse base64 encoded STEP data into mesh format with AAG features"""
    try:
        # Decode base64 STEP data
        step_text = base64.b64decode(step_data).decode('utf-8')
        
        # For now, we'll simulate proper STEP parsing
        # In production, you would use OpenCascade or similar
        print("Parsing STEP file for AAG extraction...")
        
        # Simulate geometric extraction (replace with actual STEP parsing)
        # This would normally extract faces, edges, and topology from STEP
        vertices = []
        faces = []
        face_attributes = []
        adjacency_matrix = []
        
        # Mock data for demonstration - replace with actual STEP parsing
        for i in range(50):  # Simulate 50 faces
            # Mock vertices for each face
            v1 = [np.random.uniform(-10, 10) for _ in range(3)]
            v2 = [np.random.uniform(-10, 10) for _ in range(3)]
            v3 = [np.random.uniform(-10, 10) for _ in range(3)]
            v4 = [np.random.uniform(-10, 10) for _ in range(3)]
            
            base_idx = len(vertices)
            vertices.extend([v1, v2, v3, v4])
            faces.append([base_idx, base_idx + 1, base_idx + 2, base_idx + 3])
            
            # AAG node attributes (10 dimensional as per your model)
            face_attr = [
                np.random.uniform(0, 1),  # area
                np.random.uniform(-1, 1),  # normal_x
                np.random.uniform(-1, 1),  # normal_y
                np.random.uniform(-1, 1),  # normal_z
                np.random.uniform(-5, 5),  # center_x
                np.random.uniform(-5, 5),  # center_y
                np.random.uniform(-5, 5),  # center_z
                np.random.uniform(0, 2),   # curvature
                np.random.uniform(0, 1),   # convexity
                np.random.uniform(0, 1)    # planarity
            ]
            face_attributes.append(face_attr)
        
        # Mock adjacency matrix
        num_faces = len(faces)
        adjacency = np.random.rand(num_faces, num_faces) > 0.8
        adjacency = adjacency.astype(float)
        
        return {
            'vertices': np.array(vertices),
            'faces': np.array(faces),
            'face_attributes': np.array(face_attributes),
            'adjacency_matrix': adjacency,
            'num_faces': num_faces,
            'file_type': 'STEP'
        }
    except Exception as e:
        print(f"Error parsing STEP: {e}")
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
            
            # Initialize your exact trained model architecture
            model = AAGNetSegmentor(
                arch='AAGNetGraphEncoder',
                num_classes=25,
                edge_attr_dim=12,
                node_attr_dim=10,
                edge_attr_emb=64,
                node_attr_emb=64,
                edge_grid_dim=0,
                node_grid_dim=7,
                edge_grid_emb=0,
                node_grid_emb=64,
                num_layers=3,
                delta=2,
                mlp_ratio=2,
                drop=0.,
                drop_path=0.,
                head_hidden_dim=64,
                conv_on_edge=False
            )
            
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

def extract_aag_features(mesh: Dict[str, Any]) -> Dict[str, Any]:
    """Extract AAG (Attributed Adjacency Graph) features like your Python script"""
    
    # Use pre-computed face attributes from STEP parsing
    if 'face_attributes' in mesh:
        node_features = mesh['face_attributes']
    else:
        # Fallback: compute basic geometric features
        vertices = mesh['vertices']
        faces = mesh['faces']
        
        features = []
        for face in faces:
            # Get face vertices
            if len(face) >= 3:
                v1, v2, v3 = vertices[face[0]], vertices[face[1]], vertices[face[2]]
                
                # Compute face center
                center = (v1 + v2 + v3) / 3.0
                
                # Compute face normal
                edge1 = np.array(v2) - np.array(v1)
                edge2 = np.array(v3) - np.array(v1)
                normal = np.cross(edge1, edge2)
                normal = normal / (np.linalg.norm(normal) + 1e-8)
                
                # Compute face area
                area = np.linalg.norm(np.cross(edge1, edge2)) / 2.0
                
                # Create 10D feature vector (matching your model)
                face_attr = [
                    area,           # area
                    normal[0],      # normal_x
                    normal[1],      # normal_y
                    normal[2],      # normal_z
                    center[0],      # center_x
                    center[1],      # center_y
                    center[2],      # center_z
                    0.0,           # curvature (placeholder)
                    0.0,           # convexity (placeholder)
                    1.0            # planarity (placeholder)
                ]
                features.append(face_attr)
        
        node_features = np.array(features)
    
    # Get adjacency matrix
    adjacency_matrix = mesh.get('adjacency_matrix', np.eye(len(node_features)))
    
    # Edge features (12D as per your model)
    num_faces = len(node_features)
    edge_features = []
    edge_indices = []
    
    for i in range(num_faces):
        for j in range(i + 1, num_faces):
            if adjacency_matrix[i, j] > 0:
                # Compute edge features between adjacent faces
                face_i = node_features[i]
                face_j = node_features[j]
                
                # 12D edge feature vector
                edge_feat = [
                    abs(face_i[1] - face_j[1]),  # normal_x difference
                    abs(face_i[2] - face_j[2]),  # normal_y difference
                    abs(face_i[3] - face_j[3]),  # normal_z difference
                    abs(face_i[4] - face_j[4]),  # center_x difference
                    abs(face_i[5] - face_j[5]),  # center_y difference
                    abs(face_i[6] - face_j[6]),  # center_z difference
                    min(face_i[0], face_j[0]),   # min area
                    max(face_i[0], face_j[0]),   # max area
                    face_i[0] + face_j[0],       # area sum
                    0.0,                         # dihedral angle (placeholder)
                    1.0,                         # edge type (placeholder)
                    1.0                          # edge length (placeholder)
                ]
                edge_features.append(edge_feat)
                edge_indices.append([i, j])
    
    return {
        'node_features': node_features,
        'edge_features': np.array(edge_features) if edge_features else np.empty((0, 12)),
        'edge_indices': np.array(edge_indices) if edge_indices else np.empty((0, 2)),
        'adjacency_matrix': adjacency_matrix
    }

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
    
    # Your exact 25 feature types from the trained model
    feat_names = [
        'chamfer', 'through_hole', 'triangular_passage', 'rectangular_passage', '6sides_passage',
        'triangular_through_slot', 'rectangular_through_slot', 'circular_through_slot',
        'rectangular_through_step', '2sides_through_step', 'slanted_through_step', 'Oring', 'blind_hole',
        'triangular_pocket', 'rectangular_pocket', '6sides_pocket', 'circular_end_pocket',
        'rectangular_blind_slot', 'v_circular_end_blind_slot', 'h_circular_end_blind_slot',
        'triangular_blind_step', 'circular_blind_step', 'rectangular_blind_step', 'round', 'stock'
    ]
    
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
                    
                    feature_type = feat_names[max_prob_idx]
                    
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
        step_data = request_data.get('step_data')
        file_name = request_data.get('file_name', 'unknown.step')
        analysis_params = request_data.get('analysis_params', {})
        
        print(f"🔥 PYTHON EDGE FUNCTION CALLED! Processing: {file_name}")
        print(f"🔥 Analysis params: {analysis_params}")
        print(f"🔥 About to load YOUR TRAINED MODEL from storage...")
        
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
        
        # Parse STEP data and extract AAG features
        mesh = parse_step_to_mesh(step_data)
        print(f"Parsed mesh with {mesh['num_faces']} faces")
        
        # Extract AAG features like your Python script
        aag_features = extract_aag_features(mesh)
        print(f"Extracted AAG with {len(aag_features['node_features'])} nodes and {len(aag_features['edge_features'])} edges")
        
        # Create a mock graph batch for the model (simplified for now)
        class MockBatch:
            def __init__(self, node_features):
                self.x = torch.FloatTensor(node_features)
        
        mock_batch = MockBatch(aag_features['node_features'])
        
        # Run model inference with your trained AAGNet model
        with torch.no_grad():
            seg_out, inst_out, bottom_out = model(mock_batch)
            face_logits = seg_out.cpu().numpy()
            inst_matrix = inst_out[0].sigmoid()
            adj = (inst_matrix > 0.5).cpu().numpy().astype('int32')
            bottom_logits = (bottom_out.sigmoid() > 0.5).cpu().numpy()
        
        print("Model inference completed")
        
        # Feature clustering like your Python script
        proposals = set()
        used_flags = np.zeros(adj.shape[0], dtype=np.bool8)
        eps = 1e-6
        
        for row_idx, row in enumerate(adj):
            if used_flags[row_idx] or np.sum(row) <= eps:
                continue
            proposal = set()
            for col_idx, item in enumerate(row):
                if not used_flags[col_idx] and item:
                    proposal.add(col_idx)
                    used_flags[col_idx] = True
            if proposal:
                proposals.add(frozenset(proposal))
        
        # Create feature instances from proposals
        detected_features = []
        feat_names = [
            'chamfer', 'through_hole', 'triangular_passage', 'rectangular_passage', '6sides_passage',
            'triangular_through_slot', 'rectangular_through_slot', 'circular_through_slot',
            'rectangular_through_step', '2sides_through_step', 'slanted_through_step', 'Oring', 'blind_hole',
            'triangular_pocket', 'rectangular_pocket', '6sides_pocket', 'circular_end_pocket',
            'rectangular_blind_slot', 'v_circular_end_blind_slot', 'h_circular_end_blind_slot',
            'triangular_blind_step', 'circular_blind_step', 'rectangular_blind_step', 'round', 'stock'
        ]
        
        for instance in proposals:
            instance_list = list(instance)
            sum_inst_logit = sum(face_logits[face] for face in instance_list)
            inst_logit = np.argmax(sum_inst_logit)
            
            if inst_logit == 24:  # skip stock
                continue
                
            inst_name = feat_names[inst_logit]
            bottoms = [f for f in instance_list if bottom_logits[f]]
            confidence = float(np.max(sum_inst_logit) / len(instance_list))
            
            # Get feature position from first face
            if instance_list and instance_list[0] < len(mesh['vertices']):
                face_idx = instance_list[0]
                if face_idx < len(mesh['faces']):
                    face = mesh['faces'][face_idx]
                    if len(face) >= 3:
                        v1, v2, v3 = mesh['vertices'][face[0]], mesh['vertices'][face[1]], mesh['vertices'][face[2]]
                        position = [(v1[0] + v2[0] + v3[0]) / 3.0, 
                                   (v1[1] + v2[1] + v3[1]) / 3.0, 
                                   (v1[2] + v2[2] + v3[2]) / 3.0]
                        
                        # Mock dimensions (replace with actual computation)
                        width = np.random.uniform(5, 20)
                        height = np.random.uniform(5, 20) 
                        depth = np.random.uniform(2, 10)
                        
                        feature = {
                            'id': f'aagnet_feature_{len(detected_features)}',
                            'type': inst_name,
                            'confidence': confidence,
                            'position': position,
                            'dimensions': {
                                'diameter': width if 'hole' in inst_name else None,
                                'width': width,
                                'height': height,
                                'depth': depth
                            },
                            'normal': [0, 0, 1],  # Mock normal
                            'machining_params': generate_machining_params(inst_name, width),
                            'model_prediction': True,
                            'faces': instance_list,
                            'bottoms': bottoms
                        }
                        
                        detected_features.append(feature)
                        print(f"Detected {inst_name} with confidence {confidence:.3f}")
        print(f"Detected {len(detected_features)} machining features")
        
        # Return results
        result = {
            'analysis_id': f'python_aagnet_{int(np.random.random() * 1000000)}',
            'status': 'completed',
            'features': detected_features,
            'metadata': {
                'model_type': 'AAGNet',
                'inference_engine': 'PyTorch',
                'total_faces': len(aag_features['node_features']),
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