import { BrowserWindow, screen, shell } from 'electron'
import type { AppCommand, WindowBounds } from '@shared/types'
import { getStore } from './store'
import { loadPage, preloadPath, resourcePath } from './paths'

let mainWindow: BrowserWindow | null = null
let floatWindow: BrowserWindow | null = null
let mainBoundsTimer: NodeJS.Timeout | null = null
let floatBoundsTimer: NodeJS.Timeout | null = null
let quitting = false
const FLOAT_SIZE = { width: 392, height: 600 }
const ORB_SIZE = { width: 84, height: 84 }

function isVisibleOnDisplays(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x + 80 > area.x &&
      bounds.x < area.x + area.width - 40 &&
      bounds.y + 40 > area.y &&
      bounds.y < area.y + area.height - 40
    )
  })
}

function saveMainBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return
  if (mainBoundsTimer) clearTimeout(mainBoundsTimer)
  mainBoundsTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    getStore().updateSettings({ mainBounds: mainWindow.getBounds() })
  }, 400)
}

function saveFloatBounds(): void {
  if (!floatWindow || floatWindow.isDestroyed() || getStore().settings.floatCollapsed) return
  if (floatBoundsTimer) clearTimeout(floatBoundsTimer)
  floatBoundsTimer = setTimeout(() => {
    if (!floatWindow || floatWindow.isDestroyed()) return
    getStore().updateSettings({ floatBounds: floatWindow.getBounds() })
  }, 400)
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getFloatWindow(): BrowserWindow | null {
  return floatWindow
}

export function setQuitting(value: boolean): void {
  quitting = value
}

export function createMainWindow(): BrowserWindow {
  const store = getStore()
  const stored = store.settings.mainBounds
  const bounds = stored && isVisibleOnDisplays(stored) ? stored : null
  const win = new BrowserWindow({
    width: bounds?.width ?? 1240,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: false,
    title: 'Chelp AI',
    backgroundColor: '#08080b',
    icon: resourcePath('icon.png'),
    roundedCorners: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      backgroundThrottling: false
    }
  })
  win.setMenuBarVisibility(false)
  loadPage(win, 'index')
  const startHidden = store.settings.startMinimized && process.argv.includes('--startup')
  win.once('ready-to-show', () => {
    if (!startHidden) win.show()
  })
  win.on('maximize', () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))
  win.on('resize', saveMainBounds)
  win.on('move', saveMainBounds)
  win.on('close', (event) => {
    if (quitting || !store.settings.closeToTray) return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => {
    mainWindow = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (!url.startsWith(current.split('#')[0])) event.preventDefault()
  })
  mainWindow = win
  return win
}

export function createFloatWindow(): BrowserWindow {
  const store = getStore()
  const stored = store.settings.floatBounds
  const primary = screen.getPrimaryDisplay().workArea
  const collapsed = store.settings.floatCollapsed
  const size = collapsed ? ORB_SIZE : FLOAT_SIZE
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: stored && isVisibleOnDisplays(stored) ? stored.x : primary.x + primary.width - size.width - 28,
    y: stored && isVisibleOnDisplays(stored) ? stored.y : primary.y + primary.height - size.height - 28,
    minWidth: 320,
    minHeight: 380,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: !collapsed,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    title: 'Chelp AI',
    icon: resourcePath('icon.png'),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setMenuBarVisibility(false)
  loadPage(win, 'float')
  win.on('resize', saveFloatBounds)
  win.on('move', saveFloatBounds)
  win.on('show', () => win.webContents.send('float:visibility', true))
  win.on('hide', () => win.webContents.send('float:visibility', false))
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })
  win.on('closed', () => {
    floatWindow = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  floatWindow = win
  return win
}

export function focusMain(command?: AppCommand): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (command) {
    const send = (): void => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:command', command)
    }
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', send)
    } else {
      send()
    }
  }
}

export function toggleFloatWindow(): boolean {
  if (!floatWindow || floatWindow.isDestroyed()) createFloatWindow()
  if (!floatWindow) return false
  if (floatWindow.isVisible()) {
    floatWindow.hide()
    return false
  }
  floatWindow.show()
  floatWindow.focus()
  return true
}

export function hideFloatWindow(): void {
  floatWindow?.hide()
}

export function setFloatCollapsed(collapsed: boolean): void {
  const store = getStore()
  if (!floatWindow || floatWindow.isDestroyed()) {
    store.updateSettings({ floatCollapsed: collapsed })
    return
  }
  const expanded = FLOAT_SIZE
  if (collapsed) {
    if (!floatWindow.isDestroyed()) {
      const [x, y] = floatWindow.getPosition()
      store.updateSettings({ floatCollapsed: true })
      floatWindow.setResizable(false)
      const [width, height] = floatWindow.getSize()
      const targetX = Math.round(x + width - ORB_SIZE.width)
      const targetY = Math.round(y)
      floatWindow.setBounds({ x: targetX, y: targetY, width: ORB_SIZE.width, height: ORB_SIZE.height })
      if (mainWindow) mainWindow.webContents.send('float:collapsed', true)
      floatWindow.webContents.send('float:collapsed', true)
    }
  } else {
    if (!floatWindow.isDestroyed()) {
      const [x, y] = floatWindow.getPosition()
      store.updateSettings({ floatCollapsed: false })
      floatWindow.setBounds({ x: x - (expanded.width - ORB_SIZE.width), y, width: expanded.width, height: expanded.height })
      floatWindow.setResizable(true)
      if (mainWindow) mainWindow.webContents.send('float:collapsed', false)
      floatWindow.webContents.send('float:collapsed', false)
      store.updateSettings({ floatBounds: floatWindow.getBounds() })
    }
  }
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
