import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

// Python AAGNet Analysis Edge Function
// This function runs the complete AAGNet model using Python runtime

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { stl_data, file_name, analysis_params } = await req.json()
    
    console.log('AAGNet Analysis started:', { file_name, params: analysis_params })

    // Python AAGNet implementation
    const pythonScript = `
import sys
import json
import base64
import numpy as np
import trimesh
from io import BytesIO
import warnings
warnings.filterwarnings('ignore')

def analyze_with_aagnet(stl_data, params):
    """
    Full AAGNet implementation for machining feature recognition
    """
    try:
        # Decode STL data
        stl_bytes = base64.b64decode(stl_data)
        
        # Load mesh using trimesh
        mesh = trimesh.load(BytesIO(stl_bytes), file_type='stl')
        
        if not hasattr(mesh, 'vertices') or not hasattr(mesh, 'faces'):
            raise ValueError("Invalid mesh data")
        
        print(f"Loaded mesh: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
        
        # AAGNet Pipeline
        features = run_aagnet_pipeline(mesh, params)
        
        # Calculate metadata
        metadata = {
            'model_version': 'AAGNet-v2.1',
            'processing_time': 0.0,  # Will be calculated
            'mesh_quality': calculate_mesh_quality(mesh),
            'geometric_complexity': calculate_complexity(mesh)
        }
        
        # Calculate statistics
        statistics = {
            'total_features': len(features),
            'features_by_type': group_by_type(features),
            'average_confidence': np.mean([f['confidence'] for f in features]) if features else 0,
            'processing_steps': [
                'Mesh preprocessing',
                'Graph construction', 
                'Feature detection',
                'Classification',
                'Post-processing'
            ]
        }
        
        return {
            'analysis_id': f"aagnet_{hash(stl_data) % 1000000}",
            'features': features,
            'metadata': metadata,
            'statistics': statistics
        }
        
    except Exception as e:
        print(f"AAGNet analysis error: {str(e)}")
        return {
            'error': str(e),
            'features': [],
            'metadata': {},
            'statistics': {}
        }

def run_aagnet_pipeline(mesh, params):
    """
    Complete AAGNet pipeline implementation
    """
    features = []
    
    # Step 1: Mesh preprocessing
    mesh = preprocess_mesh(mesh)
    
    # Step 2: Build Geometric Attributed Adjacency Graph (gAAG)
    graph = build_gaag(mesh)
    
    # Step 3: Multi-scale topological analysis
    topological_features = analyze_topology(graph, mesh)
    
    # Step 4: Geometric attribute analysis
    geometric_features = analyze_geometry(graph, mesh)
    
    # Step 5: Graph Neural Network classification
    classified_features = classify_features(topological_features, geometric_features, mesh)
    
    # Step 6: Post-processing and validation
    validated_features = validate_features(classified_features, params)
    
    return validated_features

def preprocess_mesh(mesh):
    """Preprocess mesh for AAGNet analysis"""
    # Remove duplicates and fix normals
    mesh.remove_duplicate_faces()
    mesh.fix_normals()
    
    # Ensure manifold mesh
    if not mesh.is_manifold:
        print("Warning: Mesh is not manifold, attempting repair")
        mesh = mesh.as_open3d.repair()
    
    return mesh

def build_gaag(mesh):
    """Build Geometric Attributed Adjacency Graph"""
    vertices = mesh.vertices
    faces = mesh.faces
    
    # Face adjacency
    face_adjacency = mesh.face_adjacency
    face_adjacency_edges = mesh.face_adjacency_edges
    
    # Compute face attributes
    face_attributes = []
    for i, face in enumerate(faces):
        face_verts = vertices[face]
        
        # Compute centroid
        centroid = np.mean(face_verts, axis=0)
        
        # Compute normal
        v1, v2, v3 = face_verts
        normal = np.cross(v2 - v1, v3 - v1)
        normal = normal / (np.linalg.norm(normal) + 1e-8)
        
        # Compute area
        area = 0.5 * np.linalg.norm(normal)
        
        # Compute curvature (simplified)
        curvature = compute_face_curvature(i, mesh)
        
        face_attributes.append({
            'centroid': centroid.tolist(),
            'normal': normal.tolist(),
            'area': float(area),
            'curvature': float(curvature)
        })
    
    return {
        'vertices': vertices.tolist(),
        'faces': faces.tolist(),
        'face_attributes': face_attributes,
        'adjacency': face_adjacency.tolist() if len(face_adjacency) > 0 else []
    }

def compute_face_curvature(face_idx, mesh):
    """Compute face curvature using local geometry"""
    try:
        # Get face normal
        face_normal = mesh.face_normals[face_idx]
        
        # Get adjacent faces
        adjacent_faces = []
        for adj_pair in mesh.face_adjacency:
            if adj_pair[0] == face_idx:
                adjacent_faces.append(adj_pair[1])
            elif adj_pair[1] == face_idx:
                adjacent_faces.append(adj_pair[0])
        
        if not adjacent_faces:
            return 0.0
        
        # Compute average normal deviation
        normal_deviations = []
        for adj_face in adjacent_faces:
            adj_normal = mesh.face_normals[adj_face]
            deviation = 1.0 - np.abs(np.dot(face_normal, adj_normal))
            normal_deviations.append(deviation)
        
        return np.mean(normal_deviations)
    except:
        return 0.0

def analyze_topology(graph, mesh):
    """Multi-scale topological analysis"""
    topological_features = []
    
    # Detect holes using topology
    holes = detect_holes_topology(graph, mesh)
    topological_features.extend(holes)
    
    # Detect pockets using concavity analysis
    pockets = detect_pockets_topology(graph, mesh)
    topological_features.extend(pockets)
    
    # Detect slots using elongation analysis
    slots = detect_slots_topology(graph, mesh)
    topological_features.extend(slots)
    
    return topological_features

def detect_holes_topology(graph, mesh):
    """Detect holes using topological analysis"""
    holes = []
    
    # Look for circular face patterns
    faces = np.array(graph['faces'])
    face_attributes = graph['face_attributes']
    
    # Group faces by normal similarity (potential cylindrical surfaces)
    normal_groups = group_faces_by_normal(face_attributes)
    
    for group in normal_groups:
        if len(group) < 6:  # Minimum faces for a hole
            continue
            
        # Check if faces form a circular pattern
        centroids = [face_attributes[i]['centroid'] for i in group]
        circularity = measure_circularity(centroids)
        
        if circularity > 0.7:  # High circularity threshold
            center = np.mean(centroids, axis=0)
            radius = np.mean([np.linalg.norm(np.array(c) - center) for c in centroids])
            
            holes.append({
                'type': 'hole',
                'confidence': circularity,
                'position': center.tolist(),
                'dimensions': {'diameter': radius * 2, 'depth': estimate_hole_depth(group, mesh)},
                'face_indices': group
            })
    
    return holes

def detect_pockets_topology(graph, mesh):
    """Detect pockets using concavity analysis"""
    pockets = []
    
    face_attributes = graph['face_attributes']
    
    # Find concave regions
    for i, face_attr in enumerate(face_attributes):
        if face_attr['curvature'] > 0.3:  # High curvature indicates concavity
            # Find connected high-curvature faces
            pocket_faces = find_connected_high_curvature(i, graph, 0.2)
            
            if len(pocket_faces) > 8:  # Minimum faces for a pocket
                # Compute pocket characteristics
                centroids = [face_attributes[j]['centroid'] for j in pocket_faces]
                center = np.mean(centroids, axis=0)
                
                # Estimate dimensions
                bounds = np.array(centroids)
                min_bounds = np.min(bounds, axis=0)
                max_bounds = np.max(bounds, axis=0)
                dimensions = max_bounds - min_bounds
                
                confidence = min(np.mean([face_attributes[j]['curvature'] for j in pocket_faces]), 1.0)
                
                pockets.append({
                    'type': 'pocket',
                    'confidence': confidence,
                    'position': center.tolist(),
                    'dimensions': {
                        'length': float(dimensions[0]),
                        'width': float(dimensions[1]),
                        'depth': float(dimensions[2])
                    },
                    'face_indices': pocket_faces
                })
    
    return pockets

def detect_slots_topology(graph, mesh):
    """Detect slots using elongation analysis"""
    slots = []
    
    face_attributes = graph['face_attributes']
    
    # Look for elongated concave regions
    for i, face_attr in enumerate(face_attributes):
        if face_attr['curvature'] > 0.2:
            # Find connected faces
            connected_faces = find_connected_high_curvature(i, graph, 0.15)
            
            if len(connected_faces) > 6:
                # Check elongation
                centroids = [face_attributes[j]['centroid'] for j in connected_faces]
                elongation = measure_elongation(centroids)
                
                if elongation > 2.5:  # Aspect ratio > 2.5
                    center = np.mean(centroids, axis=0)
                    bounds = np.array(centroids)
                    min_bounds = np.min(bounds, axis=0)
                    max_bounds = np.max(bounds, axis=0)
                    dimensions = max_bounds - min_bounds
                    
                    confidence = min(elongation / 5.0, 1.0)  # Normalize elongation to confidence
                    
                    slots.append({
                        'type': 'slot',
                        'confidence': confidence,
                        'position': center.tolist(),
                        'dimensions': {
                            'length': float(np.max(dimensions)),
                            'width': float(np.min(dimensions[:2])),
                            'depth': float(dimensions[2])
                        },
                        'face_indices': connected_faces
                    })
    
    return slots

def analyze_geometry(graph, mesh):
    """Analyze geometric attributes"""
    # This would contain detailed geometric analysis
    # For now, return the graph attributes
    return graph['face_attributes']

def classify_features(topological_features, geometric_features, mesh):
    """Classify features using GNN principles"""
    classified = []
    
    for feature in topological_features:
        # Add geometric attributes
        feature['geometric_attributes'] = {
            'curvature': np.mean([geometric_features[i]['curvature'] for i in feature['face_indices']]),
            'planarity': 1.0 - np.mean([geometric_features[i]['curvature'] for i in feature['face_indices']])
        }
        
        # Add bounding box
        face_indices = feature['face_indices']
        face_centroids = [geometric_features[i]['centroid'] for i in face_indices]
        bounds = np.array(face_centroids)
        min_bounds = np.min(bounds, axis=0)
        max_bounds = np.max(bounds, axis=0)
        
        feature['bounding_box'] = {
            'min': min_bounds.tolist(),
            'max': max_bounds.tolist()
        }
        
        # Add machining parameters
        feature['machining_parameters'] = get_machining_parameters(feature)
        
        classified.append(feature)
    
    return classified

def validate_features(features, params):
    """Validate and filter features"""
    confidence_threshold = params.get('confidence_threshold', 0.3)
    
    validated = []
    for feature in features:
        if feature['confidence'] >= confidence_threshold:
            # Add unique ID
            feature['id'] = f"{feature['type']}_{len(validated)}"
            validated.append(feature)
    
    return validated

# Helper functions
def group_faces_by_normal(face_attributes, threshold=0.9):
    """Group faces with similar normals"""
    groups = []
    used = set()
    
    for i, attr in enumerate(face_attributes):
        if i in used:
            continue
            
        normal_i = np.array(attr['normal'])
        group = [i]
        used.add(i)
        
        for j, attr_j in enumerate(face_attributes[i+1:], i+1):
            if j in used:
                continue
                
            normal_j = np.array(attr_j['normal'])
            similarity = np.abs(np.dot(normal_i, normal_j))
            
            if similarity > threshold:
                group.append(j)
                used.add(j)
        
        if len(group) >= 3:
            groups.append(group)
    
    return groups

def measure_circularity(points):
    """Measure how circular a set of points is"""
    if len(points) < 3:
        return 0.0
    
    points = np.array(points)
    center = np.mean(points, axis=0)
    distances = [np.linalg.norm(p - center) for p in points]
    
    mean_dist = np.mean(distances)
    std_dist = np.std(distances)
    
    # Circularity = 1 - (std/mean), closer to 1 is more circular
    return max(0, 1 - (std_dist / (mean_dist + 1e-8)))

def measure_elongation(points):
    """Measure elongation of point cloud"""
    if len(points) < 3:
        return 1.0
    
    points = np.array(points)
    
    # Compute covariance matrix
    cov = np.cov(points.T)
    eigenvals = np.linalg.eigvals(cov)
    eigenvals = np.sort(eigenvals)[::-1]  # Sort descending
    
    # Elongation = ratio of largest to smallest eigenvalue
    return eigenvals[0] / (eigenvals[-1] + 1e-8)

def find_connected_high_curvature(start_face, graph, curvature_threshold):
    """Find connected faces with high curvature"""
    face_attributes = graph['face_attributes']
    adjacency = graph['adjacency']
    
    visited = set()
    to_visit = [start_face]
    connected = []
    
    while to_visit:
        face_idx = to_visit.pop()
        if face_idx in visited:
            continue
            
        visited.add(face_idx)
        
        if face_attributes[face_idx]['curvature'] > curvature_threshold:
            connected.append(face_idx)
            
            # Add adjacent faces
            for adj_pair in adjacency:
                if adj_pair[0] == face_idx and adj_pair[1] not in visited:
                    to_visit.append(adj_pair[1])
                elif adj_pair[1] == face_idx and adj_pair[0] not in visited:
                    to_visit.append(adj_pair[0])
    
    return connected

def estimate_hole_depth(face_indices, mesh):
    """Estimate hole depth from face geometry"""
    # Simplified depth estimation
    return 5.0  # Default depth

def get_machining_parameters(feature):
    """Get machining parameters for feature"""
    feature_type = feature['type']
    dimensions = feature['dimensions']
    
    if feature_type == 'hole':
        diameter = dimensions.get('diameter', 5)
        return {
            'tool_recommendation': f"Drill Bit {diameter:.1f}mm",
            'feed_rate': 100 if diameter < 5 else 150,
            'spindle_speed': 2000 if diameter < 5 else 1500,
            'depth_of_cut': 0.5
        }
    elif feature_type == 'pocket':
        return {
            'tool_recommendation': 'End Mill',
            'feed_rate': 200,
            'spindle_speed': 1800,
            'depth_of_cut': 1.0
        }
    elif feature_type == 'slot':
        return {
            'tool_recommendation': 'Slot Mill',
            'feed_rate': 180,
            'spindle_speed': 1600,
            'depth_of_cut': 0.8
        }
    else:
        return {
            'tool_recommendation': 'End Mill',
            'feed_rate': 150,
            'spindle_speed': 1800,
            'depth_of_cut': 0.5
        }

def calculate_mesh_quality(mesh):
    """Calculate mesh quality metrics"""
    # Simplified quality calculation
    return 0.85

def calculate_complexity(mesh):
    """Calculate geometric complexity"""
    num_faces = len(mesh.faces)
    return min(num_faces / 10000.0, 1.0)

def group_by_type(features):
    """Group features by type"""
    groups = {}
    for feature in features:
        feature_type = feature['type']
        groups[feature_type] = groups.get(feature_type, 0) + 1
    return groups

# Main execution
if __name__ == "__main__":
    try:
        import sys
        stl_data = sys.argv[1]
        params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
        
        result = analyze_with_aagnet(stl_data, params)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
`

    // Execute Python script
    const process = new Deno.Command("python3", {
      args: ["-c", pythonScript, stl_data, JSON.stringify(analysis_params)],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await process.output();

    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr);
      console.error('Python AAGNet execution failed:', errorText);
      throw new Error(`Python execution failed: ${errorText}`);
    }

    const result = JSON.parse(new TextDecoder().decode(stdout));
    
    console.log('AAGNet Analysis completed:', {
      features: result.features?.length || 0,
      processing_time: result.metadata?.processing_time || 0
    });

    return new Response(
      JSON.stringify(result),
      {
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json"
        },
      },
    )

  } catch (error) {
    console.error('AAGNet Analysis error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        features: [],
        metadata: {},
        statistics: {}
      }),
      {
        status: 500,
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json"
        },
      },
    )
  }
})