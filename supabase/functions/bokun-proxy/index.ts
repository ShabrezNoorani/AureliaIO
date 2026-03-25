import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { endpoint, method = 'GET', params, accessKey, secretKey } = body

    if (!accessKey || !secretKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API keys' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()
    const date = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth()+1).padStart(2,'0') + '-' +
      String(now.getUTCDate()).padStart(2,'0') + ' ' +
      String(now.getUTCHours()).padStart(2,'0') + ':' +
      String(now.getUTCMinutes()).padStart(2,'0') + ':' +
      String(now.getUTCSeconds()).padStart(2,'0')

    const pathOnly = endpoint.split('?')[0]
    const message = `${date}\n${accessKey}\n${method.toUpperCase()}\n${pathOnly}`

    const encoder = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey(
      'raw', encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-1' },
      false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))

    let fullPath = endpoint
    if (params && Object.keys(params).length > 0) {
      fullPath = `${endpoint}?${new URLSearchParams(params).toString()}`
    }

    console.log('Calling:', fullPath)
    console.log('Date:', date)

    const response = await fetch(`https://api.bokun.io${fullPath}`, {
      method,
      headers: {
        'X-Bokun-Date': date,
        'X-Bokun-AccessKey': accessKey,
        'X-Bokun-Signature': signature,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    })

    const text = await response.text()
    console.log('Status:', response.status)
    console.log('Response:', text.substring(0, 300))

    return new Response(
      response.ok ? text : JSON.stringify({ 
        error: `Bokun ${response.status}`, 
        details: text 
      }),
      {
        status: response.ok ? 200 : response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
