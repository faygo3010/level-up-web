import { expect, test } from './fixtures'

/**
 * "2 of 7 routines done · 1 of 5 rules kept." -> counts. Totals depend on the
 * weekday, so read them rather than hard-code. Only the visible line is read
 * (a screen-reader copy of it also lives in the page).
 */
async function progress(page: import('@playwright/test').Page) {
  const line = page.getByText(/routines done/).first()
  await expect(line).toBeVisible()
  const text = (await line.textContent())!
  const [, routines, routinesTotal] = text.match(/(?:All )?(\d+)(?: of (\d+))? routines done/)!
  const [, rules, rulesTotal] = text.match(/(\d+) of (\d+) rules kept/)!
  const total = Number(routinesTotal ?? routines)
  return { routines: Number(text.startsWith('All') ? total : routines), routinesTotal: total, rules: Number(rules), rulesTotal: Number(rulesTotal) }
}

const summary = (page: import('@playwright/test').Page, routines: number, routinesTotal: number, rules: number, rulesTotal: number) =>
  expect(page.getByText(`${routines} of ${routinesTotal} routines done · ${rules} of ${rulesTotal} rules kept.`, { exact: false }).first()).toBeVisible()

test.describe('Morning check-in', () => {
  test('ticks routines and reviews rules, and it all survives a reload', async ({ app, page }) => {
    await app.open('today')
    const before = await progress(page)
    expect(before.routines).toBe(0)
    expect(before.rules).toBe(0)
    const T = before.routinesTotal
    const R = before.rulesTotal

    // Every-day routines, so the test holds on any weekday.
    const steps = page.getByRole('checkbox', { name: '10k steps' })
    const spending = page.getByRole('checkbox', { name: 'Log spending' })
    await steps.check()
    await spending.check()
    await expect(steps).toBeChecked()
    await summary(page, 2, T, 0, R)

    const risk = page.getByRole('group', { name: 'Did you keep: Max 1% account risk per trade' })
    const stop = page.getByRole('group', { name: 'Did you keep: Stop loss set before entry' })
    await risk.getByRole('button', { name: 'Kept' }).click()
    await stop.getByRole('button', { name: 'Broke' }).click()
    await expect(risk.getByRole('button', { name: 'Kept' })).toHaveAttribute('aria-pressed', 'true')
    await expect(stop.getByRole('button', { name: 'Broke' })).toHaveAttribute('aria-pressed', 'true')
    // A kept rule counts; a broken one does not, and shows as broken.
    await summary(page, 2, T, 1, R)
    await expect(page.getByText('Broken', { exact: true })).toBeVisible()

    // Unticking is reversible.
    await steps.uncheck()
    await summary(page, 1, T, 1, R)
    await steps.check()
    await summary(page, 2, T, 1, R)

    await page.reload()
    await expect(app.heading()).toBeVisible()
    await expect(page.getByRole('checkbox', { name: '10k steps' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Log spending' })).toBeChecked()
    await expect(risk.getByRole('button', { name: 'Kept' })).toHaveAttribute('aria-pressed', 'true')
    await expect(stop.getByRole('button', { name: 'Broke' })).toHaveAttribute('aria-pressed', 'true')
    await summary(page, 2, T, 1, R)

    const stored = await app.stored()
    const [day] = Object.keys(stored.completions)
    expect(stored.completions[day!]).toEqual(expect.arrayContaining(['fit-steps', 'fin-log']))
    expect(stored.ruleChecks[day!]).toEqual({ 'trade-risk': true, 'trade-stop': false })
  })
})
