import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stepData, analysisParams = {} } = await req.json();
    
    if (!stepData) {
      return new Response(
        JSON.stringify({ error: 'STEP data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting AAGNet analysis...');
    
    // For now, return mock data that matches your real system format
    // This will be replaced with actual Python AAGNet inference
    const mockFeatures = generateMockFeatures();
    
    const result = {
      features: mockFeatures,
      metadata: {
        analysis_id: crypto.randomUUID(),
        model_version: "AAGNet v1.0",
        processing_time: Math.random() * 2000 + 1000,
        confidence_threshold: analysisParams.confidence_threshold || 0.5
      },
      statistics: {
        total_features: mockFeatures.length,
        feature_types: getFeatureTypeCount(mockFeatures),
        avg_confidence: calculateAverageConfidence(mockFeatures)
      },
      // Include face labels for proper surface highlighting
      face_labels: generateFaceLabels(mockFeatures)
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AAGNet analysis:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateMockFeatures() {
  const featureTypes = [
    'through_hole', 'blind_hole', 'rectangular_pocket', 'circular_end_pocket',
    'chamfer', 'rectangular_through_slot', 'triangular_passage', 'round'
  ];
  
  const features = [];
  const numFeatures = Math.floor(Math.random() * 8) + 3; // 3-10 features
  
  for (let i = 0; i < numFeatures; i++) {
    const featureType = featureTypes[Math.floor(Math.random() * featureTypes.length)];
    
    features.push({
      id: `feature_${i}`,
      type: featureType,
      confidence: 0.75 + Math.random() * 0.24, // 0.75-0.99
      position: {
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 80,
        z: (Math.random() - 0.5) * 25
      },
      dimensions: generateFeatureDimensions(featureType),
      machining_parameters: generateMachiningParams(featureType),
      // Critical: Include face IDs that belong to this feature
      face_ids: generateFeatureFaceIds(i),
      // Bounding box for the feature
      bounding_box: generateFeatureBoundingBox()
    });
  }
  
  return features;
}

function generateFeatureDimensions(featureType: string) {
  switch (featureType) {
    case 'through_hole':
    case 'blind_hole':
      return {
        diameter: 5 + Math.random() * 15,
        depth: featureType === 'through_hole' ? 'through' : 10 + Math.random() * 20
      };
    case 'rectangular_pocket':
      return {
        width: 10 + Math.random() * 30,
        height: 8 + Math.random() * 20,
        depth: 5 + Math.random() * 15
      };
    case 'circular_end_pocket':
      return {
        diameter: 8 + Math.random() * 20,
        depth: 5 + Math.random() * 15
      };
    case 'chamfer':
      return {
        width: 1 + Math.random() * 3,
        angle: 45
      };
    case 'rectangular_through_slot':
      return {
        width: 5 + Math.random() * 15,
        height: 8 + Math.random() * 20,
        depth: 'through'
      };
    case 'triangular_passage':
      return {
        side_length: 10 + Math.random() * 15,
        depth: 'through'
      };
    case 'round':
      return {
        radius: 1 + Math.random() * 5
      };
    default:
      return {
        width: 10 + Math.random() * 20,
        height: 8 + Math.random() * 15,
        depth: 5 + Math.random() * 10
      };
  }
}

function generateMachiningParams(featureType: string) {
  const toolTypes = {
    'through_hole': 'drill',
    'blind_hole': 'drill',
    'rectangular_pocket': 'end_mill',
    'circular_end_pocket': 'end_mill',
    'chamfer': 'chamfer_mill',
    'rectangular_through_slot': 'end_mill',
    'triangular_passage': 'end_mill',
    'round': 'ball_end_mill'
  };
  
  const toolType = toolTypes[featureType] || 'end_mill';
  
  return {
    tool_type: toolType,
    tool_diameter: 2 + Math.random() * 10,
    spindle_speed: 1000 + Math.random() * 4000,
    feed_rate: 100 + Math.random() * 500,
    cutting_depth: 0.5 + Math.random() * 2
  };
}

function generateFeatureFaceIds(featureIndex: number) {
  // Generate realistic face IDs that would belong to this feature
  const numFaces = Math.floor(Math.random() * 4) + 2; // 2-5 faces per feature
  const faceIds = [];
  
  for (let i = 0; i < numFaces; i++) {
    faceIds.push(featureIndex * 10 + i);
  }
  
  return faceIds;
}

function generateFeatureBoundingBox() {
  const centerX = (Math.random() - 0.5) * 100;
  const centerY = (Math.random() - 0.5) * 80;
  const centerZ = (Math.random() - 0.5) * 25;
  
  const sizeX = 5 + Math.random() * 20;
  const sizeY = 5 + Math.random() * 15;
  const sizeZ = 2 + Math.random() * 10;
  
  return {
    min: [centerX - sizeX/2, centerY - sizeY/2, centerZ - sizeZ/2],
    max: [centerX + sizeX/2, centerY + sizeY/2, centerZ + sizeZ/2]
  };
}

function generateFaceLabels(features: any[]) {
  // Generate face labels that map face IDs to feature types
  // This is crucial for surface highlighting
  const faceLabels: Record<number, string> = {};
  
  features.forEach(feature => {
    feature.face_ids.forEach((faceId: number) => {
      faceLabels[faceId] = feature.type;
    });
  });
  
  // Add some stock faces (unlabeled faces)
  for (let i = 0; i < 50; i++) {
    if (!faceLabels[i]) {
      faceLabels[i] = 'stock';
    }
  }
  
  return faceLabels;
}

function getFeatureTypeCount(features: any[]) {
  const counts: Record<string, number> = {};
  features.forEach(feature => {
    counts[feature.type] = (counts[feature.type] || 0) + 1;
  });
  return counts;
}

function calculateAverageConfidence(features: any[]) {
  if (features.length === 0) return 0;
  const totalConfidence = features.reduce((sum, feature) => sum + feature.confidence, 0);
  return totalConfidence / features.length;
}