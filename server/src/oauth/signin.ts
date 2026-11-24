import express, { type Request, type Response, type Router } from 'express'
import rateLimit, { type Options } from 'express-rate-limit'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { EmailAuth, OAuthStore, PendingAuthorization } from '../stores/types'
import { codePage, consentPage, emailPage, messagePage } from './pages'
import { hash, secret, SCOPES, type LevelUpOAuthProvider } from './provider'

const MAX_CODE_ATTEMPTS = 5
const COOKIE = 'lu_signin'

const reqId = z.string().min(20).max(100)
const emailField = z.string().trim().toLowerCase().email().max(254)
const codeField = z.string().trim().regex(/^\d{6,10}$/)

interface Deps {
  readonly store: OAuthStore
  readonly emailAuth: EmailAuth
  readonly provider: LevelUpOAuthProvider
  /** Send the binding cookie with the Secure flag (true whenever served over https). */
  readonly secureCookies: boolean
  readonly now?: () => number
}

/** Pages are never framed (clickjacking) or cached. */
function secureHeaders(res: Response) {
  res.set({
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
}

function send(res: Response, html: string, status = 200) {
  secureHeaders(res)
  res.status(status).type('html').send(html)
}

const expired = (res: Response) =>
  send(res, messagePage('Sign-in expired', 'Go back to your AI app and connect Level Up again.'), 400)

function readCookie(req: Request): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return decodeURIComponent(v.join('='))
  }
  return null
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Limit keyed by the (hashed) email being signed in, so spreading guesses over many sign-ins or IPs doesn't help. */
function perEmail(limit: number): Partial<Options> {
  return {
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = emailField.safeParse(req.body?.email)
      return `email:${hash(email.success ? email.data : 'invalid')}`
    },
    handler: (_req, res) => send(res, messagePage('Too many attempts', 'Wait 15 minutes, then connect Level Up again from your AI app.'), 429),
  }
}

/**
 * Email → code → consent. Every step must come from the browser that opened
 * the sign-in link (a cookie bound to the pending sign-in), so someone who
 * started a sign-in and sent the link to a victim can never complete it.
 */
export function signInRouter({ store, emailAuth, provider, secureCookies, now = Date.now }: Deps): Router {
  const router = express.Router()
  router.use(express.urlencoded({ extended: false, limit: '10kb' }))
  const perIp = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false })
  const emailSends = rateLimit(perEmail(3))
  const codeTries = rateLimit(perEmail(MAX_CODE_ATTEMPTS))
  const globalSends = rateLimit({ windowMs: 60_000, limit: 60, keyGenerator: () => 'all', standardHeaders: 'draft-7', legacyHeaders: false })

  async function loadPending(raw: unknown): Promise<PendingAuthorization | null> {
    const id = reqId.safeParse(raw)
    if (!id.success) return null
    const p = await store.getPending(id.data)
    return p && p.expiresAt > now() ? p : null
  }

  /** The pending sign-in, only if this request comes from the browser bound to it. */
  async function loadBound(req: Request): Promise<PendingAuthorization | null> {
    const p = await loadPending(req.body?.req)
    const cookie = readCookie(req)
    if (!p || !p.browserHash || !cookie || !sameHash(p.browserHash, hash(cookie))) return null
    return p
  }

  async function appName(p: PendingAuthorization): Promise<string> {
    const name = (await store.getClient(p.clientId))?.client_name?.trim()
    return name ? name.slice(0, 60) : 'An AI app'
  }

  router.get('/signin', perIp, async (req: Request, res: Response) => {
    const p = await loadPending(req.query.req)
    if (!p) return expired(res)
    const cookie = readCookie(req)
    if (p.browserHash) {
      // Already opened: only that same browser may continue (e.g. after a refresh).
      if (!cookie || !sameHash(p.browserHash, hash(cookie))) return expired(res)
    } else {
      const value = secret()
      await store.savePending({ ...p, browserHash: hash(value) })
      res.cookie(COOKIE, value, { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/signin', maxAge: 15 * 60_000 })
    }
    send(res, emailPage(p.id, await appName(p)))
  })

  router.post('/signin/email', perIp, globalSends, emailSends, async (req: Request, res: Response) => {
    const p = await loadBound(req)
    if (!p) return expired(res)
    const email = emailField.safeParse(req.body.email)
    if (!email.success) return send(res, emailPage(p.id, await appName(p), 'Enter a valid email address.'), 400)
    try {
      await emailAuth.sendCode(email.data)
    } catch {
      return send(res, emailPage(p.id, await appName(p), "Couldn't send the code. Wait a minute and try again."), 502)
    }
    send(res, codePage(p.id, email.data))
  })

  router.post('/signin/code', perIp, codeTries, async (req: Request, res: Response) => {
    const p = await loadBound(req)
    if (!p) return expired(res)
    const email = emailField.safeParse(req.body.email)
    const code = codeField.safeParse(req.body.code)
    if (!email.success) return expired(res)
    const userId = code.success ? await emailAuth.verifyCode(email.data, code.data) : null
    if (!userId) {
      const attempts = (p.attempts ?? 0) + 1
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await store.deletePending(p.id)
        return send(res, messagePage('Too many attempts', 'Go back to your AI app and connect Level Up again.'), 429)
      }
      await store.savePending({ ...p, attempts })
      return send(res, codePage(p.id, email.data, 'That code is wrong or expired. Only existing Level Up accounts can connect.'), 400)
    }
    await store.savePending({ ...p, userId, email: email.data })
    send(res, consentPage(p.id, await appName(p), new URL(p.redirectUri).host, email.data, p.scopes.includes(SCOPES.write)))
  })

  router.post('/signin/consent', perIp, async (req: Request, res: Response) => {
    const p = await loadBound(req)
    if (!p || !p.userId) return expired(res)
    res.clearCookie(COOKIE, { path: '/signin' })
    if (req.body.decision !== 'allow') {
      await store.deletePending(p.id)
      const url = new URL(p.redirectUri)
      url.searchParams.set('error', 'access_denied')
      if (p.state !== undefined) url.searchParams.set('state', p.state)
      return res.redirect(302, url.href)
    }
    const { redirect } = await provider.issueCode(p.id)
    res.redirect(302, redirect)
  })

  return router
}
