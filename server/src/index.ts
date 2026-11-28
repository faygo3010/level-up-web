import { z } from 'zod'
import { createApp } from './app'
import { memoryStores } from './stores/memory'
import { supabaseStores } from './stores/supabase'

const env = z
  .object({
    PORT: z.coerce.number().int().default(8787),
    PUBLIC_URL: z.string().url(),
    APP_ORIGINS: z.string().default(''),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    SUPABASE_ANON_KEY: z.string().min(20).optional(),
    /** Local development only: keeps everything in memory and prints sign-in codes. */
    USE_MEMORY_STORES: z.enum(['true', 'false']).default('false'),
    /** Reverse-proxy hops in front of the server (Render: 1; directly exposed: 0). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    /** Offer emailed sign-in codes. Only turn on once the Supabase email templates include {{ .Token }}. */
    EMAIL_CODE_SIGNIN: z.enum(['true', 'false']).default('false'),
    /** Override where Google sign-in returns (default: the app's /connect-google.html page). */
    GOOGLE_RETURN_URL: z.string().url().optional(),
  })
  .parse(process.env)

function stores() {
  if (env.USE_MEMORY_STORES === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('USE_MEMORY_STORES is for local development only')
    console.warn('Using in-memory stores. Every sign-in code is 123456. Data is lost on restart.')
    return memoryStores()
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (or USE_MEMORY_STORES=true for local dev).')
  }
  return supabaseStores(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_ANON_KEY)
}

const app = createApp({
  publicUrl: env.PUBLIC_URL,
  appOrigins: env.APP_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  stores: stores(),
  trustProxy: env.TRUST_PROXY,
  emailCodes: env.EMAIL_CODE_SIGNIN === 'true',
  ...(env.GOOGLE_RETURN_URL && { googleReturnUrl: env.GOOGLE_RETURN_URL }),
})

app.listen(env.PORT, () => {
  console.info(`Level Up connector listening on :${env.PORT}. MCP endpoint: ${new URL('/mcp', env.PUBLIC_URL).href}`)
})
