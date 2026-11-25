import { expect, test } from './fixtures'

/** "3 of 13 done. 10 left." -> { done: 3, total: 13 } (totals depend on the weekday, so read them rather than hard-code). */
async function progress(page: import('@playwright/test').Page) {
  const line = page.getByText(/^\d+ of \d+ done\./)
  await expect(line).toBeVisible()
  const [, done, total] = (await line.textContent())!.match(/^(\d+) of (\d+) done/)!
  return { done: Number(done), total: Number(total), line }
}

test.describe('Morning check-in', () => {
  test('ticks routines and reviews rules, and it all survives a reload', async ({ app, page }) => {
    await app.open('today')
    const before = await progress(page)
    expect(before.done).toBe(0)

    // Every-day routines, so the test holds on any weekday.
    const steps = page.getByRole('checkbox', { name: '10k steps' })
    const spending = page.getByRole('checkbox', { name: 'Log spending' })
    await steps.check()
    await spending.check()
    await expect(steps).toBeChecked()
    await expect(page.getByText(`2 of ${before.total} done. ${before.total - 2} left.`)).toBeVisible()

    const risk = page.getByRole('group', { name: 'Did you keep: Max 1% account risk per trade' })
    const stop = page.getByRole('group', { name: 'Did you keep: Stop loss set before entry' })
    await risk.getByRole('button', { name: 'Kept' }).click()
    await stop.getByRole('button', { name: 'Broke' }).click()
    await expect(risk.getByRole('button', { name: 'Kept' })).toHaveAttribute('aria-pressed', 'true')
    await expect(stop.getByRole('button', { name: 'Broke' })).toHaveAttribute('aria-pressed', 'true')
    // A kept rule counts toward the day; a broken one does not.
    await expect(page.getByText(`3 of ${before.total} done. ${before.total - 3} left.`)).toBeVisible()

    // Unticking is reversible.
    await steps.uncheck()
    await expect(page.getByText(`2 of ${before.total} done.`)).toBeVisible()
    await steps.check()
    await expect(page.getByText(`3 of ${before.total} done.`)).toBeVisible()

    await page.reload()
    await expect(app.heading()).toBeVisible()
    await expect(page.getByRole('checkbox', { name: '10k steps' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Log spending' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Train', exact: true })).not.toBeChecked()
    await expect(risk.getByRole('button', { name: 'Kept' })).toHaveAttribute('aria-pressed', 'true')
    await expect(stop.getByRole('button', { name: 'Broke' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(`3 of ${before.total} done. ${before.total - 3} left.`)).toBeVisible()

    const stored = await app.stored()
    const [day] = Object.keys(stored.completions)
    expect(stored.completions[day!]).toEqual(expect.arrayContaining(['fit-steps', 'fin-log']))
    expect(stored.ruleChecks[day!]).toEqual({ 'trade-risk': true, 'trade-stop': false })
  })
})
