import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { starterState } from '../../core/defaults'
import { formatDay, today } from '../../core/dates'
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

/** Renders the app and waits for the (lazily loaded) screen's heading. */
async function renderApp(initial: AppState = starterState(today()), hash = '') {
  window.location.hash = hash
  const view = render(
    <StoreProvider initial={initial}>
      <SyncProvider supabase={null}>
        <Spy />
        <App />
      </SyncProvider>
    </StoreProvider>,
  )
  await screen.findByRole('heading', { level: 1 })
  return view
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const click = (name: string | RegExp) => fireEvent.click(button(name))
const field = (label: RegExp) => screen.getByLabelText(label)
const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } })
const sheet = () => screen.getByRole('dialog')
/** Error text shown in the open sheet (Astryx adds its own alert regions too). */
const sheetError = () => within(sheet()).getAllByRole('alert').map((a) => a.textContent).join(' ')
const save = () => fireEvent.click(within(sheet()).getByRole('button', { name: /^Save/ }))

beforeEach(() => localStorage.clear())

describe('Today', () => {
  it('ticks routines, reviews rules and logs goal progress', async () => {
    await renderApp()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening)\.$/)
    const steps = screen.getByRole('checkbox', { name: /10k steps/ })
    fireEvent.click(steps)
    expect(latest.completions[today()]).toContain('fit-steps')
    fireEvent.click(steps)
    expect(latest.completions[today()]).not.toContain('fit-steps')

    const kept = screen.getAllByRole('button', { name: 'Kept' })[0]!
    fireEvent.click(kept)
    expect(Object.values(latest.ruleChecks[today()] ?? {})).toEqual([true])
    fireEvent.click(kept)
    expect(latest.ruleChecks[today()]).toEqual({})
    fireEvent.click(screen.getAllByRole('button', { name: 'Broke' })[0]!)
    expect(Object.values(latest.ruleChecks[today()] ?? {})).toEqual([false])

    click('Add 1 to Training sessions')
    type(/^Log amount for Discretionary spending$/, '450')
    fireEvent.blur(field(/^Log amount for Discretionary spending$/))
    click('Log amount for Discretionary spending now')
    expect(screen.getByText(/Over by £50 this month/)).toBeInTheDocument()
    expect(latest.goalEntries.map((e) => e.value)).toEqual([1, 450])
  })

  it('explains an empty system', async () => {
    await renderApp({ ...starterState(today()), routines: [], rules: [], goals: [] })
    expect(screen.getByText(/Your system is empty/)).toBeInTheDocument()
  })
})

describe('Areas', () => {
  it('adds, edits and archives routines, rules and goals in an area', async () => {
    await renderApp(undefined, '#areas')
    click('Open Trading')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Trading')

    click('Add routine')
    save()
    expect(sheetError()).toContain('Say what you do.')
    type(/What do you do\?/, 'Review charts')
    click('Sat')
    save()
    expect(latest.routines.at(-1)).toMatchObject({ title: 'Review charts', areaId: 'trading', days: [1, 2, 3, 4, 5, 6] })

    fireEvent.click(screen.getByText('Review charts'))
    type(/What do you do\?/, 'Review charts & levels')
    save()
    expect(latest.routines.at(-1)?.title).toBe('Review charts & levels')

    click('Add rule')
    type(/^Rule/, 'No revenge trades')
    save()
    fireEvent.click(screen.getByText('No revenge trades'))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Archive' }))
    expect(latest.rules.find((r) => r.text === 'No revenge trades')?.archived).toBe(true)

    click('Add goal')
    type(/^Goal/, 'Green days')
    save()
    expect(sheetError()).toContain('Set a target above 0.')
    type(/^Target/, '3')
    fireEvent.blur(field(/^Target/))
    type(/^Unit/, 'days')
    save()
    expect(latest.goals.at(-1)).toMatchObject({ title: 'Green days', target: 3, areaId: 'trading' })
    click('Edit goal Green days')
    type(/^Target/, '4')
    fireEvent.blur(field(/^Target/))
    save()
    expect(latest.goals.at(-1)?.target).toBe(4)

    click('Edit')
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Archive' }))
    expect(latest.areas.find((a) => a.id === 'trading')?.archived).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Areas')
  })

  it('adds a new area with a chosen colour and refuses an empty name', async () => {
    await renderApp(undefined, '#areas')
    click('Add area')
    save()
    expect(sheetError()).toContain('Give the area a name.')
    expect(latest.areas).toHaveLength(4)
    type(/^Name/, 'Health')
    click('Yellow')
    save()
    expect(latest.areas.at(-1)).toMatchObject({ name: 'Health', color: '#fcd34d' })
    click('Open Health')
    expect(screen.getByText(/No routines yet/)).toBeInTheDocument()
    click('‹ Areas')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Areas')
  })
})

describe('Journal', () => {
  const pick = (name: string) => fireEvent.click(within(sheet()).getByRole('radio', { name }))

  it('logs trades, workouts, money and notes with validation', async () => {
    await renderApp(undefined, '#journal')
    expect(screen.getByText('No entries yet')).toBeInTheDocument()

    click('New entry')
    save()
    expect(sheetError()).toMatch(/P&L/)
    type(/^Symbol/, 'es')
    type(/^P&L/, '-120')
    fireEvent.blur(field(/^P&L/))
    save()
    expect(sheetError()).toMatch(/followed your plan/)
    pick('Broke plan')
    save()
    expect(latest.logs[0]).toMatchObject({ kind: 'trade', areaId: 'trading', trade: { symbol: 'ES', pnl: -120, followedPlan: false } })
    expect(screen.getByText(/Broke plan · Trading/)).toBeInTheDocument()
    expect(screen.getByText('-£120')).toBeInTheDocument()
    // Logging a trade ticks the linked "Journal every trade" routine (on weekdays it is scheduled).
    const weekday = new Date().getDay() >= 1 && new Date().getDay() <= 5
    expect((latest.completions[today()] ?? []).includes('trade-journal')).toBe(weekday)

    click('New entry')
    pick('Workout')
    save()
    expect(sheetError()).toMatch(/minutes/)
    type(/^Activity/, 'Run')
    type(/^Minutes/, '40')
    fireEvent.blur(field(/^Minutes/))
    save()
    expect(latest.logs[0]).toMatchObject({ kind: 'workout', areaId: 'fitness', workout: { minutes: 40 } })

    click('New entry')
    pick('Money')
    pick('Received')
    type(/^Amount/, '2000')
    fireEvent.blur(field(/^Amount/))
    type(/^Category/, 'Salary')
    save()
    expect(latest.logs[0]).toMatchObject({ kind: 'money', areaId: 'finance', money: { amount: 2000, category: 'salary' } })
    expect(latest.completions[today()]).toContain('fin-log')

    click('New entry')
    pick('Note')
    save()
    expect(sheetError()).toMatch(/Write something/)
    type(/^Note/, 'Good focus today')
    save()
    expect(latest.logs).toHaveLength(4)

    fireEvent.click(screen.getByRole('radio', { name: 'Trades' }))
    expect(screen.queryByText('Good focus today')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))

    fireEvent.click(screen.getAllByRole('button', { name: /^Delete .* entry$/ })[0]!)
    click(/^Delete\? /)
    expect(latest.logs).toHaveLength(3)
  })
})

describe('Insights', () => {
  it('summarises trading discipline, money and training', async () => {
    const base = starterState(today())
    const entry = { areaId: 'trading', date: today(), text: '', createdAt: 1 }
    await renderApp(
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
    expect(screen.getByText('Off-plan: -£200 across 1 trade. On-plan: £300 across 1 trade. Too few trades (2) to read much into the difference yet.')).toBeInTheDocument()
    expect(screen.getByText('1W · 1L · 0 BE')).toBeInTheDocument()
    expect(screen.getByText('£50')).toBeInTheDocument() // expectancy per trade
    expect(screen.getByText('food')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Daily adherence, oldest first' }).children).toHaveLength(35)
    expect(screen.getByRole('listitem', { name: new RegExp(`${formatDay(today())}: `) })).toBeInTheDocument()
    // This week: logged spending also feeds the linked budget.
    expect(screen.getByText('Spent').previousSibling?.textContent).toBe('£40')
    expect(screen.getByText(/10% of Discretionary spending/)).toBeInTheDocument()
  })

  it('shows empty states with no data', async () => {
    await renderApp(undefined, '#insights')
    expect(screen.getByText('No trades logged this month.')).toBeInTheDocument()
    expect(screen.getByText('No money entries this month.')).toBeInTheDocument()
  })
})

describe('Settings', () => {
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

  it('changes preferences', async () => {
    await renderApp(undefined, '#prefs')
    type(/^Currency symbol/, '$')
    expect(latest.settings.currency).toBe('$')
    const slider = screen.getByRole('slider')
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(latest.settings.streakThreshold).toBe(0.7)
    expect(screen.getByText(/Sync isn't set up/)).toBeInTheDocument()
  })

  it('restores a backup only after confirming, and rejects bad files', async () => {
    await renderApp({ ...starterState(today()), areas: [] }, '#prefs')
    const upload = async (contents: string) =>
      act(async () => {
        fireEvent.change(fileInput(), { target: { files: [new File([contents], 'backup.json', { type: 'application/json' })] } })
      })

    await upload('not json')
    expect(await screen.findByText('File is not valid JSON.')).toBeInTheDocument()

    await upload(serializeState(starterState(today())))
    expect(latest.areas).toHaveLength(0)
    fireEvent.click(await screen.findByRole('button', { name: 'Replace all data' }))
    click('Tap again to replace')
    expect(latest.areas).toHaveLength(4)
    expect(screen.getByText('Backup restored.')).toBeInTheDocument()
  })

  it('deletes everything and reloads the starter system behind two taps', async () => {
    await renderApp(undefined, '#prefs')
    click('Delete all data')
    expect(latest.areas).toHaveLength(4)
    click('Tap again to delete everything')
    expect(latest.areas).toHaveLength(0)
    click('Load starter system')
    click('Tap again: replaces everything')
    expect(latest.areas).toHaveLength(4)
  })

  it('exports and copies backups', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await renderApp(undefined, '#prefs')
    expect(screen.getByText('No backup exported yet.')).toBeInTheDocument()
    click('Export backup (JSON)')
    expect(anchorClick).toHaveBeenCalled()
    expect(screen.getByText('Last backup: today.')).toBeInTheDocument()
    expect(latest.settings.lastBackupAt).toBeGreaterThan(0)
    await act(async () => click('Copy backup to clipboard'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"version": 1'))
    expect(screen.getByText(/Backup copied/)).toBeInTheDocument()
    anchorClick.mockRestore()
  })
})

describe('Coach memory and calendar', () => {
  it('shows what AI apps saved and lets you delete it', async () => {
    await renderApp(
      { ...starterState(today()), memories: [{ id: 'm1', text: 'Overtrades after a red morning', areaId: 'trading', createdAt: 1, source: 'Claude' }] },
      '#prefs',
    )
    expect(screen.getByText('Overtrades after a red morning')).toBeInTheDocument()
    expect(screen.getByText(/Trading · saved by Claude/)).toBeInTheDocument()
    click('Delete')
    click('Delete?')
    expect(latest.memories).toEqual([])
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
  })

  it('exports routines as a calendar file', async () => {
    let saved: Blob | undefined
    URL.createObjectURL = vi.fn((b: Blob) => ((saved = b), 'blob:x'))
    URL.revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await renderApp(undefined, '#prefs')
    click('Add routines to my calendar (.ics)')
    expect(saved?.type).toBe('text/calendar')
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(saved!)
    })
    expect(text).toContain('SUMMARY:Pre-market prep & levels (Trading)')
    anchorClick.mockRestore()
  })
})

describe('navigation', () => {
  it('switches tabs and keeps the tab in the URL hash', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: /^Journal/ }))
    expect(window.location.hash).toBe('#journal')
    expect(await screen.findByRole('heading', { level: 1, name: 'Journal' })).toBeInTheDocument()
    act(() => {
      window.location.hash = '#insights'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Insights' })).toBeInTheDocument()
  })
})
