import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const models = {
      models: [
        {
          name: 'AAGNet-Complete',
          version: 'v2.1',
          capabilities: [
            'Geometric Graph Construction',
            'Topological Analysis', 
            'Feature Classification',
            'Machining Parameter Estimation'
          ],
          performance: {
            accuracy: 95,
            speed: 'Fast (15-30s)',
            memoryUsage: '512MB'
          }
        }
      ]
    };
    
    return new Response(
      JSON.stringify(models),
      {
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json"
        },
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message,
        models: []
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