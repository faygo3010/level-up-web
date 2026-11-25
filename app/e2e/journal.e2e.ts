import { expect, test, type AppDriver } from './fixtures'

async function newEntry(app: AppDriver, kind: 'Trade' | 'Workout' | 'Money' | 'Note') {
  await app.page.getByRole('button', { name: 'New entry' }).click()
  await expect(app.sheet().getByRole('heading', { name: 'New journal entry' })).toBeVisible()
  if (kind !== 'Trade') await app.sheet().getByRole('radio', { name: kind }).click()
}

test.describe('Journal', () => {
  test('logs a broken-plan trade, money spent and a workout, filters, and deletes behind two taps', async ({ app, page }) => {
    await app.open('journal')
    await expect(page.getByRole('heading', { name: 'No entries yet' })).toBeVisible()

    await newEntry(app, 'Trade')
    await app.sheet().getByRole('button', { name: 'Save' }).click()
    await expect(app.sheet().getByRole('alert').filter({ hasText: /P&L/ })).toBeVisible()
    await app.sheet().getByLabel('Symbol').fill('es')
    await app.sheet().getByLabel('P&L').fill('-120')
    await app.sheet().getByRole('radio', { name: 'Broke plan' }).click()
    await app.save()

    await newEntry(app, 'Money')
    await app.sheet().getByRole('radio', { name: 'Spent' }).click()
    await app.sheet().getByLabel('Amount').fill('25')
    await app.sheet().getByLabel('Category').fill('Food')
    await app.save()

    await newEntry(app, 'Workout')
    await app.sheet().getByLabel('Activity').fill('Run')
    await app.sheet().getByLabel('Minutes').fill('40')
    await app.save()

    const trade = page.getByRole('listitem').filter({ hasText: 'ES long' }).filter({ hasText: '-£120' })
    const spend = page.getByRole('listitem').filter({ hasText: 'food' }).filter({ hasText: '-£25' })
    const run = page.getByRole('listitem').filter({ hasText: 'Run · 40 min' })
    await expect(trade).toBeVisible()
    await expect(trade.getByText(/Broke plan · Trading/)).toBeVisible()
    await expect(spend).toBeVisible()
    await expect(run).toBeVisible()

    const filter = page.getByRole('radiogroup', { name: 'Show' })
    await filter.getByRole('radio', { name: 'Trades' }).click()
    await expect(trade).toBeVisible()
    await expect(spend).toBeHidden()
    await expect(run).toBeHidden()
    await filter.getByRole('radio', { name: 'Money' }).click()
    await expect(spend).toBeVisible()
    await expect(trade).toBeHidden()
    await filter.getByRole('radio', { name: 'All' }).click()
    await expect(page.getByRole('button', { name: /^Delete .* entry$/ })).toHaveCount(3)

    // First tap only arms the button; nothing is removed yet.
    await spend.getByRole('button', { name: /^Delete .* entry$/ }).click()
    await expect(spend.getByRole('button', { name: /^Delete\? / })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Delete\??( .* entry)?$/ })).toHaveCount(3)
    expect((await app.stored()).logs).toHaveLength(3)
    await spend.getByRole('button', { name: /^Delete\? / }).click()
    await expect(spend).toHaveCount(0)
    await expect(trade).toBeVisible()
    await expect(run).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible()
    await expect(trade).toBeVisible()
    await expect(spend).toHaveCount(0)
    const logs = (await app.stored()).logs as { kind: string }[]
    expect(logs.map((l) => l.kind).sort()).toEqual(['trade', 'workout'])
  })
})
