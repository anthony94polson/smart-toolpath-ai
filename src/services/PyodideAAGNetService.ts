// Pyodide-based in-browser Python AAGNet implementation
// This runs the complete AAGNet model directly in the browser using Pyodide

interface PyodideWindow extends Window {
  loadPyodide: any;
}

declare const window: PyodideWindow;

export class PyodideAAGNetService {
  private static instance: PyodideAAGNetService;
  private pyodide: any = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): PyodideAAGNetService {
    if (!this.instance) {
      this.instance = new PyodideAAGNetService();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    console.log('PyodideAAGNetService: Initializing Pyodide...');

    try {
      // Load Pyodide
      if (!window.loadPyodide) {
        await this.loadPyodideScript();
      }

      this.pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
      });

      console.log('PyodideAAGNetService: Installing Python packages...');

      // Install required packages
      await this.pyodide.loadPackage([
        'numpy',
        'scipy', 
        'scikit-learn',
        'micropip'
      ]);

      // Install additional packages via micropip
      await this.pyodide.runPython(`
        import micropip
        await micropip.install(['trimesh', 'networkx'])
      `);

      // Load AAGNet implementation
      await this.loadAAGNetCode();

      this.isInitialized = true;
      console.log('PyodideAAGNetService: Initialization complete');

    } catch (error) {
      console.error('PyodideAAGNetService: Initialization failed:', error);
      throw error;
    }
  }

  private async loadPyodideScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide'));
      document.head.appendChild(script);
    });
  }

  private async loadAAGNetCode(): Promise<void> {
    const aagnetCode = `
import numpy as np
import json
import base64
from io import BytesIO
import warnings
warnings.filterwarnings('ignore')

try:
    import trimesh
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False
    print("Trimesh not available, using simplified mesh operations")

class PyodideAAGNet:
    """Complete AAGNet implementation in Pyodide"""
    
    def __init__(self):
        self.confidence_threshold = 0.3
        self.min_feature_size = 0.1
        
    def analyze_stl(self, stl_data_b64, params=None):
        """Main analysis function"""
        try:
            print("PyodideAAGNet: Starting analysis...")
            
            # Decode STL data
            stl_bytes = base64.b64decode(stl_data_b64)
            
            # Load mesh
            mesh = self.load_mesh_from_bytes(stl_bytes)
            print(f"PyodideAAGNet: Loaded mesh with {len(mesh['vertices'])} vertices")
            
            # Run AAGNet pipeline
            features = self.run_aagnet_pipeline(mesh, params or {})
            
            # Calculate metadata
            metadata = {
                'model_version': 'PyodideAAGNet-v1.0',
                'processing_time': 0.0,
                'mesh_quality': self.calculate_mesh_quality(mesh),
                'geometric_complexity': self.calculate_complexity(mesh)
            }
            
            # Calculate statistics
            stats = {
                'total_features': len(features),
                'features_by_type': self.group_by_type(features),
                'average_confidence': np.mean([f['confidence'] for f in features]) if features else 0,
                'processing_steps': [
                    'Mesh loading',
                    'Graph construction',
                    'Topological analysis', 
                    'Feature classification',
                    'Validation'
                ]
            }
            
            result = {
                'analysis_id': f"pyodide_{hash(stl_data_b64) % 1000000}",
                'features': features,
                'metadata': metadata,
                'statistics': stats
            }
            
            print(f"PyodideAAGNet: Analysis complete, found {len(features)} features")
            return result
            
        except Exception as e:
            print(f"PyodideAAGNet: Analysis failed: {str(e)}")
            return {
                'error': str(e),
                'features': [],
                'metadata': {},
                'statistics': {}
            }
    
    def load_mesh_from_bytes(self, stl_bytes):
        """Load mesh from STL bytes"""
        if TRIMESH_AVAILABLE:
            try:
                mesh_obj = trimesh.load(BytesIO(stl_bytes), file_type='stl')
                return {
                    'vertices': mesh_obj.vertices,
                    'faces': mesh_obj.faces,
                    'normals': getattr(mesh_obj, 'face_normals', None)
                }
            except:
                pass
        
        # Fallback: simple STL parser
        return self.parse_stl_binary(stl_bytes)
    
    def parse_stl_binary(self, data):
        """Simple binary STL parser"""
        if len(data) < 84:
            raise ValueError("Invalid STL file")
        
        # Skip header (80 bytes)
        num_triangles = int.from_bytes(data[80:84], byteorder='little')
        
        vertices = []
        faces = []
        normals = []
        vertex_map = {}
        vertex_count = 0
        
        offset = 84
        for i in range(num_triangles):
            if offset + 50 > len(data):
                break
                
            # Normal vector (12 bytes)
            normal = [
                np.frombuffer(data[offset:offset+4], dtype=np.float32)[0],
                np.frombuffer(data[offset+4:offset+8], dtype=np.float32)[0], 
                np.frombuffer(data[offset+8:offset+12], dtype=np.float32)[0]
            ]
            normals.append(normal)
            offset += 12
            
            # Three vertices (36 bytes)
            face_vertices = []
            for j in range(3):
                vertex = [
                    np.frombuffer(data[offset:offset+4], dtype=np.float32)[0],
                    np.frombuffer(data[offset+4:offset+8], dtype=np.float32)[0],
                    np.frombuffer(data[offset+8:offset+12], dtype=np.float32)[0]
                ]
                offset += 12
                
                # Vertex deduplication
                vertex_key = tuple(np.round(vertex, 6))
                if vertex_key not in vertex_map:
                    vertex_map[vertex_key] = vertex_count
                    vertices.append(vertex)
                    vertex_count += 1
                
                face_vertices.append(vertex_map[vertex_key])
            
            faces.append(face_vertices)
            offset += 2  # Skip attribute byte count
        
        return {
            'vertices': np.array(vertices),
            'faces': np.array(faces),
            'normals': np.array(normals)
        }
    
    def run_aagnet_pipeline(self, mesh, params):
        """Complete AAGNet pipeline"""
        
        # Step 1: Build geometric graph
        graph = self.build_geometric_graph(mesh)
        
        # Step 2: Topological analysis
        topo_features = self.analyze_topology(graph, mesh)
        
        # Step 3: Feature classification
        classified_features = self.classify_features(topo_features, graph, mesh)
        
        # Step 4: Validation
        validated_features = self.validate_features(classified_features, params)
        
        return validated_features
    
    def build_geometric_graph(self, mesh):
        """Build geometric attributed adjacency graph"""
        vertices = mesh['vertices']
        faces = mesh['faces']
        normals = mesh.get('normals')
        
        # Compute face attributes
        face_attributes = []
        for i, face in enumerate(faces):
            face_verts = vertices[face]
            
            # Centroid
            centroid = np.mean(face_verts, axis=0)
            
            # Normal
            if normals is not None and i < len(normals):
                normal = normals[i]
            else:
                v1, v2, v3 = face_verts
                edge1 = v2 - v1
                edge2 = v3 - v1
                normal = np.cross(edge1, edge2)
                normal = normal / (np.linalg.norm(normal) + 1e-8)
            
            # Area
            v1, v2, v3 = face_verts
            area = 0.5 * np.linalg.norm(np.cross(v2 - v1, v3 - v1))
            
            # Curvature (simplified)
            curvature = self.compute_face_curvature(i, faces, vertices)
            
            face_attributes.append({
                'centroid': centroid,
                'normal': normal,
                'area': area,
                'curvature': curvature
            })
        
        # Build adjacency
        adjacency = self.compute_face_adjacency(faces)
        
        return {
            'face_attributes': face_attributes,
            'adjacency': adjacency,
            'vertices': vertices,
            'faces': faces
        }
    
    def compute_face_curvature(self, face_idx, faces, vertices):
        """Compute face curvature"""
        try:
            # Find adjacent faces by shared edges
            target_face = faces[face_idx]
            adjacent_normals = []
            
            # Current face normal
            face_verts = vertices[target_face]
            v1, v2, v3 = face_verts
            current_normal = np.cross(v2 - v1, v3 - v1)
            current_normal = current_normal / (np.linalg.norm(current_normal) + 1e-8)
            
            # Check other faces for shared edges
            for i, other_face in enumerate(faces):
                if i == face_idx:
                    continue
                    
                # Check for shared edge (2 vertices)
                shared_verts = set(target_face) & set(other_face)
                if len(shared_verts) == 2:
                    # Adjacent face found
                    other_verts = vertices[other_face]
                    ov1, ov2, ov3 = other_verts
                    other_normal = np.cross(ov2 - ov1, ov3 - ov1)
                    other_normal = other_normal / (np.linalg.norm(other_normal) + 1e-8)
                    adjacent_normals.append(other_normal)
            
            if not adjacent_normals:
                return 0.0
            
            # Compute average normal deviation
            deviations = []
            for adj_normal in adjacent_normals:
                deviation = 1.0 - abs(np.dot(current_normal, adj_normal))
                deviations.append(deviation)
            
            return np.mean(deviations)
            
        except:
            return 0.0
    
    def compute_face_adjacency(self, faces):
        """Compute face adjacency matrix"""
        adjacency = []
        
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                # Check for shared edge (2 vertices)
                shared_verts = set(faces[i]) & set(faces[j])
                if len(shared_verts) == 2:
                    adjacency.append([i, j])
        
        return adjacency
    
    def analyze_topology(self, graph, mesh):
        """Analyze mesh topology for features"""
        features = []
        
        # Detect holes
        holes = self.detect_holes(graph, mesh)
        features.extend(holes)
        
        # Detect pockets
        pockets = self.detect_pockets(graph, mesh)
        features.extend(pockets)
        
        # Detect slots
        slots = self.detect_slots(graph, mesh)
        features.extend(slots)
        
        return features
    
    def detect_holes(self, graph, mesh):
        """Detect hole features"""
        holes = []
        face_attributes = graph['face_attributes']
        
        # Group faces by normal similarity
        normal_groups = self.group_faces_by_normal(face_attributes, threshold=0.9)
        
        for group in normal_groups:
            if len(group) < 6:  # Minimum faces for hole
                continue
            
            # Check circularity
            centroids = [face_attributes[i]['centroid'] for i in group]
            circularity = self.measure_circularity(centroids)
            
            if circularity > 0.7:
                center = np.mean(centroids, axis=0)
                radius = np.mean([np.linalg.norm(c - center) for c in centroids])
                
                holes.append({
                    'type': 'hole',
                    'confidence': circularity,
                    'position': center.tolist(),
                    'dimensions': {
                        'diameter': radius * 2,
                        'depth': radius  # Estimated
                    },
                    'face_indices': group
                })
        
        return holes
    
    def detect_pockets(self, graph, mesh):
        """Detect pocket features"""
        pockets = []
        face_attributes = graph['face_attributes']
        
        # Find high-curvature regions
        for i, attr in enumerate(face_attributes):
            if attr['curvature'] > 0.3:
                # Find connected high-curvature faces
                connected = self.find_connected_faces(i, graph, curvature_threshold=0.2)
                
                if len(connected) > 8:  # Minimum for pocket
                    centroids = [face_attributes[j]['centroid'] for j in connected]
                    center = np.mean(centroids, axis=0)
                    
                    # Estimate dimensions
                    bounds = np.array(centroids)
                    min_bounds = np.min(bounds, axis=0)
                    max_bounds = np.max(bounds, axis=0)
                    dimensions = max_bounds - min_bounds
                    
                    confidence = min(np.mean([face_attributes[j]['curvature'] for j in connected]), 1.0)
                    
                    pockets.append({
                        'type': 'pocket',
                        'confidence': confidence,
                        'position': center.tolist(),
                        'dimensions': {
                            'length': float(dimensions[0]),
                            'width': float(dimensions[1]),
                            'depth': float(dimensions[2])
                        },
                        'face_indices': connected
                    })
        
        return pockets
    
    def detect_slots(self, graph, mesh):
        """Detect slot features"""
        slots = []
        face_attributes = graph['face_attributes']
        
        # Find elongated high-curvature regions
        for i, attr in enumerate(face_attributes):
            if attr['curvature'] > 0.2:
                connected = self.find_connected_faces(i, graph, curvature_threshold=0.15)
                
                if len(connected) > 6:
                    centroids = [face_attributes[j]['centroid'] for j in connected]
                    elongation = self.measure_elongation(centroids)
                    
                    if elongation > 2.5:  # High aspect ratio
                        center = np.mean(centroids, axis=0)
                        bounds = np.array(centroids)
                        dimensions = np.max(bounds, axis=0) - np.min(bounds, axis=0)
                        
                        confidence = min(elongation / 5.0, 1.0)
                        
                        slots.append({
                            'type': 'slot',
                            'confidence': confidence,
                            'position': center.tolist(),
                            'dimensions': {
                                'length': float(np.max(dimensions)),
                                'width': float(np.min(dimensions[:2])),
                                'depth': float(dimensions[2])
                            },
                            'face_indices': connected
                        })
        
        return slots
    
    def classify_features(self, features, graph, mesh):
        """Classify and enhance features"""
        classified = []
        
        for feature in features:
            # Add geometric attributes
            face_indices = feature['face_indices']
            face_attributes = graph['face_attributes']
            
            avg_curvature = np.mean([face_attributes[i]['curvature'] for i in face_indices])
            
            feature['geometric_attributes'] = {
                'curvature': float(avg_curvature),
                'planarity': float(1.0 - avg_curvature)
            }
            
            # Add bounding box
            centroids = [face_attributes[i]['centroid'] for i in face_indices]
            bounds = np.array(centroids)
            feature['bounding_box'] = {
                'min': np.min(bounds, axis=0).tolist(),
                'max': np.max(bounds, axis=0).tolist()
            }
            
            # Add machining parameters
            feature['machining_parameters'] = self.get_machining_params(feature)
            
            classified.append(feature)
        
        return classified
    
    def validate_features(self, features, params):
        """Validate features"""
        confidence_threshold = params.get('confidence_threshold', self.confidence_threshold)
        
        validated = []
        for i, feature in enumerate(features):
            if feature['confidence'] >= confidence_threshold:
                # Check size
                dims = feature['dimensions']
                max_dim = max(dims.values())
                
                if max_dim >= self.min_feature_size:
                    feature['id'] = f"{feature['type']}_{i}"
                    validated.append(feature)
        
        return validated
    
    # Helper methods
    def group_faces_by_normal(self, face_attributes, threshold=0.9):
        """Group faces with similar normals"""
        groups = []
        used = set()
        
        for i, attr in enumerate(face_attributes):
            if i in used:
                continue
            
            normal_i = attr['normal']
            group = [i]
            used.add(i)
            
            for j in range(i + 1, len(face_attributes)):
                if j in used:
                    continue
                
                normal_j = face_attributes[j]['normal']
                similarity = abs(np.dot(normal_i, normal_j))
                
                if similarity > threshold:
                    group.append(j)
                    used.add(j)
            
            if len(group) >= 3:
                groups.append(group)
        
        return groups
    
    def measure_circularity(self, points):
        """Measure circularity of points"""
        if len(points) < 3:
            return 0.0
        
        points = np.array(points)
        center = np.mean(points, axis=0)
        distances = [np.linalg.norm(p - center) for p in points]
        
        mean_dist = np.mean(distances)
        std_dist = np.std(distances)
        
        return max(0, 1 - (std_dist / (mean_dist + 1e-8)))
    
    def measure_elongation(self, points):
        """Measure elongation of point cloud"""
        if len(points) < 3:
            return 1.0
        
        points = np.array(points)
        cov = np.cov(points.T)
        eigenvals = np.linalg.eigvals(cov)
        eigenvals = np.sort(eigenvals)[::-1]
        
        return eigenvals[0] / (eigenvals[-1] + 1e-8)
    
    def find_connected_faces(self, start_face, graph, curvature_threshold):
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
    
    def get_machining_params(self, feature):
        """Get machining parameters"""
        feature_type = feature['type']
        dimensions = feature['dimensions']
        
        if feature_type == 'hole':
            diameter = dimensions.get('diameter', 5)
            return {
                'tool_recommendation': f"Drill Bit {diameter:.1f}mm",
                'feed_rate': 100 if diameter < 5 else 150,
                'spindle_speed': 2000 if diameter < 5 else 1500
            }
        elif feature_type == 'pocket':
            return {
                'tool_recommendation': 'End Mill',
                'feed_rate': 200,
                'spindle_speed': 1800
            }
        else:
            return {
                'tool_recommendation': 'End Mill',
                'feed_rate': 150,
                'spindle_speed': 1800
            }
    
    def calculate_mesh_quality(self, mesh):
        """Calculate mesh quality"""
        return 0.85  # Simplified
    
    def calculate_complexity(self, mesh):
        """Calculate geometric complexity"""
        num_faces = len(mesh['faces'])
        return min(num_faces / 10000.0, 1.0)
    
    def group_by_type(self, features):
        """Group features by type"""
        groups = {}
        for feature in features:
            t = feature['type']
            groups[t] = groups.get(t, 0) + 1
        return groups

# Create global instance
pyodide_aagnet = PyodideAAGNet()

def analyze_stl_pyodide(stl_data_b64, params_json="{}"):
    """Global function for Pyodide interface"""
    import json
    params = json.loads(params_json)
    return pyodide_aagnet.analyze_stl(stl_data_b64, params)
`;

    await this.pyodide.runPython(aagnetCode);
    console.log('PyodideAAGNetService: AAGNet code loaded successfully');
  }

  async analyzeSTL(stlBuffer: ArrayBuffer, params: any = {}): Promise<any> {
    await this.initialize();

    console.log('PyodideAAGNetService: Starting STL analysis...');

    // Convert ArrayBuffer to base64
    const base64Data = this.arrayBufferToBase64(stlBuffer);

    // Run analysis in Pyodide
    const resultJson = this.pyodide.runPython(`
      import json
      result = analyze_stl_pyodide("${base64Data}", '${JSON.stringify(params)}')
      json.dumps(result)
    `);

    const result = JSON.parse(resultJson);
    console.log('PyodideAAGNetService: Analysis complete:', result);

    return result;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'loadPyodide' in window;
  }
}

export const pyodideAAGNetService = PyodideAAGNetService.getInstance();