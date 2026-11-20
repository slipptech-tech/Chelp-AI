export type Lang = 'en' | 'ru'
export type Accent = 'violet' | 'blue' | 'emerald' | 'amber' | 'rose'
export type ProviderKind = 'deepseek' | 'openai' | 'openrouter' | 'gemini' | 'local' | 'custom'
export type CaptureQuality = 'standard' | 'high'
export type ChatMode = 'chat' | 'screen'

export interface Provider {
  id: string
  kind: ProviderKind
  name: string
  baseUrl: string
  apiKey: string
  model: string
  vision: boolean
  temperature: number
  maxTokens: number
}

export interface Hotkeys {
  float: string
  capture: string
}

export type MemoryKind = 'screen' | 'task' | 'note'

export interface MemoryEntry {
  id: string
  kind: MemoryKind
  text: string
  createdAt: number
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export type AgentPermission = 'ask' | 'always'

export interface Settings {
  language: Lang
  accent: Accent
  startAtLogin: boolean
  startMinimized: boolean
  closeToTray: boolean
  notifyOnDone: boolean
  streaming: boolean
  autoSwitchProvider: boolean
  saveHistory: boolean
  confirmBeforeSend: boolean
  captureQuality: CaptureQuality
  enterToSend: boolean
  reduceMotion: boolean
  checkUpdates: boolean
  photoRetentionDays: number
  agentPermission: AgentPermission
  agentAllowedChats: string[]
  aiMemory: boolean
  hotkeysEnabled: boolean
  hotkeys: Hotkeys
  providers: Provider[]
  activeProviderId: string
  floatCollapsed: boolean
  mainBounds: WindowBounds | null
  floatBounds: WindowBounds | null
}

export interface StorageInfo {
  dataPath: string
  photosPath: string
  photos: number
  photoBytes: number
}

export interface UpdateInfo {
  current: string
  version: string
  available: boolean
  name?: string
  size?: number
  error?: string
}

export interface UpdateProgress {
  version: string
  received: number
  total: number
  percent: number
}

export interface UpdateResult {
  ok: boolean
  error?: string
}

export interface Attachment {
  id: string
  path: string
  url: string
  name: string
  width: number
  height: number
}

export type MessageRole = 'user' | 'assistant'

export type GuardReason = 'injection' | 'harmful'

export type AgentKind = 'fix' | 'browse' | 'settings' | 'code' | 'app' | 'action'
export type AgentCapability = 'mouse' | 'keyboard' | 'browser' | 'files'

export interface AgentOffer {
  kind: AgentKind
  goal: string
  url?: string
  capabilities: AgentCapability[]
}

export type AgentActionKind =
  | 'move'
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'type'
  | 'press'
  | 'scroll'
  | 'wait'
  | 'open_url'
  | 'open_app'
  | 'edit_file'
  | 'finish'

export interface AgentAction {
  kind: AgentActionKind
  x?: number
  y?: number
  text?: string
  keys?: string
  amount?: number
  url?: string
  app?: string
  path?: string
  find?: string
  replace?: string
  note?: string
}

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface AgentStep {
  index: number
  action: AgentAction
  status: AgentStepStatus
  detail?: string
}

export interface AgentPlan {
  id: string
  goal: string
  kind: AgentKind
  risk: 'low' | 'medium'
  steps: AgentStep[]
  providerLabel: string
}

export interface AgentPrepared {
  id: string
  preview: string | null
  width: number
  height: number
  providerLabel: string
  needsScreenshot: boolean
}

export interface AgentRunEvent {
  id: string
  status: 'running' | 'done' | 'cancelled' | 'error'
  step: number
  total: number
  message?: string
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  attachments?: Attachment[]
  createdAt: number
  providerLabel?: string
  fallbackFrom?: string
  durationMs?: number
  error?: ChatError | null
  guard?: GuardReason
  agentOffer?: AgentOffer
}

export interface ChatError {
  code: string
  detail?: string
  status?: number
  providerLabel?: string
}

export interface ConversationMeta {
  id: string
  title: string
  mode: ChatMode
  createdAt: number
  updatedAt: number
  messageCount: number
  preview: string
}

export interface Conversation extends ConversationMeta {
  messages: ChatMessage[]
}

export interface SavedAnswer {
  id: string
  conversationId: string
  messageId: string
  question: string
  answer: string
  createdAt: number
}

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
  width: number
  height: number
  scaleFactor: number
  thumbnail: string
}

export interface WindowInfo {
  id: string
  name: string
  appName: string
  icon: string | null
  thumbnail: string
}

export interface CaptureResult {
  dataUrl: string
  width: number
  height: number
}

export interface TestResult {
  ok: boolean
  latencyMs?: number
  error?: string
  errorCode?: string
  balance?: string
}

export interface ProviderAuthResult {
  ok: boolean
  key?: string
  error?: string
}

export interface LocalModelOption {
  id: string
  vision: boolean
  installed?: boolean
}

export interface LocalModelsResult {
  ok: boolean
  models: LocalModelOption[]
  error?: string
  installed?: boolean
}

export interface LocalRuntimeStatus {
  installed: boolean
  running: boolean
  managed: boolean
  path?: string
}

export interface LocalRuntimeResult {
  ok: boolean
  status: LocalRuntimeStatus
  error?: string
}

export interface OllamaProgress {
  phase: 'download' | 'extract' | 'start' | 'pull'
  percent?: number
  received?: number
  total?: number
  status?: string
  model?: string
}

export interface SendChatPayload {
  conversationId: string
  text: string
  attachments?: Attachment[]
  mode: ChatMode
  surface?: 'main' | 'float'
}

export interface ChatStartEvent {
  conversationId: string
  messageId: string
  providerLabel: string
  mode: ChatMode
}

export interface ChatDeltaEvent {
  conversationId: string
  messageId: string
  delta: string
}

export interface ChatDoneEvent {
  conversationId: string
  messageId: string
  conversation: Conversation
}

export interface ChatErrorEvent {
  conversationId: string
  messageId: string
  error: ChatError
}

export type AppCommand =
  | 'new-chat'
  | 'analyze-screen'
  | 'open-settings'
  | 'open-ai'
  | 'open-history'
  | 'open-assistant'
  | 'open-dashboard'

export interface ExportResult {
  ok: boolean
  path?: string
}

export type FloatCommand = 'send' | 'capture' | 'expand' | 'collapse' | 'toggle'

export interface ChelpAPI {
  platform: string
  versions: { electron: string; app: string }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
    onChanged(cb: (settings: Settings) => void): () => void
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizeChange(cb: (maximized: boolean) => void): () => void
  }
  app: {
    getVersion(): Promise<string>
    openExternal(url: string): void
    openPath(path: string): void
    focus(command: AppCommand): void
    openConversation(id: string): void
  }
  storage: {
    info(): Promise<StorageInfo>
    openDataFolder(): void
    openPhotos(): void
    clearPhotos(): Promise<{ freed: number; info: StorageInfo }>
  }
  update: {
    check(): Promise<UpdateInfo>
    download(): Promise<UpdateResult>
    install(): Promise<UpdateResult>
    onAvailable(cb: (info: UpdateInfo) => void): () => void
    onProgress(cb: (progress: UpdateProgress) => void): () => void
    onReady(cb: (info: { version: string }) => void): () => void
    onError(cb: (info: { message: string }) => void): () => void
  }
  clipboard: {
    write(text: string): void
  }
  providers: {
    test(provider: Provider): Promise<TestResult>
    openrouterAuth(): Promise<ProviderAuthResult>
    localModels(baseUrl: string): Promise<LocalModelsResult>
    ollamaStatus(): Promise<LocalRuntimeStatus>
    ollamaInstall(): Promise<LocalRuntimeResult>
    ollamaStart(): Promise<LocalRuntimeResult>
    ollamaPull(model: string): Promise<{ ok: boolean; error?: string }>
    onOllamaProgress(cb: (progress: OllamaProgress) => void): () => void
  }
  conversations: {
    list(): Promise<ConversationMeta[]>
    get(id: string): Promise<Conversation | null>
    create(input?: { mode?: ChatMode; title?: string }): Promise<Conversation>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    clearAll(): Promise<void>
    deleteMessage(conversationId: string, messageId: string): Promise<Conversation | null>
    export(id: string): Promise<ExportResult>
    onChanged(cb: (list: ConversationMeta[]) => void): () => void
  }
  saved: {
    list(): Promise<SavedAnswer[]>
    add(input: { conversationId: string; messageId: string; question: string; answer: string }): Promise<SavedAnswer>
    remove(id: string): Promise<void>
    onChanged(cb: (list: SavedAnswer[]) => void): () => void
  }
  memory: {
    list(): Promise<MemoryEntry[]>
    remove(id: string): Promise<void>
    clear(): Promise<void>
    onChanged(cb: (list: MemoryEntry[]) => void): () => void
  }
  chat: {
    send(payload: SendChatPayload): Promise<{ ok: boolean; error?: ChatError }>
    abort(conversationId: string): Promise<void>
    regenerate(
      conversationId: string,
      surface?: 'main' | 'float'
    ): Promise<{ ok: boolean; error?: ChatError }>
    onStart(cb: (e: ChatStartEvent) => void): () => void
    onDelta(cb: (e: ChatDeltaEvent) => void): () => void
    onDone(cb: (e: ChatDoneEvent) => void): () => void
    onError(cb: (e: ChatErrorEvent) => void): () => void
    onUserMessage(cb: (e: { conversationId: string; conversation: Conversation }) => void): () => void
  }
  capture: {
    screens(quality: CaptureQuality): Promise<DisplayInfo[]>
    windows(): Promise<WindowInfo[]>
    selectRegion(displayId: number): Promise<CaptureResult | null>
    captureWindow(sourceId: string): Promise<CaptureResult | null>
    saveImage(dataUrl: string, name?: string): Promise<Attachment>
    pickImages(): Promise<Attachment[]>
  }
  agent: {
    prepare(input: {
      conversationId: string
      messageId: string
      goal: string
      kind: AgentKind
      url?: string
    }): Promise<AgentPrepared | { error: string }>
    plan(id: string, lang: Lang): Promise<AgentPlan | { error: string }>
    run(id: string, lang: Lang): Promise<{ ok: boolean; error?: string }>
    cancel(): Promise<void>
    onStep(cb: (event: { id: string; step: AgentStep; total: number }) => void): () => void
    onRun(cb: (event: AgentRunEvent) => void): () => void
  }
  notify(payload: { title: string; body: string }): void
  hotkeys: {
    onError(cb: (accelerator: string) => void): () => void
  }
  commands: {
    on(cb: (command: AppCommand) => void): () => void
    onOpenConversation(cb: (id: string) => void): () => void
  }
  float: {
    toggle(): Promise<boolean>
    hide(): Promise<void>
    setCollapsed(collapsed: boolean): Promise<void>
    onVisibility(cb: (visible: boolean) => void): () => void
    onCollapsed(cb: (collapsed: boolean) => void): () => void
  }
}
