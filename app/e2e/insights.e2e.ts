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
      if (!followed) await app.sheet().getByRole('checkbox', { name: /I followed my plan/ }).uncheck()
      await app.save()
    }

    await app.tab('Insights')
    await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
    await expect(page.getByText('Breaking your rules cost £200 this month. Following them made £300.')).toBeVisible()
    const trading = page.getByRole('region').or(page.locator('section')).filter({ has: page.getByRole('heading', { name: 'Trading this month' }) })
    await expect(trading.getByText('£100', { exact: true })).toBeVisible()
    await expect(trading.getByText('2 trades')).toBeVisible()
    await expect(trading.getByText('50%')).toHaveCount(2) // win rate and plan adherence
  })
})
