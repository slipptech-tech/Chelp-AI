import { BrowserWindow, desktopCapturer, ipcMain, nativeImage, screen } from 'electron'
import type { CaptureQuality, CaptureResult, DisplayInfo, WindowInfo } from '@shared/types'
import { loadPage, preloadPath } from './paths'
import { getFloatWindow, getMainWindow } from './windows'

interface OverlayContext {
  image: string
  imageWidth: number
  imageHeight: number
  cssWidth: number
  cssHeight: number
  label: string
}

const overlayContexts = new Map<number, OverlayContext>()

let activeOverlay: {
  win: BrowserWindow
  resolve: (result: CaptureResult | null) => void
  imageData: string
  settled: boolean
} | null = null

function thumbnailSize(quality: CaptureQuality): { width: number; height: number } {
  return quality === 'high' ? { width: 2560, height: 1600 } : { width: 1600, height: 1000 }
}

async function screenSources(quality: CaptureQuality) {
  return desktopCapturer.getSources({ types: ['screen'], thumbnailSize: thumbnailSize(quality) })
}

export async function listScreens(quality: CaptureQuality): Promise<DisplayInfo[]> {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const sources = await screenSources(quality)
  return displays.map((display, index) => {
    const source =
      sources.find((s) => s.display_id === String(display.id)) ??
      sources[index] ??
      null
    return {
      id: display.id,
      label: `Display ${index + 1}`,
      primary: display.id === primary.id,
      width: display.size.width,
      height: display.size.height,
      scaleFactor: display.scaleFactor,
      thumbnail: source?.thumbnail.toDataURL() ?? ''
    }
  })
}

export async function listWindows(): Promise<WindowInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 960, height: 600 },
    fetchWindowIcons: true
  })
  return sources
    .filter((source) => source.name.trim() && source.thumbnail.getSize().width > 0)
    .filter((source) => !source.name.startsWith('Chelp AI'))
    .map((source) => ({
      id: source.id,
      name: source.name,
      appName: source.name.split(' — ')[0],
      icon: source.appIcon ? source.appIcon.toDataURL() : null,
      thumbnail: source.thumbnail.toDataURL()
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function captureDisplay(displayId: number): Promise<CaptureResult | null> {
  const display = screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const sources = await screenSources('high')
  const source =
    sources.find((s) => s.display_id === String(display.id)) ??
    sources[screen.getAllDisplays().findIndex((d) => d.id === display.id)] ??
    sources[0]
  if (!source) return null
  const size = source.thumbnail.getSize()
  return {
    dataUrl: source.thumbnail.toDataURL(),
    width: size.width,
    height: size.height
  }
}

export async function captureWindow(sourceId: string): Promise<CaptureResult | null> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 2560, height: 1600 }
  })
  const source = sources.find((s) => s.id === sourceId)
  if (!source) return null
  const size = source.thumbnail.getSize()
  if (size.width === 0) return null
  return { dataUrl: source.thumbnail.toDataURL(), width: size.width, height: size.height }
}

function settleOverlay(result: CaptureResult | null): void {
  if (!activeOverlay || activeOverlay.settled) return
  activeOverlay.settled = true
  const { win, resolve } = activeOverlay
  activeOverlay = null
  overlayContexts.delete(win.webContents.id)
  if (!win.isDestroyed()) win.close()
  resolve(result)
}

function hideAppWindows(): Array<() => void> {
  const restores: Array<() => void> = []
  for (const win of [getMainWindow(), getFloatWindow()]) {
    if (!win || win.isDestroyed() || !win.isVisible()) continue
    win.hide()
    restores.push(() => {
      if (!win.isDestroyed()) win.showInactive()
    })
  }
  return restores
}

export async function selectRegion(displayId: number): Promise<CaptureResult | null> {
  if (activeOverlay) settleOverlay(null)

  const display = screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const restore = hideAppWindows()
  const restoreOnce = (): void => {
    while (restore.length) restore.pop()?.()
  }
  let shot: CaptureResult | null = null
  try {
    // Let DWM drop the hidden windows before grabbing the desktop frame.
    await new Promise((resolve) => setTimeout(resolve, 180))
    shot = await captureDisplay(display.id)
  } finally {
    if (!shot) restoreOnce()
  }
  if (!shot) return null

  return new Promise<CaptureResult | null>((resolve) => {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: false,
      backgroundColor: '#050507',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setMenuBarVisibility(false)
    const senderId = win.webContents.id
    overlayContexts.set(senderId, {
      image: shot.dataUrl,
      imageWidth: shot.width,
      imageHeight: shot.height,
      cssWidth: display.bounds.width,
      cssHeight: display.bounds.height,
      label: display.label || 'Display'
    })
    activeOverlay = {
      win,
      resolve,
      imageData: shot.dataUrl,
      settled: false
    }
    win.on('closed', () => {
      restoreOnce()
      if (activeOverlay?.win === win) {
        activeOverlay = null
        overlayContexts.delete(senderId)
        resolve(null)
      }
    })
    win.once('ready-to-show', () => {
      win.setBounds(display.bounds)
      win.show()
      win.focus()
      restoreOnce()
    })
    loadPage(win, 'overlay')
  })
}

export function registerCaptureIpc(): void {
  ipcMain.handle('overlay:context', (event) => overlayContexts.get(event.sender.id) ?? null)

  ipcMain.on(
    'overlay:complete',
    (event, rect: { x: number; y: number; width: number; height: number } | null) => {
      const overlay = activeOverlay
      if (!overlay || event.sender.id !== overlay.win.webContents.id) return
      if (!rect || rect.width < 8 || rect.height < 8) {
        settleOverlay(null)
        return
      }
      try {
        const image = nativeImage.createFromDataURL(overlay.imageData)
        const size = image.getSize()
        const bounds = {
          x: Math.max(0, Math.min(Math.round(rect.x), size.width - 1)),
          y: Math.max(0, Math.min(Math.round(rect.y), size.height - 1)),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
        bounds.width = Math.min(bounds.width, size.width - bounds.x)
        bounds.height = Math.min(bounds.height, size.height - bounds.y)
        const cropped = image.crop(bounds)
        const croppedSize = cropped.getSize()
        settleOverlay({
          dataUrl: cropped.toDataURL(),
          width: croppedSize.width,
          height: croppedSize.height
        })
      } catch {
        settleOverlay(null)
      }
    }
  )

  ipcMain.on('overlay:cancel', (event) => {
    if (activeOverlay && event.sender.id === activeOverlay.win.webContents.id) {
      settleOverlay(null)
    }
  })
}
