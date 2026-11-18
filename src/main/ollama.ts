import { BrowserWindow, app, net } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {
  LocalRuntimeResult,
  LocalRuntimeStatus,
  OllamaProgress
} from '@shared/types'

const ZIP_URL = 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip'
const HOST = '127.0.0.1:11434'
const BASE = `http://${HOST}`

let child: ChildProcess | null = null
let installing: Promise<LocalRuntimeResult> | null = null

export function ollamaDir(): string {
  return join(app.getPath('userData'), 'ollama')
}

export function ollamaExe(): string {
  return join(ollamaDir(), 'ollama.exe')
}

export function managedOllamaInstalled(): boolean {
  return existsSync(ollamaExe())
}

function broadcast(payload: OllamaProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('ollama:progress', payload)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function serverRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export async function ollamaStatus(): Promise<LocalRuntimeStatus> {
  const managed = managedOllamaInstalled()
  return {
    installed: managed,
    running: await serverRunning(),
    managed,
    path: managed ? ollamaExe() : undefined
  }
}

export async function startOllama(): Promise<LocalRuntimeResult> {
  if (await serverRunning()) {
    return { ok: true, status: await ollamaStatus() }
  }
  if (!managedOllamaInstalled()) {
    return { ok: false, status: await ollamaStatus(), error: 'not_installed' }
  }
  broadcast({ phase: 'start' })
  child = spawn(ollamaExe(), ['serve'], {
    cwd: ollamaDir(),
    env: {
      ...process.env,
      OLLAMA_HOST: HOST,
      OLLAMA_MODELS: join(ollamaDir(), 'models'),
      OLLAMA_KEEP_ALIVE: '2h'
    },
    windowsHide: true,
    stdio: 'ignore'
  })
  child.on('exit', () => {
    child = null
  })
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(500)
    if (await serverRunning()) {
      return { ok: true, status: await ollamaStatus() }
    }
    if (!child) break
  }
  return { ok: false, status: await ollamaStatus(), error: 'start_failed' }
}

async function downloadZip(target: string): Promise<void> {
  const res = await net.fetch(ZIP_URL, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`download_failed_${res.status}`)
  const total = Number(res.headers.get('content-length') ?? 0) || undefined
  let received = 0
  let lastReport = 0
  const part = `${target}.part`
  const progress = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      const now = Date.now()
      if (now - lastReport > 250) {
        lastReport = now
        broadcast({
          phase: 'download',
          received,
          total,
          percent: total ? Math.round((received / total) * 100) : undefined
        })
      }
      callback(null, chunk)
    }
  })
  await pipeline(Readable.fromWeb(res.body as never), progress, createWriteStream(part))
  renameSync(part, target)
}

function run(exe: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `exit_${code}`))
    })
  })
}

async function extractZip(zip: string, destination: string): Promise<void> {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  if (existsSync(tar)) {
    await run(tar, ['-xf', zip, '-C', destination])
    return
  }
  const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`
  await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(destination)} -Force`
  ])
}

export async function installOllama(): Promise<LocalRuntimeResult> {
  if (managedOllamaInstalled()) return startOllama()
  if (installing) return installing
  installing = (async (): Promise<LocalRuntimeResult> => {
    try {
      mkdirSync(ollamaDir(), { recursive: true })
      const zip = join(ollamaDir(), 'ollama-windows-amd64.zip')
      broadcast({ phase: 'download', percent: 0, received: 0 })
      try {
        await downloadZip(zip)
      } catch (error) {
        rmSync(`${zip}.part`, { force: true })
        throw error
      }
      broadcast({ phase: 'extract' })
      await extractZip(zip, ollamaDir())
      rmSync(zip, { force: true })
      const started = await startOllama()
      return started
    } catch (error) {
      return {
        ok: false,
        status: await ollamaStatus(),
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })()
  try {
    return await installing
  } finally {
    installing = null
  }
}

export async function pullOllamaModel(model: string): Promise<{ ok: boolean; error?: string }> {
  const name = model.trim()
  if (!name) return { ok: false, error: 'no_model' }
  if (!(await serverRunning())) {
    const started = await startOllama()
    if (!started.ok) return { ok: false, error: started.error ?? 'not_running' }
  }
  try {
    const res = await fetch(`${BASE}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stream: true })
    })
    if (!res.ok || !res.body) return { ok: false, error: `http_${res.status}` }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastReport = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
        if (!line) continue
        let event: { status?: string; total?: number; completed?: number; error?: string }
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        if (event.error) return { ok: false, error: event.error }
        const now = Date.now()
        if (now - lastReport > 200) {
          lastReport = now
          broadcast({
            phase: 'pull',
            model: name,
            status: event.status,
            percent: event.total
              ? Math.round(((event.completed ?? 0) / event.total) * 100)
              : undefined,
            received: event.completed,
            total: event.total
          })
        }
      }
    }
    broadcast({ phase: 'pull', model: name, status: 'success', percent: 100 })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function stopOllama(): void {
  if (!child) return
  child.kill()
  child = null
}
