import express, { type NextFunction, type Request, type Response, type Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import type { Stores } from './stores/types'

/**
 * Endpoints the Level Up app calls (with the user's app session) to show
 * connected AI apps, revoke them, and read the activity history.
 */
export function appApiRouter(stores: Pick<Stores, 'oauth' | 'activity' | 'sessions'>, appOrigins: readonly string[]): Router {
  const router = express.Router()

  router.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin
    if (origin && appOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      })
    }
    if (req.method === 'OPTIONS') return void res.sendStatus(204)
    next()
  })
  router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }))

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    const userId = token ? await stores.sessions.verify(token).catch(() => null) : null
    if (!userId) return void res.status(401).json({ success: false, error: 'Sign in to Level Up first.' })
    res.locals.userId = userId
    next()
  })

  router.get('/connections', async (_req, res) => {
    const data = await stores.oauth.listConnections(res.locals.userId as string)
    res.json({ success: true, data })
  })

  router.delete('/connections/:clientId', async (req, res) => {
    const clientId = z.string().min(1).max(100).safeParse(req.params.clientId)
    if (!clientId.success) return void res.status(400).json({ success: false, error: 'Unknown app.' })
    await stores.oauth.revokeConnection(res.locals.userId as string, clientId.data)
    res.json({ success: true })
  })

  router.get('/activity', async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(req.query.limit)
    const rows = await stores.activity.list(res.locals.userId as string, limit)
    res.json({ success: true, data: rows.map(({ userId: _u, ...rest }) => rest) })
  })

  return router
}
