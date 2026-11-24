import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { starterState } from '../../core/defaults'
import { today } from '../../core/dates'
import { serializeState } from '../../core/storage'
import type { AppState } from '../../core/types'
import { App } from '../App'
import { StoreProvider, useStore } from '../store'
import { SyncProvider } from '../sync/useSync'

let latest: AppState
function Spy() {
  latest = useStore().state
  return null
}

function renderApp(initial: AppState = starterState(today()), hash = '') {
  window.location.hash = hash
  return render(
    <StoreProvider initial={initial}>
      <SyncProvider supabase={null}>
        <Spy />
        <App />
      </SyncProvider>
    </StoreProvider>,
  )
}

const tab = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: new RegExp(name) }))
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const dialog = () => screen.getByRole('dialog')

beforeEach(() => localStorage.clear())

describe('Today', () => {
  it('ticks routines, reviews rules and logs goal progress', () => {
    renderApp()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening)\.$/)
    const steps = screen.getByText('10k steps')
    fireEvent.click(steps)
    expect(latest.completions[today()]).toContain('fit-steps')
    fireEvent.click(steps)
    expect(latest.completions[today()]).not.toContain('fit-steps')

    fireEvent.click(screen.getAllByRole('button', { name: 'Kept' })[0]!)
    expect(Object.values(latest.ruleChecks[today()] ?? {})).toEqual([true])
    fireEvent.click(screen.getAllByRole('button', { name: 'Kept' })[0]!)
    expect(latest.ruleChecks[today()]).toEqual({})
    fireEvent.click(screen.getAllByRole('button', { name: 'Broke' })[0]!)
    expect(Object.values(latest.ruleChecks[today()] ?? {})).toEqual([false])

    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to Training sessions' }))
    type('Log amount for Discretionary spending', '450')
    fireEvent.click(within(screen.getByLabelText('Log amount for Discretionary spending').closest('form')!).getByText('Log'))
    expect(screen.getByText(/Over by £50 this month/)).toBeInTheDocument()
    expect(latest.goalEntries.map((e) => e.value)).toEqual([1, 450])
  })

  it('explains an empty system', () => {
    renderApp({ ...starterState(today()), routines: [], rules: [], goals: [] })
    expect(screen.getByText(/Your system is empty/)).toBeInTheDocument()
  })
})

describe('Areas', () => {
  it('adds, edits and archives routines, rules and goals in an area', () => {
    renderApp(undefined, '#areas')
    fireEvent.click(screen.getByText('Trading'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Trading')

    fireEvent.click(screen.getByRole('button', { name: 'Add routine' }))
    type('What do you do?', 'Review charts')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Saturday' }))
    fireEvent.change(within(dialog()).getByLabelText('When'), { target: { value: 'evening' } })
    fireEvent.click(within(dialog()).getByText('Save'))
    expect(latest.routines.at(-1)).toMatchObject({ title: 'Review charts', areaId: 'trading', timeOfDay: 'evening' })

    fireEvent.click(screen.getByText('Review charts'))
    type('What do you do?', 'Review charts & levels')
    fireEvent.click(within(dialog()).getByText('Save'))
    expect(latest.routines.at(-1)?.title).toBe('Review charts & levels')

    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    type('Rule', 'No revenge trades')
    fireEvent.click(within(dialog()).getByText('Save'))
    fireEvent.click(screen.getByText('No revenge trades'))
    fireEvent.click(within(dialog()).getByText('Archive'))
    expect(latest.rules.find((r) => r.text === 'No revenge trades')?.archived).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    type('Goal', 'Green days')
    type('Target', '3')
    type('Unit', 'days')
    fireEvent.click(within(dialog()).getByText('Save'))
    expect(latest.goals.at(-1)).toMatchObject({ title: 'Green days', target: 3, areaId: 'trading' })
    fireEvent.click(screen.getAllByText('Edit goal').at(-1)!)
    type('Target', '4')
    fireEvent.click(within(dialog()).getByText('Save'))
    expect(latest.goals.at(-1)?.target).toBe(4)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(within(dialog()).getByText('Archive'))
    expect(latest.areas.find((a) => a.id === 'trading')?.archived).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Areas')
  })

  it('adds a new area with a chosen colour and refuses an empty name', () => {
    renderApp(undefined, '#areas')
    fireEvent.click(screen.getByText('Add area'))
    fireEvent.click(within(dialog()).getByText('Save'))
    expect(latest.areas).toHaveLength(4)
    type('Name', 'Health')
    fireEvent.click(within(dialog()).getAllByRole('button', { name: /Colour/ })[2]!)
    fireEvent.click(within(dialog()).getByText('Save'))
    expect(latest.areas.at(-1)).toMatchObject({ name: 'Health', color: '#fcd34d' })
    expect(screen.getByText('Health')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Health'))
    expect(screen.getByText(/No routines yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('‹ Areas'))
  })
})

describe('Journal', () => {
  const save = () => fireEvent.click(within(dialog()).getByText('Save entry'))

  it('logs trades, workouts, money and notes with validation', () => {
    renderApp(undefined, '#journal')
    expect(screen.getByText(/No entries yet/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('+ Entry'))
    save()
    expect(screen.getByRole('alert').textContent).toMatch(/P&L/)
    type('Symbol', 'es')
    type('P&L', '-120')
    fireEvent.click(screen.getByLabelText(/I followed my plan/))
    save()
    expect(latest.logs[0]).toMatchObject({ kind: 'trade', areaId: 'trading', trade: { symbol: 'ES', pnl: -120, followedPlan: false } })
    expect(screen.getByText('Broke plan')).toBeInTheDocument()

    fireEvent.click(screen.getByText('+ Entry'))
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Workout' }))
    save()
    expect(screen.getByRole('alert').textContent).toMatch(/minutes/)
    type('Activity', 'Run')
    type('Minutes', '40')
    save()
    expect(latest.logs[0]).toMatchObject({ kind: 'workout', areaId: 'fitness', workout: { minutes: 40 } })

    fireEvent.click(screen.getByText('+ Entry'))
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Money' }))
    save()
    fireEvent.click(within(dialog()).getByText('Received'))
    type('Amount', '2000')
    type('Category', 'Salary')
    save()
    expect(latest.logs[0]).toMatchObject({ kind: 'money', areaId: 'finance', money: { amount: 2000, category: 'salary' } })

    fireEvent.click(screen.getByText('+ Entry'))
    fireEvent.click(within(dialog()).getByRole('tab', { name: 'Note' }))
    save()
    expect(screen.getByRole('alert').textContent).toMatch(/Write something/)
    type('Note', 'Good focus today')
    save()
    expect(latest.logs).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: 'Trades' }))
    expect(screen.queryByText('Good focus today')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete entry' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Delete?' }))
    expect(latest.logs).toHaveLength(3)
  })
})

describe('Insights', () => {
  it('summarises trading discipline, money and training', () => {
    const base = starterState(today())
    const entry = { areaId: 'trading', date: today(), text: '', createdAt: 1 }
    renderApp(
      {
        ...base,
        logs: [
          { ...entry, id: 't1', kind: 'trade', trade: { symbol: 'ES', side: 'long', pnl: 300, followedPlan: true } },
          { ...entry, id: 't2', kind: 'trade', trade: { symbol: 'NQ', side: 'short', pnl: -200, followedPlan: false } },
          { ...entry, id: 'm1', areaId: 'finance', kind: 'money', money: { amount: -40, category: 'food' } },
          { ...entry, id: 'w1', areaId: 'fitness', kind: 'workout', workout: { activity: 'Run', minutes: 30 } },
        ],
      },
      '#insights',
    )
    expect(screen.getByText(/Breaking your rules cost £200 this month\. Following them made £300\./)).toBeInTheDocument()
    expect(screen.getByText('food')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Daily adherence heatmap' }).children).toHaveLength(35)
  })

  it('shows empty states with no data', () => {
    renderApp(undefined, '#insights')
    expect(screen.getByText('No trades logged this month.')).toBeInTheDocument()
    expect(screen.getByText('No money entries this month.')).toBeInTheDocument()
  })
})

describe('Settings', () => {
  it('changes preferences', () => {
    renderApp(undefined, '#prefs')
    type('Currency symbol', '$')
    fireEvent.change(screen.getByLabelText('Week starts on'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/A day counts for your streak/), { target: { value: '70' } })
    expect(latest.settings).toMatchObject({ currency: '$', weekStartsOn: 0, streakThreshold: 0.7 })
    expect(screen.getByText(/Sync isn't set up/)).toBeInTheDocument()
  })

  it('restores a backup only after confirming, and rejects bad files', async () => {
    renderApp({ ...starterState(today()), areas: [] }, '#prefs')
    const input = screen.getByTestId('import') as HTMLInputElement
    const upload = async (contents: string) =>
      act(async () => {
        fireEvent.change(input, { target: { files: [new File([contents], 'backup.json', { type: 'application/json' })] } })
      })

    await upload('not json')
    expect((await screen.findByRole('status')).textContent).toBe('File is not valid JSON.')

    await upload(serializeState(starterState(today())))
    expect(latest.areas).toHaveLength(0)
    fireEvent.click(await screen.findByRole('button', { name: 'Replace all data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to replace' }))
    expect(latest.areas).toHaveLength(4)
    expect(screen.getByRole('status').textContent).toBe('Backup restored.')
  })

  it('deletes everything and reloads the starter system behind two taps', () => {
    renderApp(undefined, '#prefs')
    fireEvent.click(screen.getByRole('button', { name: 'Delete all data' }))
    expect(latest.areas).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to delete everything' }))
    expect(latest.areas).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Load starter system' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tap again: replaces everything' }))
    expect(latest.areas).toHaveLength(4)
  })

  it('exports and copies backups', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderApp(undefined, '#prefs')
    fireEvent.click(screen.getByText('Export backup (JSON)'))
    expect(click).toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByText('Copy backup to clipboard')))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"version": 1'))
    expect(screen.getByRole('status').textContent).toMatch(/Backup copied/)
    click.mockRestore()
  })
})

describe('navigation', () => {
  it('switches tabs and keeps the tab in the URL hash', () => {
    renderApp()
    tab('Journal')
    expect(window.location.hash).toBe('#journal')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Journal')
    act(() => {
      window.location.hash = '#insights'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Insights')
  })
})
