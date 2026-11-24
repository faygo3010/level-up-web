import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AiConnections } from '../AiConnections'

const URL_BASE = 'https://connector.example'
const now = Date.now()

function mockFetch(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: { url: string; method: string; auth: string | null }[] = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, auth: new Headers(init?.headers).get('Authorization') })
    const key = `${method} ${new URL(url).pathname}`
    if (overrides[key]) return overrides[key]!()
    if (key === 'GET /api/connections')
      return json({ success: true, data: [{ clientId: 'c1', clientName: 'Claude', connectedAt: now - 3_600_000, lastUsedAt: now - 120_000 }] })
    if (key === 'GET /api/activity')
      return json({ success: true, data: [{ clientName: 'Claude', tool: 'complete_routine', summary: 'Ticked off "Train"', at: now - 60_000 }] })
    if (key === 'DELETE /api/connections/c1') return json({ success: true })
    return json({ success: false, error: 'nope' }, 404)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

afterEach(() => vi.unstubAllGlobals())

const token = async () => 'session-token'

describe('AiConnections', () => {
  it('shows the connector URL, connected apps and recent activity', async () => {
    const { calls } = mockFetch()
    render(<AiConnections connectorUrl={URL_BASE} getToken={token} />)
    expect(screen.getByLabelText('Connector URL').textContent).toBe('https://connector.example/mcp')
    expect(await screen.findByText('Claude')).toBeInTheDocument()
    expect(screen.getByText(/last used 2 min ago/)).toBeInTheDocument()
    expect(screen.getByText('Ticked off "Train"')).toBeInTheDocument()
    expect(calls.every((c) => c.auth === 'Bearer session-token')).toBe(true)
  })

  it('disconnects an app only after a second tap', async () => {
    const { calls } = mockFetch()
    render(<AiConnections connectorUrl={URL_BASE} getToken={token} />)
    const button = await screen.findByRole('button', { name: 'Disconnect' })
    fireEvent.click(button)
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Tap to confirm' }))
    expect(await screen.findByText('Claude disconnected.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/api/connections/c1'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
  })

  it('does not reload in a loop when the parent passes new callbacks each render', async () => {
    const { fn } = mockFetch()
    const onRefresh = vi.fn()
    const { rerender } = render(<AiConnections connectorUrl={URL_BASE} getToken={async () => 't'} onRefresh={onRefresh} />)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    for (let i = 0; i < 3; i++) rerender(<AiConnections connectorUrl={URL_BASE} getToken={async () => 't'} onRefresh={() => onRefresh()} />)
    await act(async () => new Promise((r) => setTimeout(r, 20)))
    expect(fn).toHaveBeenCalledTimes(2) // one connections + one activity request
  })

  it('shows a helpful message when the connector is unreachable', async () => {
    mockFetch({ 'GET /api/connections': () => new Response('down', { status: 502 }) })
    render(<AiConnections connectorUrl={URL_BASE} getToken={token} />)
    expect(await screen.findByText(/Couldn't reach the connector/)).toBeInTheDocument()
  })

  it('does nothing while signed out', async () => {
    const { fn } = mockFetch()
    render(<AiConnections connectorUrl={URL_BASE} getToken={async () => null} />)
    await act(async () => new Promise((r) => setTimeout(r, 10)))
    expect(fn).not.toHaveBeenCalled()
  })
})
