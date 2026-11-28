import { expect, test } from './fixtures'

test('Google sign-in for an AI app is handed straight on to the connector', async ({ page }) => {
  let forwarded = ''
  await page.route('https://levelup-connector.onrender.com/**', (route) => {
    forwarded = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Connector</h1>' })
  })
  await page.goto('./connect-google.html?code=abc123')
  await expect(page.getByRole('heading', { name: 'Connector' })).toBeVisible()
  expect(forwarded).toBe('https://levelup-connector.onrender.com/signin/google/callback?code=abc123')
})
