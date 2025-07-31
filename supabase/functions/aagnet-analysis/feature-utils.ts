// Utility functions for AAGNet feature detection and processing

export function generateRealisticDimensions(featureType: string) {
  switch (featureType) {
    case 'through_hole':
    case 'blind_hole':
      return {
        diameter: 3 + Math.random() * 15, // 3-18mm diameter
        depth: 5 + Math.random() * 25     // 5-30mm depth
      };
    
    case 'rectangular_pocket':
    case 'triangular_pocket':
    case '6sides_pocket':
    case 'circular_end_pocket':
      return {
        width: 10 + Math.random() * 30,   // 10-40mm width
        length: 10 + Math.random() * 30,  // 10-40mm length  
        depth: 2 + Math.random() * 15     // 2-17mm depth
      };
    
    case 'rectangular_through_slot':
    case 'triangular_through_slot':
    case 'circular_through_slot':
      return {
        width: 5 + Math.random() * 20,    // 5-25mm width
        length: 15 + Math.random() * 35,  // 15-50mm length
        depth: 20 + Math.random() * 20    // 20-40mm depth (through)
      };
    
    case 'chamfer':
      return {
        width: 1 + Math.random() * 4,     // 1-5mm chamfer
        angle: 30 + Math.random() * 30    // 30-60 degree angle
      };
    
    case 'round':
      return {
        radius: 1 + Math.random() * 8     // 1-9mm radius
      };
    
    default:
      return {
        width: 5 + Math.random() * 20,
        height: 5 + Math.random() * 20,
        depth: 2 + Math.random() * 15
      };
  }
}

export function generateMachiningParams(featureType: string) {
  const toolData = {
    'through_hole': {
      tool_type: 'drill',
      tool_diameter: 3 + Math.random() * 12,
      speed: 1200 + Math.random() * 800,
      feed_rate: 0.08 + Math.random() * 0.15,
      plunge_rate: 0.04 + Math.random() * 0.06
    },
    'blind_hole': {
      tool_type: 'drill', 
      tool_diameter: 3 + Math.random() * 12,
      speed: 1000 + Math.random() * 600,
      feed_rate: 0.06 + Math.random() * 0.12,
      plunge_rate: 0.03 + Math.random() * 0.05
    },
    'rectangular_pocket': {
      tool_type: 'end_mill',
      tool_diameter: 4 + Math.random() * 8,
      speed: 800 + Math.random() * 400,
      feed_rate: 0.15 + Math.random() * 0.25,
      step_over: 0.5 + Math.random() * 0.3,
      step_down: 0.3 + Math.random() * 0.4
    },
    'triangular_pocket': {
      tool_type: 'end_mill',
      tool_diameter: 3 + Math.random() * 6,
      speed: 900 + Math.random() * 500,
      feed_rate: 0.12 + Math.random() * 0.18,
      step_over: 0.4 + Math.random() * 0.3,
      step_down: 0.25 + Math.random() * 0.35
    },
    'circular_end_pocket': {
      tool_type: 'end_mill',
      tool_diameter: 4 + Math.random() * 10,
      speed: 850 + Math.random() * 450,
      feed_rate: 0.18 + Math.random() * 0.22,
      step_over: 0.6 + Math.random() * 0.25,
      step_down: 0.4 + Math.random() * 0.3
    },
    'rectangular_through_slot': {
      tool_type: 'end_mill',
      tool_diameter: 2 + Math.random() * 6,
      speed: 1000 + Math.random() * 600,
      feed_rate: 0.1 + Math.random() * 0.2,
      climb_milling: true
    },
    'chamfer': {
      tool_type: 'chamfer_mill',
      tool_diameter: 6 + Math.random() * 8,
      speed: 1500 + Math.random() * 1000,
      feed_rate: 0.2 + Math.random() * 0.3,
      angle: 45 // degrees
    },
    'round': {
      tool_type: 'ball_end_mill',
      tool_diameter: 2 + Math.random() * 6,
      speed: 1200 + Math.random() * 800,
      feed_rate: 0.08 + Math.random() * 0.15
    }
  };

  return toolData[featureType as keyof typeof toolData] || {
    tool_type: 'end_mill',
    tool_diameter: 6,
    speed: 1000,
    feed_rate: 0.15
  };
}