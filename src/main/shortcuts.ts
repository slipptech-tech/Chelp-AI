import { BrowserWindow, globalShortcut } from 'electron'
import { getStore } from './store'
import { focusMain, toggleFloatWindow } from './windows'

export function registerShortcuts(): void {
  globalShortcut.unregisterAll()
  const settings = getStore().settings
  if (!settings.hotkeysEnabled) return

  const failed: string[] = []
  const add = (accelerator: string, handler: () => void): void => {
    if (!accelerator) return
    try {
      if (!globalShortcut.register(accelerator, handler)) failed.push(accelerator)
    } catch {
      failed.push(accelerator)
    }
  }
  add(settings.hotkeys.float, () => toggleFloatWindow())
  add(settings.hotkeys.capture, () => focusMain('analyze-screen'))

  for (const accelerator of failed) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('app:hotkey-error', accelerator)
    }
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
