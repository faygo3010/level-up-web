import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@astryxdesign/core/Button'
import { Code } from '@astryxdesign/core/Code'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { List, ListItem } from '@astryxdesign/core/List'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
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
    <VStack gap={3}>
      <Text color="secondary">
        Use Level Up from Claude, ChatGPT or any AI app that supports custom connectors (MCP). Add this URL as a connector, sign in
        with your Level Up email, and the AI can see your schedule, tick things off and update your goals.
      </Text>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Code aria-label="Connector URL">{mcpUrl}</Code>
        </StackItem>
        <Button size="sm" variant="secondary" label="Copy" onClick={copy} />
      </HStack>

      <Heading level={3}>Connected apps</Heading>
      {connections === null && !message && <Text color="secondary">Loading…</Text>}
      {connections?.length === 0 && <Empty>No AI apps connected yet.</Empty>}
      {connections && connections.length > 0 && (
        <List hasDividers>
          {connections.map((c) => (
            <ListItem
              key={c.clientId}
              label={c.clientName}
              description={c.lastUsedAt ? `last used ${ago(c.lastUsedAt)}` : `connected ${ago(c.connectedAt)}`}
              endContent={<ConfirmButton size="sm" label="Disconnect" confirmLabel="Tap to confirm" onConfirm={() => void disconnect(c)} />}
            />
          ))}
        </List>
      )}

      {activity.length > 0 && (
        <>
          <Heading level={3}>Recent AI activity</Heading>
          <List hasDividers density="compact">
            {activity.map((a, i) => (
              <ListItem key={`${a.at}-${i}`} label={a.summary} description={`${a.clientName} · ${ago(a.at)}`} />
            ))}
          </List>
        </>
      )}

      <HStack>
        <Button variant="ghost" size="sm" label="Refresh" onClick={() => void load()} />
      </HStack>
      {message && (
        <Text color="secondary" role="status">
          {message}
        </Text>
      )}
    </VStack>
  )
}
