import { shell } from 'electron'
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'

const AUTH_URL = 'https://openrouter.ai/auth'
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys'
const TIMEOUT_MS = 180_000

export interface OAuthResult {
  ok: boolean
  key?: string
  error?: string
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resultPage(ok: boolean, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chelp AI — OpenRouter</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(circle at 30% 20%, #221b3d, #0a0910 60%);
    font-family: "Segoe UI", system-ui, sans-serif; color: #f4f2ff;
  }
  .card {
    width: min(420px, calc(100vw - 48px)); padding: 34px 30px; text-align: center;
    border-radius: 18px; border: 1px solid rgba(255,255,255,.09);
    background: rgba(20,18,32,.82); box-shadow: 0 24px 80px rgba(0,0,0,.55);
  }
  .mark {
    width: 46px; height: 46px; margin: 0 auto 18px; border-radius: 13px;
    display: grid; place-items: center; font-size: 22px; font-weight: 700;
    background: linear-gradient(140deg, #8b7dff, #5b4aec);
  }
  h1 { font-size: 19px; margin: 0 0 10px; font-weight: 600; }
  p { margin: 0; font-size: 13.5px; line-height: 1.55; color: #a8a2c2; }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">${ok ? '✓' : '!'}</div>
    <h1>${ok ? 'OpenRouter connected' : 'Authorization failed'}</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`
}

function sendPage(res: http.ServerResponse, ok: boolean, message: string): void {
  res.writeHead(ok ? 200 : 400, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(resultPage(ok, message))
}

export function connectOpenRouter(): Promise<OAuthResult> {
  return new Promise((resolve) => {
    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    let server: http.Server | null = null
    let timer: NodeJS.Timeout | null = null
    let settled = false

    const finish = (result: OAuthResult): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      server?.close()
      resolve(result)
    }

    async function exchange(code: string): Promise<OAuthResult> {
      try {
        const res = await fetch(KEYS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: verifier,
            code_challenge_method: 'S256'
          }),
          signal: AbortSignal.timeout(20_000)
        })
        const json = (await res.json().catch(() => null)) as
          | { key?: string; error?: string | { message?: string } }
          | null
        if (!res.ok || !json?.key) {
          const reason =
            typeof json?.error === 'string' ? json.error : json?.error?.message
          return { ok: false, error: reason || `OpenRouter returned HTTP ${res.status}.` }
        }
        return { ok: true, key: json.key }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: message }
      }
    }

    server = http.createServer(async (req, res) => {
      let url: URL
      try {
        url = new URL(req.url ?? '/', 'http://127.0.0.1')
      } catch {
        res.writeHead(400)
        res.end()
        return
      }
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }
      const denied = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      if (denied) {
        sendPage(res, false, denied)
        finish({ ok: false, error: denied })
        return
      }
      const code = url.searchParams.get('code')
      if (!code) {
        sendPage(res, false, 'OpenRouter did not return an authorization code.')
        finish({ ok: false, error: 'missing_code' })
        return
      }
      const result = await exchange(code)
      sendPage(
        res,
        result.ok,
        result.ok
          ? 'The API key was created and saved in Chelp AI. You can close this tab and return to the app.'
          : `Could not create the API key: ${result.error ?? 'unknown error'}`
      )
      finish(result)
    })

    server.on('error', (error) => finish({ ok: false, error: error.message }))

    server.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      if (!address || typeof address === 'string') {
        finish({ ok: false, error: 'Could not start the local authorization server.' })
        return
      }
      const callback = `http://127.0.0.1:${address.port}/callback`
      const authUrl = `${AUTH_URL}?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`
      void shell.openExternal(authUrl).catch((error: unknown) => {
        finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    })

    timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), TIMEOUT_MS)
  })
}
