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
