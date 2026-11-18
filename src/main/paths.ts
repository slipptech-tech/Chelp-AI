import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type RendererPage = 'index' | 'float' | 'overlay'

export function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

export function rendererUrl(page: RendererPage): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return `${devUrl}/${page}.html`
  return path.join(__dirname, `../renderer/${page}.html`)
}

export function loadPage(win: Electron.BrowserWindow, page: RendererPage): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(rendererUrl(page))
  } else {
    void win.loadFile(rendererUrl(page))
  }
}

export function resourcePath(file: string): string {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, file)
    if (fs.existsSync(unpacked)) return unpacked
  }
  return path.join(app.getAppPath(), 'resources', file)
}

const DATA_FOLDER = 'Chelp AI Data'
const CORE_FILES = ['settings.json', 'conversations.json', 'saved.json']

function isWritable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, '.write-probe')
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/** Data lives next to the program so the whole folder can be moved as one. */
export function appDataDir(): string {
  if (!app.isPackaged) return path.join(app.getAppPath(), DATA_FOLDER)
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
  const base = portableDir ? portableDir : path.dirname(process.execPath)
  return path.join(base, DATA_FOLDER)
}

function copyIfExists(from: string, to: string): void {
  if (!fs.existsSync(from) || fs.existsSync(to)) return
  try {
    fs.copyFileSync(from, to)
  } catch (error) {
    console.error(`Failed to migrate ${from}`, error)
  }
}

function copyDirIfExists(from: string, to: string): void {
  if (!fs.existsSync(from) || fs.existsSync(to)) return
  try {
    fs.cpSync(from, to, { recursive: true })
  } catch (error) {
    console.error(`Failed to migrate ${from}`, error)
  }
}

function moveDirIfExists(from: string, to: string): void {
  if (!fs.existsSync(from) || fs.existsSync(to)) return
  try {
    fs.renameSync(from, to)
  } catch {
    // Different volume or locked runtime: leave the old copy in place.
  }
}

function rewriteAttachmentPaths(target: string, legacy: string): void {
  const file = path.join(target, 'conversations.json')
  if (!fs.existsSync(file)) return
  try {
    const conversations = JSON.parse(fs.readFileSync(file, 'utf-8')) as Array<{
      messages?: Array<{ attachments?: Array<{ path: string }> }>
    }>
    const legacyAttachments = path.join(legacy, 'attachments')
    const nextAttachments = path.join(target, 'attachments')
    const remap = (value: string): string => {
      if (!value) return value
      const resolved = path.resolve(value)
      if (resolved.startsWith(legacyAttachments + path.sep)) {
        return path.join(nextAttachments, path.basename(resolved))
      }
      return value
    }
    for (const conversation of Array.isArray(conversations) ? conversations : []) {
      for (const message of conversation.messages ?? []) {
        for (const attachment of message.attachments ?? []) {
          attachment.path = remap(attachment.path)
        }
      }
    }
    fs.writeFileSync(file, JSON.stringify(conversations, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to rewrite attachment paths', error)
  }
}

function migrateLegacyData(target: string): void {
  const legacy = path.join(app.getPath('appData'), 'Chelp AI')
  if (path.resolve(legacy) === path.resolve(target) || !fs.existsSync(legacy)) return
  const alreadyMoved =
    CORE_FILES.some((file) => fs.existsSync(path.join(target, file))) ||
    fs.existsSync(path.join(target, 'attachments')) ||
    fs.existsSync(path.join(target, 'photos-cache'))
  if (alreadyMoved) return

  for (const file of CORE_FILES) {
    copyIfExists(path.join(legacy, file), path.join(target, file))
  }
  copyDirIfExists(path.join(legacy, 'attachments'), path.join(target, 'attachments'))
  moveDirIfExists(path.join(legacy, 'ollama'), path.join(target, 'ollama'))
  rewriteAttachmentPaths(target, legacy)
}

export function prepareDataDir(): string {
  let dir = appDataDir()
  if (!isWritable(dir)) {
    const fallback = path.join(app.getPath('appData'), DATA_FOLDER)
    console.error(`Data folder is not writable: ${dir}; using ${fallback}`)
    isWritable(fallback)
    dir = fallback
  }
  migrateLegacyData(dir)
  return dir
}
