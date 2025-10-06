import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'
import { PLRFile } from '../_shared/types.ts'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

interface SyncRequest {
  files: PLRFile[]
}

interface SyncResponse {
  conflicts: {
    local: PLRFile
    cloud: PLRFile
  }[]
}

interface GetChangesResponse {
  files: PLRFile[]
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_REQUESTS = 60 // 60 requests per minute
const requestCounts = new Map<string, { count: number; timestamp: number }>()

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Rate limiting
    const clientId = authHeader // Use auth token as client identifier
    const now = Date.now()
    const clientRequests = requestCounts.get(clientId)

    if (clientRequests) {
      if (now - clientRequests.timestamp > RATE_LIMIT_WINDOW) {
        // Reset if window expired
        requestCounts.set(clientId, { count: 1, timestamp: now })
      } else if (clientRequests.count >= MAX_REQUESTS) {
        // Rate limit exceeded
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Increment count
        clientRequests.count++
      }
    } else {
      // First request from this client
      requestCounts.set(clientId, { count: 1, timestamp: now })
    }

    // Verify JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    
    if (authError || !user) {
      throw new Error('Invalid authorization token')
    }

    // Handle different endpoints
    const url = new URL(req.url)
    const path = url.pathname.replace('/desktop-sync', '')

    if (req.method === 'POST' && path === '') {
      return handleSync(req, user.id)
    } else if (req.method === 'GET' && path === '/changes') {
      return handleGetChanges(req, user.id)
    }

    throw new Error('Not found')
  } catch (error) {
    console.error(error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleSync(req: Request, userId: string) {
  const { files } = await req.json()

  // Validate input
  if (!Array.isArray(files)) {
    throw new Error('Invalid request body')
  }

  const conflicts = []
  const updates = []

  // Process each file
  for (const file of files) {
    // Get existing file record
    const { data: existing } = await supabase
      .from('plr_files')
      .select('*')
      .eq('id', file.id)
      .single()

    if (existing) {
      // Check for conflicts
      const existingUpdated = new Date(existing.updatedAt)
      const fileUpdated = new Date(file.updatedAt)

      if (existingUpdated > fileUpdated) {
        conflicts.push({
          local: file,
          cloud: existing
        })
        continue
      }
    }

    // Update or insert file
    updates.push({
      ...file,
      userId,
      updatedAt: new Date().toISOString()
    })
  }

  // Batch update/insert files
  if (updates.length > 0) {
    const { error } = await supabase
      .from('plr_files')
      .upsert(updates)

    if (error) throw error
  }

  return new Response(
    JSON.stringify({ conflicts }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetChanges(req: Request, userId: string) {
  const url = new URL(req.url)
  const lastSyncTime = url.searchParams.get('lastSyncTime')

  if (!lastSyncTime) {
    throw new Error('Missing lastSyncTime parameter')
  }

  // Get all files modified after lastSyncTime
  const { data: files, error } = await supabase
    .from('plr_files')
    .select('*')
    .eq('userId', userId)
    .gt('updatedAt', lastSyncTime)
    .order('updatedAt', { ascending: true })

  if (error) throw error

  return new Response(
    JSON.stringify({ files }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}