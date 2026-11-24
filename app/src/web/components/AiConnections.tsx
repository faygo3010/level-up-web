import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ConfirmButton, Empty } from './ui'

const connectionSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  connectedAt: z.number(),
  lastUsedAt: z.number().nullable(),
})
const activitySchema = z.object({ clientName: z.string(), tool: z.string(), summary: z.string(), at: z.number() })
const envelope = <T extends z.ZodTypeAny>(data: T) => z.object({ success: z.boolean(), data: data.optional(), error: z.string().optional() })

type Connection = z.infer<typeof connectionSchema>
type Activity = z.infer<typeof activitySchema>

export interface AiConnectionsProps {
  /** Base URL of the Level Up connector server. */
  readonly connectorUrl: string
  /** The signed-in user's app session token, or null when signed out. */
  readonly getToken: () => Promise<string | null>
  /** Called after loading so the app can pull changes the chatbot made. */
  readonly onRefresh?: () => void
}

const ago = (ms: number): string => {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

async function call<T extends z.ZodTypeAny>(url: string, token: string, schema: T, method = 'GET'): Promise<z.infer<T> | undefined> {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
  const body = envelope(schema).safeParse(await res.json().catch(() => null))
  if (!res.ok || !body.success || !body.data.success) throw new Error(body.success ? body.data.error : 'Bad response')
  return body.data.data
}

export function AiConnections({ connectorUrl, getToken, onRefresh }: AiConnectionsProps) {
  const mcpUrl = new URL('/mcp', connectorUrl).href
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [message, setMessage] = useState('')

  // Callers pass new function identities on every render; keep the latest in
  // refs so loading doesn't re-trigger itself (load -> sync -> re-render -> load).
  const tokenRef = useRef(getToken)
  const refreshRef = useRef(onRefresh)
  tokenRef.current = getToken
  refreshRef.current = onRefresh

  const load = useCallback(async () => {
    const token = await tokenRef.current()
    if (!token) return
    try {
      const [c, a] = await Promise.all([
        call(new URL('/api/connections', connectorUrl).href, token, z.array(connectionSchema)),
        call(new URL('/api/activity?limit=15', connectorUrl).href, token, z.array(activitySchema)),
      ])
      setConnections(c ?? [])
      setActivity(a ?? [])
      setMessage('')
      refreshRef.current?.()
    } catch {
      setMessage("Couldn't reach the connector. Check your connection and try again.")
    }
  }, [connectorUrl])

  useEffect(() => {
    void load()
  }, [load])

  const disconnect = async (c: Connection) => {
    const token = await tokenRef.current()
    if (!token) return
    try {
      await call(new URL(`/api/connections/${encodeURIComponent(c.clientId)}`, connectorUrl).href, token, z.unknown(), 'DELETE')
      setConnections((list) => (list ?? []).filter((x) => x.clientId !== c.clientId))
      setMessage(`${c.clientName} disconnected.`)
    } catch {
      setMessage(`Couldn't disconnect ${c.clientName}. Try again.`)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl)
      setMessage('Connector URL copied.')
    } catch {
      setMessage('Select the URL and copy it.')
    }
  }

  return (
    <div className="stack">
      <p className="muted small">
        Use Level Up from Claude, ChatGPT or any AI app that supports custom connectors (MCP). Add this URL as a connector, sign in
        with your Level Up email, and the AI can see your schedule, tick things off and update your goals.
      </p>
      <div className="copy-row">
        <code className="url" aria-label="Connector URL">
          {mcpUrl}
        </code>
        <button className="chip" onClick={copy}>
          Copy
        </button>
      </div>

      <h3 className="mini-head">Connected apps</h3>
      {connections === null && !message && <p className="muted small">Loading…</p>}
      {connections?.length === 0 && <Empty>No AI apps connected yet.</Empty>}
      {connections?.map((c) => (
        <div key={c.clientId} className="list-item">
          <span className="grow">
            <strong>{c.clientName}</strong>
            <span className="muted small"> · {c.lastUsedAt ? `last used ${ago(c.lastUsedAt)}` : `connected ${ago(c.connectedAt)}`}</span>
          </span>
          <ConfirmButton className="chip" label="Disconnect" confirmLabel="Tap to confirm" onConfirm={() => void disconnect(c)} />
        </div>
      ))}

      {activity.length > 0 && (
        <>
          <h3 className="mini-head">Recent AI activity</h3>
          <ul className="activity">
            {activity.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                <span>{a.summary}</span>
                <span className="muted small">
                  {a.clientName} · {ago(a.at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="btn ghost" onClick={() => void load()}>
        Refresh
      </button>
      {message && (
        <p className="muted small" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
