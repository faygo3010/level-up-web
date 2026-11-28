import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { today } from '../src/core/dates'
import { starterState } from '../src/core/defaults'

export const STORAGE_KEY = 'levelup:v1'

export const SCREENS = [
  { hash: 'home', tab: 'Home', heading: /^Good (morning|afternoon|evening)\.$/ },
  { hash: 'today', tab: 'Today', heading: /^Good (morning|afternoon|evening)\.$/ },
  { hash: 'calendar', tab: 'Calendar', heading: /^[A-Z][a-z]+ \d{4}$/ },
  { hash: 'areas', tab: 'Areas', heading: 'Areas' },
  { hash: 'journal', tab: 'Journal', heading: 'Journal' },
  { hash: 'insights', tab: 'Insights', heading: 'Insights' },
  { hash: 'prefs', tab: 'Settings', heading: 'Settings' },
] as const

export type ScreenHash = (typeof SCREENS)[number]['hash']

interface Options {
  /** Start with the starter system already set up (true), or as a brand-new user (false). */
  seeded: boolean
}

interface Fixtures {
  /** Console errors and uncaught exceptions seen during the test. Asserted empty after every test. */
  consoleErrors: string[]
  app: AppDriver
}

export class AppDriver {
  constructor(readonly page: Page) {}

  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 })
  }

  /** Open a screen by URL hash and wait for its page heading. Each test starts from a fresh context, so the starter system loads. */
  async open(hash: ScreenHash): Promise<void> {
    await this.page.goto(`./#${hash}`)
    const screen = SCREENS.find((s) => s.hash === hash)!
    await expect(this.page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible()
  }

  /** Navigate with the main tab bar, like a user would. */
  async tab(name: string): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click()
  }

  sheet(): Locator {
    return this.page.getByRole('dialog')
  }

  async save(): Promise<void> {
    await this.sheet().getByRole('button', { name: 'Save' }).click()
    await expect(this.sheet()).toBeHidden()
  }

  /** Parsed copy of what the app persisted to localStorage. */
  async stored(): Promise<Record<string, any>> {
    const raw = await this.page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    expect(raw, 'app state should be persisted').not.toBeNull()
    return JSON.parse(raw!)
  }
}

export const test = base.extend<Fixtures & Options>({
  seeded: [true, { option: true }],
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`)
    })
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    await use(errors)
    expect(errors, 'no console errors or uncaught exceptions').toEqual([])
  },
  app: async ({ page, consoleErrors, seeded }, use) => {
    void consoleErrors // ensure the console listener is attached for every test that drives the app
    if (seeded) {
      // Only when empty, so reloads within a test keep what the test saved.
      await page.addInitScript(([key, value]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value)
      }, [STORAGE_KEY, JSON.stringify(starterState(today()))] as const)
    }
    await use(new AppDriver(page))
  },
})

export { expect }
