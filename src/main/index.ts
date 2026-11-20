import { BrowserWindow, Menu, app, net, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Settings } from '@shared/types'
import { getStore } from './store'
import { createFloatWindow, createMainWindow, focusMain, setQuitting } from './windows'
import { buildTrayMenu, createTray } from './tray'
import { registerShortcuts, unregisterShortcuts } from './shortcuts'
import { registerIpc } from './ipc'
import { registerCaptureIpc } from './capture'
import { managedOllamaInstalled, startOllama, stopOllama } from './ollama'
import { warmLocalModel } from './ai'
import { prepareDataDir } from './paths'

app.setPath('userData', prepareDataDir())

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'chelp',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => focusMain())

  app.whenReady().then(() => {
    app.setAppUserModelId('dev.slipptech.chelp')
    Menu.setApplicationMenu(null)

    const store = getStore()

    protocol.handle('chelp', async (request) => {
      try {
        const url = new URL(request.url)
        if (url.hostname !== 'attachments') return new Response('Not found', { status: 404 })
        const name = path.basename(decodeURIComponent(url.pathname))
        const file = path.join(store.attachmentsPath, name)
        if (!fs.existsSync(file)) return new Response('Not found', { status: 404 })
        return await net.fetch(pathToFileURL(file).toString())
      } catch {
        return new Response('Error', { status: 500 })
      }
    })

    registerIpc()
    registerCaptureIpc()

    createMainWindow()
    createFloatWindow()
    createTray()
    registerShortcuts()

    const pruneScreenshots = (): void => {
      try {
        store.prunePhotos()
      } catch {
        /* cleanup is best effort */
      }
    }
    pruneScreenshots()
    setInterval(pruneScreenshots, 6 * 60 * 60 * 1000)

    const applyLogin = (enabled: boolean): void => {
      if (!app.isPackaged) return
      try {
        app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--startup'] })
      } catch {
        /* ignore */
      }
    }
    applyLogin(store.settings.startAtLogin)

    let uiSignature = JSON.stringify({
      hotkeys: store.settings.hotkeys,
      enabled: store.settings.hotkeysEnabled,
      language: store.settings.language
    })
    let loginState = store.settings.startAtLogin

    const warmActiveLocal = (settings: Settings): void => {
      const active = settings.providers.find((provider) => provider.id === settings.activeProviderId)
      if (active?.kind !== 'local' || !active.baseUrl.trim() || !active.model.trim()) return
      void warmLocalModel(active)
    }

    if (managedOllamaInstalled()) {
      void startOllama().then(() => warmActiveLocal(store.settings))
    }

    let warmSignature = (() => {
      const active = store.settings.providers.find(
        (provider) => provider.id === store.settings.activeProviderId
      )
      return active?.kind === 'local' ? `${active.id}:${active.model}` : ''
    })()

    store.events.on('settings', (settings: Settings) => {
      const signature = JSON.stringify({
        hotkeys: settings.hotkeys,
        enabled: settings.hotkeysEnabled,
        language: settings.language
      })
      if (signature !== uiSignature) {
        uiSignature = signature
        buildTrayMenu()
        registerShortcuts()
      }
      const active = settings.providers.find((provider) => provider.id === settings.activeProviderId)
      const nextWarm = active?.kind === 'local' ? `${active.id}:${active.model}` : ''
      if (nextWarm && nextWarm !== warmSignature) {
        warmSignature = nextWarm
        if (managedOllamaInstalled()) {
          void startOllama().then(() => warmActiveLocal(settings))
        } else {
          warmActiveLocal(settings)
        }
      } else if (!nextWarm) {
        warmSignature = ''
      }
      if (settings.startAtLogin !== loginState) {
        loginState = settings.startAtLogin
        applyLogin(settings.startAtLogin)
      }
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('settings:changed', settings)
      }
    })

    store.events.on('conversations', (list) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('conversations:changed', list)
      }
    })

    store.events.on('saved', (list) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('saved:changed', list)
      }
    })

    store.events.on('memory', (list) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('memory:changed', list)
      }
    })

    app.on('window-all-closed', () => {
      /* Chelp AI keeps running in the tray */
    })

    app.on('activate', () => focusMain())
  })

  app.on('before-quit', () => {
    setQuitting(true)
    unregisterShortcuts()
    stopOllama()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}
