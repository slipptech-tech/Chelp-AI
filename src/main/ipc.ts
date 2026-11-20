import { BrowserWindow, Notification, app, clipboard, ipcMain, shell } from 'electron'
import type { AgentKind, AppCommand, CaptureQuality, ChatMode, Lang, Provider, SendChatPayload, Settings } from '@shared/types'
import { getStore } from './store'
import { abortRequest, listLocalModels, regenerate, sendChat, testProvider } from './ai'
import { buildAgentPlan, cancelAgent, prepareAgent, runAgent } from './agent'
import { connectOpenRouter } from './openrouter'
import { installOllama, ollamaStatus, pullOllamaModel, startOllama } from './ollama'
import { captureWindow, listScreens, listWindows, selectRegion } from './capture'
import { checkForUpdates, downloadUpdate, installUpdate } from './update'
import {
  focusMain,
  getFloatWindow,
  getMainWindow,
  hideFloatWindow,
  setFloatCollapsed,
  toggleFloatWindow
} from './windows'

function parentOf(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerIpc(): void {
  ipcMain.handle('settings:get', () => getStore().settings)

  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => {
    return getStore().updateSettings(patch)
  })

  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.minimize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win === getFloatWindow()) win.hide()
    else win.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('storage:info', () => {
    const stats = getStore().photosStats()
    return {
      dataPath: app.getPath('userData'),
      photosPath: stats.path,
      photos: stats.files,
      photoBytes: stats.bytes
    }
  })

  ipcMain.on('storage:open-data', () => {
    void shell.openPath(app.getPath('userData'))
  })

  ipcMain.on('storage:open-photos', () => {
    void shell.openPath(getStore().attachmentsPath)
  })

  ipcMain.handle('storage:clear-photos', () => {
    const freed = getStore().clearPhotos()
    const stats = getStore().photosStats()
    return {
      freed,
      info: {
        dataPath: app.getPath('userData'),
        photosPath: stats.path,
        photos: stats.files,
        photoBytes: stats.bytes
      }
    }
  })

  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())

  ipcMain.on('app:open-external', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.on('app:open-path', (_event, target: string) => {
    if (target) void shell.openPath(target)
  })

  ipcMain.on('app:copy', (_event, text: string) => {
    clipboard.writeText(text ?? '')
  })

  ipcMain.on('app:notify', (_event, payload: { title: string; body: string }) => {
    if (!Notification.isSupported()) return
    new Notification({ title: payload.title, body: payload.body }).show()
  })

  ipcMain.handle('providers:test', (_event, provider: Provider) => testProvider(provider))
  ipcMain.handle('providers:openrouter-auth', () => connectOpenRouter())
  ipcMain.handle('providers:local-models', (_event, baseUrl: string) => listLocalModels(baseUrl))
  ipcMain.handle('providers:ollama-status', () => ollamaStatus())
  ipcMain.handle('providers:ollama-install', () => installOllama())
  ipcMain.handle('providers:ollama-start', () => startOllama())
  ipcMain.handle('providers:ollama-pull', (_event, model: string) => pullOllamaModel(model))

  ipcMain.handle('conversations:list', () => getStore().listConversations())
  ipcMain.handle('conversations:get', (_event, id: string) => getStore().getConversation(id))
  ipcMain.handle('conversations:create', (_event, input?: { mode?: ChatMode; title?: string }) => {
    return getStore().createConversation(input?.mode ?? 'chat', input?.title ?? '')
  })
  ipcMain.handle('conversations:rename', (_event, id: string, title: string) => {
    getStore().renameConversation(id, title)
  })
  ipcMain.handle('conversations:remove', (_event, id: string) => {
    abortRequest(id)
    getStore().removeConversation(id)
  })
  ipcMain.handle('conversations:clear', () => {
    getStore().clearConversations()
  })
  ipcMain.handle('conversations:delete-message', (_event, conversationId: string, messageId: string) => {
    return getStore().removeMessage(conversationId, messageId)
  })
  ipcMain.handle('conversations:export', (event, id: string) => {
    return getStore().exportConversation(id, parentOf(event))
  })

  ipcMain.handle('saved:list', () => getStore().saved)
  ipcMain.handle(
    'saved:add',
    (_event, input: { conversationId: string; messageId: string; question: string; answer: string }) => {
      return getStore().addSaved(input)
    }
  )
  ipcMain.handle('saved:remove', (_event, id: string) => {
    getStore().removeSaved(id)
  })

  ipcMain.handle('memory:list', () => getStore().listMemory())
  ipcMain.handle('memory:remove', (_event, id: string) => {
    getStore().removeMemory(id)
  })
  ipcMain.handle('memory:clear', () => {
    getStore().clearMemory()
  })

  ipcMain.handle('chat:send', (_event, payload: SendChatPayload) => sendChat(payload))
  ipcMain.handle('chat:abort', (_event, conversationId: string) => {
    abortRequest(conversationId)
  })
  ipcMain.handle('chat:regenerate', (_event, conversationId: string, surface?: 'main' | 'float') => {
    return regenerate(conversationId, surface ?? 'main')
  })

  ipcMain.handle('capture:screens', (_event, quality: CaptureQuality) => listScreens(quality))
  ipcMain.handle('capture:windows', () => listWindows())
  ipcMain.handle('capture:region', (_event, displayId: number) => selectRegion(displayId))
  ipcMain.handle('capture:window', (_event, sourceId: string) => captureWindow(sourceId))
  ipcMain.handle('capture:save-image', (_event, dataUrl: string, name?: string) => {
    return getStore().saveAttachment(dataUrl, name)
  })
  ipcMain.handle('capture:pick-images', (event) => getStore().pickImages(parentOf(event)))

  ipcMain.handle(
    'agent:prepare',
    (
      _event,
      input: { conversationId: string; messageId: string; goal: string; kind: AgentKind; url?: string }
    ) => prepareAgent(input)
  )
  ipcMain.handle('agent:plan', (_event, id: string, lang: Lang) => buildAgentPlan(id, lang))
  ipcMain.handle('agent:run', (_event, id: string, lang: Lang) => runAgent(id, lang))
  ipcMain.handle('agent:cancel', () => cancelAgent())

  ipcMain.handle('float:toggle', () => toggleFloatWindow())
  ipcMain.handle('float:hide', () => hideFloatWindow())
  ipcMain.handle('float:set-collapsed', (_event, collapsed: boolean) => setFloatCollapsed(collapsed))

  ipcMain.on('app:focus', (_event, command?: AppCommand) => focusMain(command))

  ipcMain.on('app:open-conversation', (_event, id: string) => {
    focusMain()
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    const send = (): void => {
      if (!win.isDestroyed()) win.webContents.send('app:open-conversation', id)
    }
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  })
}
