import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { analysis_id } = await req.json()
    
    // For now, return simple status - this would connect to a job queue in production
    return new Response(
      JSON.stringify({
        status: 'completed',
        progress: 1.0,
        message: 'Analysis complete',
        result: null
      }),
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
        status: 'failed',
        progress: 0,
        message: error.message
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