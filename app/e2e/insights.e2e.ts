import { expect, test } from './fixtures'

test.describe('Insights', () => {
  test('reflects logged trades in the trading verdict', async ({ app, page }) => {
    await app.open('insights')
    await expect(page.getByRole('heading', { name: 'No trades logged this month.' })).toBeVisible()

    await app.tab('Journal')
    await expect(page).toHaveURL(/#journal$/)
    for (const [symbol, pnl, followed] of [
      ['NQ', '-200', false],
      ['ES', '300', true],
    ] as const) {
      await page.getByRole('button', { name: 'New entry' }).click()
      await app.sheet().getByLabel('Symbol').fill(symbol)
      await app.sheet().getByLabel('P&L').fill(pnl)
      await app.sheet().getByRole('radio', { name: followed ? 'Followed plan' : 'Broke plan' }).click()
      await app.save()
    }

    await app.tab('Insights')
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
    await expect(page.getByText('Off-plan: -£200 across 1 trade. On-plan: £300 across 1 trade. Too few trades (2) to read much into the difference yet.')).toBeVisible()
    const trading = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Trading this month' }) })
    await expect(trading.getByText('£100', { exact: true })).toBeVisible()
    await expect(trading.getByText('1W · 1L · 0 BE')).toBeVisible()
    await expect(trading.getByText('£50', { exact: true })).toBeVisible() // expectancy per trade
    await expect(trading.getByText('50%')).toHaveCount(2) // win rate and plan adherence
  })
})
