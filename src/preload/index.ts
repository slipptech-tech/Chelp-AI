import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentKind,
  AppCommand,
  Attachment,
  CaptureQuality,
  ChelpAPI,
  ChatMode,
  Conversation,
  ConversationMeta,
  ExportResult,
  Lang,
  LocalModelsResult,
  LocalRuntimeResult,
  LocalRuntimeStatus,
  OllamaProgress,
  Provider,
  ProviderAuthResult,
  SavedAnswer,
  SendChatPayload,
  Settings,
  StorageInfo,
  TestResult,
  UpdateInfo,
  UpdateProgress,
  UpdateResult
} from '@shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    app: process.env.npm_package_version ?? ''
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch),
    onChanged: (cb: (settings: Settings) => void) => subscribe('settings:changed', cb)
  },
  window: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => subscribe('window:maximized', cb)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    openExternal: (url: string): void => ipcRenderer.send('app:open-external', url),
    openPath: (target: string): void => ipcRenderer.send('app:open-path', target),
    focus: (command: AppCommand): void => ipcRenderer.send('app:focus', command),
    openConversation: (id: string): void => ipcRenderer.send('app:open-conversation', id)
  },
  clipboard: {
    write: (text: string): void => ipcRenderer.send('app:copy', text)
  },
  storage: {
    info: (): Promise<StorageInfo> => ipcRenderer.invoke('storage:info'),
    openDataFolder: (): void => ipcRenderer.send('storage:open-data'),
    openPhotos: (): void => ipcRenderer.send('storage:open-photos'),
    clearPhotos: (): Promise<{ freed: number; info: StorageInfo }> =>
      ipcRenderer.invoke('storage:clear-photos')
  },
  update: {
    check: (): Promise<UpdateInfo> => ipcRenderer.invoke('update:check'),
    download: (): Promise<UpdateResult> => ipcRenderer.invoke('update:download'),
    install: (): Promise<UpdateResult> => ipcRenderer.invoke('update:install'),
    onAvailable: (cb: (info: UpdateInfo) => void) => subscribe('update:available', cb),
    onProgress: (cb: (progress: UpdateProgress) => void) => subscribe('update:progress', cb),
    onReady: (cb: (info: { version: string }) => void) => subscribe('update:ready', cb),
    onError: (cb: (info: { message: string }) => void) => subscribe('update:error', cb)
  },
  providers: {
    test: (provider: Provider): Promise<TestResult> => ipcRenderer.invoke('providers:test', provider),
    openrouterAuth: (): Promise<ProviderAuthResult> => ipcRenderer.invoke('providers:openrouter-auth'),
    localModels: (baseUrl: string): Promise<LocalModelsResult> =>
      ipcRenderer.invoke('providers:local-models', baseUrl),
    ollamaStatus: (): Promise<LocalRuntimeStatus> => ipcRenderer.invoke('providers:ollama-status'),
    ollamaInstall: (): Promise<LocalRuntimeResult> => ipcRenderer.invoke('providers:ollama-install'),
    ollamaStart: (): Promise<LocalRuntimeResult> => ipcRenderer.invoke('providers:ollama-start'),
    ollamaPull: (model: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('providers:ollama-pull', model),
    onOllamaProgress: (cb: (progress: OllamaProgress) => void) =>
      subscribe('ollama:progress', cb)
  },
  conversations: {
    list: (): Promise<ConversationMeta[]> => ipcRenderer.invoke('conversations:list'),
    get: (id: string): Promise<Conversation | null> => ipcRenderer.invoke('conversations:get', id),
    create: (input?: { mode?: ChatMode; title?: string }): Promise<Conversation> =>
      ipcRenderer.invoke('conversations:create', input),
    rename: (id: string, title: string): Promise<void> => ipcRenderer.invoke('conversations:rename', id, title),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('conversations:remove', id),
    clearAll: (): Promise<void> => ipcRenderer.invoke('conversations:clear'),
    deleteMessage: (conversationId: string, messageId: string): Promise<Conversation | null> =>
      ipcRenderer.invoke('conversations:delete-message', conversationId, messageId),
    export: (id: string): Promise<ExportResult> => ipcRenderer.invoke('conversations:export', id),
    onChanged: (cb: (list: ConversationMeta[]) => void) => subscribe('conversations:changed', cb)
  },
  saved: {
    list: (): Promise<SavedAnswer[]> => ipcRenderer.invoke('saved:list'),
    add: (input: { conversationId: string; messageId: string; question: string; answer: string }): Promise<SavedAnswer> =>
      ipcRenderer.invoke('saved:add', input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('saved:remove', id),
    onChanged: (cb: (list: SavedAnswer[]) => void) => subscribe('saved:changed', cb)
  },
  chat: {
    send: (payload: SendChatPayload) => ipcRenderer.invoke('chat:send', payload),
    abort: (conversationId: string): Promise<void> => ipcRenderer.invoke('chat:abort', conversationId),
    regenerate: (conversationId: string, surface?: 'main' | 'float') =>
      ipcRenderer.invoke('chat:regenerate', conversationId, surface),
    onStart: (cb: Parameters<ChelpAPI['chat']['onStart']>[0]) => subscribe('chat:start', cb),
    onDelta: (cb: Parameters<ChelpAPI['chat']['onDelta']>[0]) => subscribe('chat:delta', cb),
    onDone: (cb: Parameters<ChelpAPI['chat']['onDone']>[0]) => subscribe('chat:done', cb),
    onError: (cb: Parameters<ChelpAPI['chat']['onError']>[0]) => subscribe('chat:error', cb),
    onUserMessage: (cb: Parameters<ChelpAPI['chat']['onUserMessage']>[0]) =>
      subscribe('chat:user-message', cb)
  },
  capture: {
    screens: (quality: CaptureQuality) => ipcRenderer.invoke('capture:screens', quality),
    windows: () => ipcRenderer.invoke('capture:windows'),
    selectRegion: (displayId: number) => ipcRenderer.invoke('capture:region', displayId),
    captureWindow: (sourceId: string) => ipcRenderer.invoke('capture:window', sourceId),
    saveImage: (dataUrl: string, name?: string): Promise<Attachment> =>
      ipcRenderer.invoke('capture:save-image', dataUrl, name),
    pickImages: (): Promise<Attachment[]> => ipcRenderer.invoke('capture:pick-images')
  },
  agent: {
    prepare: (input: {
      conversationId: string
      messageId: string
      goal: string
      kind: AgentKind
      url?: string
    }) => ipcRenderer.invoke('agent:prepare', input),
    plan: (id: string, lang: Lang) => ipcRenderer.invoke('agent:plan', id, lang),
    run: (id: string, lang: Lang) => ipcRenderer.invoke('agent:run', id, lang),
    cancel: (): Promise<void> => ipcRenderer.invoke('agent:cancel'),
    onStep: (cb: Parameters<ChelpAPI['agent']['onStep']>[0]) => subscribe('agent:step', cb),
    onRun: (cb: Parameters<ChelpAPI['agent']['onRun']>[0]) => subscribe('agent:run', cb)
  },
  notify: (payload: { title: string; body: string }): void => ipcRenderer.send('app:notify', payload),
  hotkeys: {
    onError: (cb: (accelerator: string) => void) => subscribe('app:hotkey-error', cb)
  },
  commands: {
    on: (cb: (command: AppCommand) => void) => subscribe('app:command', cb),
    onOpenConversation: (cb: (id: string) => void) => subscribe('app:open-conversation', cb)
  },
  float: {
    toggle: (): Promise<boolean> => ipcRenderer.invoke('float:toggle'),
    hide: (): Promise<void> => ipcRenderer.invoke('float:hide'),
    setCollapsed: (collapsed: boolean): Promise<void> => ipcRenderer.invoke('float:set-collapsed', collapsed),
    onVisibility: (cb: (visible: boolean) => void) => subscribe('float:visibility', cb),
    onCollapsed: (cb: (collapsed: boolean) => void) => subscribe('float:collapsed', cb)
  }
} as ChelpAPI

contextBridge.exposeInMainWorld('chelp', api)
contextBridge.exposeInMainWorld('chelpOverlay', {
  context: () => ipcRenderer.invoke('overlay:context'),
  complete: (rect: { x: number; y: number; width: number; height: number } | null) =>
    ipcRenderer.send('overlay:complete', rect),
  cancel: () => ipcRenderer.send('overlay:cancel')
})
