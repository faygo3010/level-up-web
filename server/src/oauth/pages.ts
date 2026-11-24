/** Server-rendered sign-in and consent pages. Every dynamic value is HTML-escaped. */

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const STYLE = `
:root{--bg:#0a0a0a;--card:#141414;--line:#262626;--fg:#f5f5f5;--muted:#9a9a9a;--bad:#f87171;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f6f6f4;--card:#fff;--line:#e0e0dc;--fg:#111;--muted:#5c5c5c;--bad:#dc2626;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px max(16px,env(safe-area-inset-left))}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px;display:flex;flex-direction:column;gap:16px}
.logo{font-weight:800;letter-spacing:-.02em}.logo span{color:var(--muted)}
h1{margin:0;font-size:22px;letter-spacing:-.01em}p{margin:0;color:var(--muted)}
form{display:flex;flex-direction:column;gap:12px}label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--muted)}
input{font:inherit;color:inherit;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg)}
button{font:inherit;font-weight:700;padding:12px;border-radius:12px;border:1px solid var(--fg);background:var(--fg);color:var(--bg);cursor:pointer}
button.secondary{background:none;color:var(--fg);border-color:var(--line)}
.row{display:flex;gap:8px}.row button{flex:1}.error{color:var(--bad)}
ul{margin:0;padding-left:18px;color:var(--muted)}code{font-size:13px;word-break:break-all}
`

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>${esc(title)} · Level Up</title><style>${STYLE}</style></head>
<body><main><div class="logo">Level<span>Up</span></div>${body}</main></body></html>`
}

const hidden = (name: string, value: string) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`
const errorLine = (error?: string) => (error ? `<p class="error" role="alert">${esc(error)}</p>` : '')

export function emailPage(req: string, appName: string, error?: string): string {
  return page(
    'Sign in',
    `<h1>Connect ${esc(appName)}</h1>
<p>Sign in with the email you use for Level Up. We'll email you a 6-digit code.</p>
${errorLine(error)}
<form method="post" action="/signin/email">${hidden('req', req)}
<label>Email<input type="email" name="email" autocomplete="email" required autofocus maxlength="254"></label>
<button type="submit">Email me a code</button></form>`,
  )
}

export function codePage(req: string, email: string, error?: string): string {
  return page(
    'Enter code',
    `<h1>Check your email</h1>
<p>We sent a code to <strong>${esc(email)}</strong>.</p>
${errorLine(error)}
<form method="post" action="/signin/code">${hidden('req', req)}${hidden('email', email)}
<label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus pattern="[0-9]{6,10}" maxlength="10"></label>
<button type="submit">Continue</button></form>`,
  )
}

export function consentPage(req: string, appName: string, redirectHost: string, email: string, canWrite: boolean): string {
  return page(
    'Allow access',
    `<h1>Allow ${esc(appName)} to use your Level Up?</h1>
<p>Signed in as <strong>${esc(email)}</strong>.</p>
<p>${esc(appName)} will be able to:</p>
<ul><li>See your routines, rules, goals, journal and progress</li>${
      canWrite ? '<li>Tick things off, log entries, and add or change routines, rules and goals</li>' : ''
    }</ul>
<p>Access is sent to <code>${esc(redirectHost)}</code>. Only allow apps you trust. You can disconnect it any time in Level Up → Settings.</p>
<form method="post" action="/signin/consent">${hidden('req', req)}
<div class="row"><button class="secondary" type="submit" name="decision" value="deny">Cancel</button>
<button type="submit" name="decision" value="allow">Allow</button></div></form>`,
  )
}

export function messagePage(title: string, message: string): string {
  return page(title, `<h1>${esc(title)}</h1><p>${esc(message)}</p>`)
}
