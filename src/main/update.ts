import { BrowserWindow, app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateInfo, UpdateProgress, UpdateResult } from '@shared/types'

const REPO = 'slipptech-tech/Chelp-AI-Website'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`

interface ReleaseAsset {
  name: string
  size: number
  browser_download_url: string
  digest?: string | null
}

interface CachedUpdate extends UpdateInfo {
  url?: string
  digest?: string | null
  file?: string
}

let cached: CachedUpdate | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function versionParts(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0)
}

function isNewer(candidate: string, current: string): boolean {
  const next = versionParts(candidate)
  const now = versionParts(current)
  for (let index = 0; index < 3; index += 1) {
    if ((next[index] ?? 0) > (now[index] ?? 0)) return true
    if ((next[index] ?? 0) < (now[index] ?? 0)) return false
  }
  return false
}

function pickInstaller(assets: ReleaseAsset[]): ReleaseAsset | null {
  return (
    assets.find((asset) => /\.exe$/i.test(asset.name) && /setup|installer/i.test(asset.name)) ?? null
  )
}

function publicInfo(info: CachedUpdate): UpdateInfo {
  return {
    current: info.current,
    version: info.version,
    available: info.available,
    name: info.name,
    size: info.size,
    error: info.error
  }
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const current = app.getVersion()
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(9000)
    })
    if (!response.ok) throw new Error(`GitHub ${response.status}`)
    const release = (await response.json()) as { tag_name?: string; assets?: ReleaseAsset[] }
    const tag = (release.tag_name ?? '').replace(/^v/i, '')
    const asset = pickInstaller(release.assets ?? [])
    cached = {
      current,
      version: tag || current,
      available: Boolean(tag && asset && isNewer(tag, current)),
      name: asset?.name,
      size: asset?.size,
      url: asset?.browser_download_url,
      digest: asset?.digest ?? null
    }
    const info = publicInfo(cached)
    if (info.available) broadcast('update:available', info)
    return info
  } catch (error) {
    return {
      current,
      version: current,
      available: false,
      error: error instanceof Error ? error.message : 'network'
    }
  }
}

export async function downloadUpdate(): Promise<UpdateResult> {
  if (!cached?.available || !cached.url) return { ok: false, error: 'no_update' }
  const update = cached
  const url = cached.url
  const dir = path.join(app.getPath('userData'), 'updates')
  const file = path.join(dir, update.name ?? `Chelp-AI-Setup-${update.version}.exe`)

  try {
    fs.mkdirSync(dir, { recursive: true })
    if (fs.existsSync(file) && (!update.size || fs.statSync(file).size === update.size)) {
      update.file = file
      broadcast('update:ready', { version: update.version })
      return { ok: true }
    }
    if (fs.existsSync(file)) fs.rmSync(file, { force: true })

    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(600000)
    })
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

    const total = Number(response.headers.get('content-length')) || update.size || 0
    const hash = createHash('sha256')
    let received = 0
    let lastReport = 0

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk)
        received += chunk.length
        const now = Date.now()
        if (now - lastReport > 150 || received === total) {
          lastReport = now
          const progress: UpdateProgress = {
            version: update.version,
            received,
            total,
            percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0
          }
          broadcast('update:progress', progress)
        }
        callback(null, chunk)
      }
    })

    await pipeline(Readable.fromWeb(response.body as never), meter, fs.createWriteStream(file))

    const size = fs.statSync(file).size
    if (total && size !== total) throw new Error('download_incomplete')
    if (update.digest?.startsWith('sha256:')) {
      const digest = hash.digest('hex')
      if (digest !== update.digest.slice(7)) throw new Error('checksum_mismatch')
    }

    update.file = file
    broadcast('update:ready', { version: update.version })
    return { ok: true }
  } catch (error) {
    try {
      fs.rmSync(file, { force: true })
    } catch {
      /* ignore */
    }
    const message = error instanceof Error ? error.message : 'download_failed'
    broadcast('update:error', { message })
    return { ok: false, error: message }
  }
}

export function installUpdate(): UpdateResult {
  if (!cached?.available) return { ok: false, error: 'no_update' }
  if (!cached.file || !fs.existsSync(cached.file)) return { ok: false, error: 'not_downloaded' }

  const installDir =
    process.env.PORTABLE_EXECUTABLE_DIR?.trim() || path.dirname(process.execPath)

  try {
    const child = spawn(cached.file, ['--updated', '/S', '--force-run', `/D=${installDir}`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'install_failed' }
  }

  setTimeout(() => app.quit(), 800)
  return { ok: true }
}

export function updateFilePath(): string | null {
  return cached?.file ?? null
}
