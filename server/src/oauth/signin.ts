import express, { type Request, type Response, type Router } from 'express'
import rateLimit, { type Options } from 'express-rate-limit'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { EmailAuth, OAuthStore, PendingAuthorization } from '../stores/types'
import { codePage, consentPage, emailPage as renderEmailPage, messagePage } from './pages'
import { hash, secret, SCOPES, type LevelUpOAuthProvider } from './provider'

const MAX_CODE_ATTEMPTS = 5
const COOKIE = 'lu_signin'
/** Which sign-in a Google callback belongs to (Google can't carry it through for us). */
const REQ_COOKIE = 'lu_req'
const GOOGLE_CALLBACK = '/signin/google/callback'

const reqId = z.string().min(20).max(100)
const emailField = z.string().trim().toLowerCase().email().max(254)
const codeField = z.string().trim().regex(/^\d{6,10}$/)

interface Deps {
  readonly store: OAuthStore
  readonly emailAuth: EmailAuth
  readonly provider: LevelUpOAuthProvider
  /** Send the binding cookie with the Secure flag (true whenever served over https). */
  readonly secureCookies: boolean
  /** This server's public base URL, for the Google callback. */
  readonly publicUrl: string
  /** Offer emailed sign-in codes. Off unless the email template includes the code. */
  readonly emailCodes?: boolean
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

function readCookie(req: Request, name = COOKIE): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='))
      } catch {
        return null
      }
    }
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
export function signInRouter({ store, emailAuth, provider, secureCookies, publicUrl, emailCodes = false, now = Date.now }: Deps): Router {
  const emailPage = (req: string, appName: string, error?: string) => renderEmailPage(req, appName, error, { google: true, emailCodes })
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'lax' as const, path: '/signin', maxAge: 15 * 60_000 }
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
  async function loadBound(req: Request, id: unknown = req.body?.req): Promise<PendingAuthorization | null> {
    const p = await loadPending(id)
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
      res.cookie(COOKIE, value, cookieOptions)
    }
    send(res, emailPage(p.id, await appName(p)))
  })

  router.post('/signin/google', perIp, async (req: Request, res: Response) => {
    const p = await loadBound(req)
    if (!p) return expired(res)
    try {
      const { url, state } = await emailAuth.startGoogle(new URL(GOOGLE_CALLBACK, publicUrl).href)
      await store.savePending({ ...p, google: state })
      res.cookie(REQ_COOKIE, p.id, cookieOptions)
      secureHeaders(res)
      res.redirect(303, url)
    } catch {
      send(res, emailPage(p.id, await appName(p), "Couldn't start Google sign-in. Try again or use your password."), 502)
    }
  })

  router.get(GOOGLE_CALLBACK, perIp, async (req: Request, res: Response) => {
    // Only the browser that started this sign-in carries both cookies.
    const p = await loadBound(req, readCookie(req, REQ_COOKIE))
    if (!p || !p.google) return expired(res)
    const code = z.string().min(1).max(500).safeParse(req.query.code)
    const result = code.success ? await emailAuth.finishGoogle(code.data, p.google) : null
    const { google: _used, ...rest } = p
    if (!result) {
      await store.savePending(rest)
      return send(res, emailPage(p.id, await appName(p), "Google sign-in didn't finish. Try again or use your password."), 400)
    }
    await store.savePending({ ...rest, userId: result.userId, email: result.email })
    send(res, consentPage(p.id, await appName(p), new URL(p.redirectUri).host, result.email || 'your Google account', p.scopes.includes(SCOPES.write)))
  })

  const codesOff = (_req: Request, res: Response, next: () => void) =>
    emailCodes ? next() : send(res, messagePage('Not available', 'Sign in with Google or your password instead.'), 404)

  router.post('/signin/email', codesOff, perIp, globalSends, emailSends, async (req: Request, res: Response) => {
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

  router.post('/signin/password', perIp, codeTries, async (req: Request, res: Response) => {
    const p = await loadBound(req)
    if (!p) return expired(res)
    const email = emailField.safeParse(req.body.email)
    const password = z.string().min(1).max(72).safeParse(req.body.password)
    const userId = email.success && password.success ? await emailAuth.verifyPassword(email.data, password.data) : null
    if (!userId) {
      const attempts = (p.attempts ?? 0) + 1
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await store.deletePending(p.id)
        return send(res, messagePage('Too many attempts', 'Go back to your AI app and connect Level Up again.'), 429)
      }
      await store.savePending({ ...p, attempts })
      return send(res, emailPage(p.id, await appName(p), 'Email or password is incorrect.'), 400)
    }
    await store.savePending({ ...p, userId, email: email.data! })
    send(res, consentPage(p.id, await appName(p), new URL(p.redirectUri).host, email.data!, p.scopes.includes(SCOPES.write)))
  })

  router.post('/signin/code', codesOff, perIp, codeTries, async (req: Request, res: Response) => {
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
    res.clearCookie(REQ_COOKIE, { path: '/signin' })
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
