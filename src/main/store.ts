import { app, safeStorage, dialog, nativeImage, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  Attachment,
  ChatMessage,
  Conversation,
  ConversationMeta,
  ExportResult,
  MemoryEntry,
  MemoryKind,
  Provider,
  SavedAnswer,
  Settings
} from '@shared/types'
import { DEFAULT_PROVIDERS } from '@shared/providers'

const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  accent: 'violet',
  startAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  notifyOnDone: true,
  streaming: true,
  autoSwitchProvider: false,
  saveHistory: true,
  confirmBeforeSend: true,
  captureQuality: 'high',
  enterToSend: true,
  reduceMotion: false,
  checkUpdates: true,
  photoRetentionDays: 14,
  agentPermission: 'ask',
  agentAllowedChats: [],
  aiMemory: true,
  hotkeysEnabled: true,
  hotkeys: { float: 'Ctrl+Shift+Space', capture: 'Ctrl+Shift+X' },
  providers: DEFAULT_PROVIDERS,
  activeProviderId: DEFAULT_PROVIDERS[0].id,
  floatCollapsed: false,
  mainBounds: null,
  floatBounds: null
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

function encryptKey(key: string): string {
  if (!key) return ''
  if (key.startsWith('enc:')) return key
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(key).toString('base64')}`
    }
  } catch {
    /* fall through to plain text */
  }
  return key
}

function decryptKey(value: string): string {
  if (!value || !value.startsWith('enc:')) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
  } catch {
    return ''
  }
}

const LEGACY_DEEPSEEK_MODELS: Record<string, { model: string; vision: boolean }> = {
  'deepseek-chat': { model: 'deepseek-flash', vision: true },
  'deepseek-reasoner': { model: 'deepseek-v4-pro', vision: false }
}

function metaOf(conversation: Conversation): ConversationMeta {
  const last = [...conversation.messages].reverse().find((m) => m.content.trim())
  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    preview: (last?.content ?? '').replace(/[#*`>\n]+/g, ' ').trim().slice(0, 140)
  }
}

const MAX_MEMORY_ENTRIES = 80

export class Store {
  readonly events = new EventEmitter()
  settings: Settings
  saved: SavedAnswer[]
  memory: MemoryEntry[] = []
  private conversations: Conversation[] = []
  private settingsFile: string
  private conversationsFile: string
  private savedFile: string
  private memoryFile: string
  private photosDir: string
  private writeTimer: NodeJS.Timeout | null = null

  constructor() {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    this.settingsFile = path.join(dir, 'settings.json')
    this.conversationsFile = path.join(dir, 'conversations.json')
    this.savedFile = path.join(dir, 'saved.json')
    this.memoryFile = path.join(dir, 'memory.json')
    this.photosDir = path.join(dir, 'photos-cache')
    const legacyPhotos = path.join(dir, 'attachments')
    fs.mkdirSync(this.photosDir, { recursive: true })
    const movedPhotos = this.moveLegacyPhotos(legacyPhotos)

    const raw = readJson<Partial<Settings>>(this.settingsFile, {})
    const storedProviders = Array.isArray(raw.providers) && raw.providers.length > 0 ? raw.providers : DEFAULT_PROVIDERS
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...raw,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(raw.hotkeys ?? {}) },
      providers: storedProviders.map((p: Provider) => {
        const legacy = p.kind === 'deepseek' ? LEGACY_DEEPSEEK_MODELS[p.model] : undefined
        return { ...p, ...(legacy ?? {}), apiKey: decryptKey(p.apiKey) }
      }),
      activeProviderId: raw.activeProviderId ?? storedProviders[0].id,
      agentPermission: raw.agentPermission === 'always' ? 'always' : 'ask',
      agentAllowedChats: Array.isArray(raw.agentAllowedChats)
        ? raw.agentAllowedChats.filter((id): id is string => typeof id === 'string')
        : []
    }
    if (!this.settings.providers.some((p) => p.id === this.settings.activeProviderId)) {
      this.settings.activeProviderId = this.settings.providers[0].id
    }

    const conversations = readJson<Conversation[]>(this.conversationsFile, [])
    this.conversations = Array.isArray(conversations) ? conversations : []
    if (movedPhotos) this.remapAttachments(legacyPhotos)
    if (movedPhotos || this.relocateAttachments()) {
      writeJson(this.conversationsFile, this.conversations)
    }
    const saved = readJson<SavedAnswer[]>(this.savedFile, [])
    this.saved = Array.isArray(saved) ? saved : []
    const memory = readJson<MemoryEntry[]>(this.memoryFile, [])
    this.memory = Array.isArray(memory)
      ? memory.filter(
          (entry): entry is MemoryEntry =>
            Boolean(entry) && typeof entry.id === 'string' && typeof entry.text === 'string'
        )
      : []
  }

  get attachmentsPath(): string {
    return this.photosDir
  }

  private moveLegacyPhotos(legacyDir: string): boolean {
    if (!fs.existsSync(legacyDir)) return false
    let moved = false
    try {
      for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        const from = path.join(legacyDir, entry.name)
        const to = path.join(this.photosDir, entry.name)
        try {
          if (!fs.existsSync(to)) fs.renameSync(from, to)
          else fs.rmSync(from, { force: true })
          moved = true
        } catch {
          /* leave the file; it is still reachable at the old path */
        }
      }
      fs.rmdirSync(legacyDir)
    } catch {
      /* folder is not empty or busy */
    }
    return moved
  }

  private remapAttachments(legacyDir: string): void {
    const prefix = legacyDir + path.sep
    for (const conversation of this.conversations) {
      for (const message of conversation.messages) {
        for (const attachment of message.attachments ?? []) {
          if (attachment.path.startsWith(prefix)) {
            attachment.path = path.join(this.photosDir, path.basename(attachment.path))
          }
        }
      }
    }
  }

  /** Keeps history working after the Chelp AI folder is moved to another location. */
  private relocateAttachments(): boolean {
    let changed = false
    for (const conversation of this.conversations) {
      for (const message of conversation.messages) {
        for (const attachment of message.attachments ?? []) {
          const target = path.join(this.photosDir, path.basename(attachment.path ?? ''))
          if (attachment.path !== target && !fs.existsSync(attachment.path) && fs.existsSync(target)) {
            attachment.path = target
            changed = true
          }
        }
      }
    }
    return changed
  }

  private photoPath(value: string): string {
    if (value && fs.existsSync(value)) return value
    const name = path.basename(value ?? '')
    return name ? path.join(this.photosDir, name) : value
  }

  photosStats(): { path: string; files: number; bytes: number } {
    let files = 0
    let bytes = 0
    try {
      for (const entry of fs.readdirSync(this.photosDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        files += 1
        try {
          bytes += fs.statSync(path.join(this.photosDir, entry.name)).size
        } catch {
          /* file vanished */
        }
      }
    } catch {
      /* folder missing */
    }
    return { path: this.photosDir, files, bytes }
  }

  clearPhotos(): number {
    let freed = 0
    try {
      for (const entry of fs.readdirSync(this.photosDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        const file = path.join(this.photosDir, entry.name)
        try {
          freed += fs.statSync(file).size
          fs.rmSync(file, { force: true })
        } catch {
          /* ignore locked file */
        }
      }
    } catch {
      /* folder missing */
    }
    return freed
  }

  /** Deletes old screenshots that are no longer referenced by any conversation. */
  prunePhotos(): number {
    const days = Number(this.settings.photoRetentionDays)
    if (!Number.isFinite(days) || days <= 0) return 0
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const referenced = new Set<string>()
    for (const conversation of this.conversations) {
      for (const message of conversation.messages) {
        for (const attachment of message.attachments ?? []) {
          if (attachment.path) referenced.add(path.basename(attachment.path))
        }
      }
    }
    let freed = 0
    try {
      for (const entry of fs.readdirSync(this.photosDir, { withFileTypes: true })) {
        if (!entry.isFile() || referenced.has(entry.name)) continue
        const file = path.join(this.photosDir, entry.name)
        try {
          const stat = fs.statSync(file)
          if (stat.mtimeMs >= cutoff) continue
          freed += stat.size
          fs.rmSync(file, { force: true })
        } catch {
          /* ignore locked file */
        }
      }
    } catch {
      /* folder missing */
    }
    return freed
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const previousFile = this.settingsFile
    this.settings = {
      ...this.settings,
      ...patch,
      hotkeys: { ...this.settings.hotkeys, ...(patch.hotkeys ?? {}) }
    }
    const persisted: Settings = {
      ...this.settings,
      providers: this.settings.providers.map((p) => ({ ...p, apiKey: encryptKey(p.apiKey) }))
    }
    writeJson(previousFile, persisted)
    this.events.emit('settings', this.settings)
    return this.settings
  }

  listConversations(): ConversationMeta[] {
    return [...this.conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(metaOf)
  }

  getConversation(id: string): Conversation | null {
    return this.conversations.find((c) => c.id === id) ?? null
  }

  createConversation(mode: Conversation['mode'] = 'chat', title = ''): Conversation {
    const now = Date.now()
    const conversation: Conversation = {
      id: randomUUID(),
      title,
      mode,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      preview: '',
      messages: []
    }
    this.conversations.unshift(conversation)
    this.persistConversations()
    this.emitConversations()
    return conversation
  }

  renameConversation(id: string, title: string): void {
    const conversation = this.getConversation(id)
    if (!conversation) return
    conversation.title = title.trim().slice(0, 120) || conversation.title
    conversation.updatedAt = Date.now()
    this.persistConversations()
    this.emitConversations()
  }

  removeConversation(id: string): void {
    const conversation = this.getConversation(id)
    if (conversation) this.deleteAttachments(conversation)
    this.conversations = this.conversations.filter((c) => c.id !== id)
    this.saved = this.saved.filter((s) => s.conversationId !== id)
    writeJson(this.savedFile, this.saved)
    this.persistConversations()
    this.emitConversations()
    this.events.emit('saved', this.saved)
  }

  clearConversations(): void {
    for (const conversation of this.conversations) this.deleteAttachments(conversation)
    this.clearPhotos()
    this.conversations = []
    this.saved = []
    writeJson(this.savedFile, this.saved)
    this.persistConversations()
    this.emitConversations()
    this.events.emit('saved', this.saved)
  }

  private deleteAttachments(conversation: Conversation): void {
    for (const message of conversation.messages) {
      for (const attachment of message.attachments ?? []) {
        try {
          fs.rmSync(this.photoPath(attachment.path), { force: true })
        } catch {
          /* ignore */
        }
      }
    }
  }

  addMessage(conversationId: string, message: ChatMessage): Conversation | null {
    const conversation = this.getConversation(conversationId)
    if (!conversation) return null
    conversation.messages.push(message)
    conversation.updatedAt = Date.now()
    if (!conversation.title && message.role === 'user') {
      const fallback = message.attachments?.length ? 'Screen analysis' : 'New conversation'
      conversation.title = (message.content.trim() || fallback).replace(/\s+/g, ' ').slice(0, 72)
    }
    this.persistConversations()
    this.emitConversations()
    return conversation
  }

  removeMessage(conversationId: string, messageId: string): Conversation | null {
    const conversation = this.getConversation(conversationId)
    if (!conversation) return null
    conversation.messages = conversation.messages.filter((m) => m.id !== messageId)
    conversation.updatedAt = Date.now()
    this.persistConversations()
    this.emitConversations()
    return conversation
  }

  truncateAfter(conversationId: string, messageId: string): Conversation | null {
    const conversation = this.getConversation(conversationId)
    if (!conversation) return null
    const index = conversation.messages.findIndex((m) => m.id === messageId)
    if (index === -1) return conversation
    conversation.messages = conversation.messages.slice(0, index + 1)
    conversation.updatedAt = Date.now()
    this.persistConversations()
    this.emitConversations()
    return conversation
  }

  saveAttachment(dataUrl: string, name?: string): Attachment {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(dataUrl)
    if (!match) throw new Error('Unsupported image data')
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    const id = randomUUID()
    const file = path.join(this.photosDir, `${id}.${ext}`)
    fs.writeFileSync(file, Buffer.from(match[2], 'base64'))
    const size = nativeImage.createFromPath(file).getSize()
    return {
      id,
      path: file,
      url: `chelp://attachments/${id}.${ext}`,
      name: name || `Screenshot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      width: size.width,
      height: size.height
    }
  }

  readAttachmentDataUrl(attachment: Attachment): string | null {
    try {
      const file = this.photoPath(attachment.path)
      const ext = path.extname(file).slice(1).replace('jpg', 'jpeg')
      const data = fs.readFileSync(file).toString('base64')
      return `data:image/${ext};base64,${data}`
    } catch {
      return null
    }
  }

  async pickImages(browserWindow?: BrowserWindow | null): Promise<Attachment[]> {
    const options: Electron.OpenDialogOptions = {
      title: 'Attach screenshots',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    }
    const result = browserWindow
      ? dialog.showOpenDialog(browserWindow, options)
      : dialog.showOpenDialog(options)
    const picked = await result
    if (picked.canceled) return []
    const attachments: Attachment[] = []
    for (const file of picked.filePaths) {
      try {
        const ext = path.extname(file).slice(1).replace('jpg', 'jpeg')
        const dataUrl = `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`
        attachments.push(this.saveAttachment(dataUrl, path.basename(file)))
      } catch {
        /* skip unreadable file */
      }
    }
    return attachments
  }

  addSaved(input: { conversationId: string; messageId: string; question: string; answer: string }): SavedAnswer {
    const entry: SavedAnswer = { id: randomUUID(), createdAt: Date.now(), ...input }
    this.saved.unshift(entry)
    writeJson(this.savedFile, this.saved)
    this.events.emit('saved', this.saved)
    return entry
  }

  removeSaved(id: string): void {
    this.saved = this.saved.filter((s) => s.id !== id)
    writeJson(this.savedFile, this.saved)
    this.events.emit('saved', this.saved)
  }

  listMemory(): MemoryEntry[] {
    return this.memory
  }

  remember(input: { kind: MemoryKind; text: string }): MemoryEntry | null {
    const text = input.text.trim()
    if (!text) return null
    const now = Date.now()
    const existing = this.memory.find(
      (entry) => entry.text.toLowerCase() === text.toLowerCase()
    )
    if (existing) {
      existing.createdAt = now
      existing.kind = input.kind
      this.persistMemory()
      return existing
    }
    const entry: MemoryEntry = {
      id: randomUUID(),
      kind: input.kind,
      text,
      createdAt: now
    }
    this.memory.unshift(entry)
    if (this.memory.length > MAX_MEMORY_ENTRIES) this.memory.length = MAX_MEMORY_ENTRIES
    this.persistMemory()
    return entry
  }

  removeMemory(id: string): void {
    const next = this.memory.filter((entry) => entry.id !== id)
    if (next.length === this.memory.length) return
    this.memory = next
    this.persistMemory()
  }

  clearMemory(): void {
    if (this.memory.length === 0) return
    this.memory = []
    this.persistMemory()
  }

  private persistMemory(): void {
    writeJson(this.memoryFile, this.memory)
    this.events.emit('memory', this.memory)
  }

  private persistConversations(): void {
    if (!this.settings.saveHistory) return
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      try {
        writeJson(this.conversationsFile, this.conversations)
      } catch (error) {
        console.error('Failed to persist conversations', error)
      }
    }, 120)
  }

  private emitConversations(): void {
    this.events.emit('conversations', this.listConversations())
  }

  async exportConversation(id: string, browserWindow?: BrowserWindow | null): Promise<ExportResult> {
    const conversation = this.getConversation(id)
    if (!conversation) return { ok: false }
    const safeName = (conversation.title || 'chelp-conversation')
      .replace(/[\\/:*?"<>|]/g, '-')
      .slice(0, 60)
    const options: Electron.SaveDialogOptions = {
      title: 'Export conversation',
      defaultPath: `${safeName}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    }
    const result = await (browserWindow
      ? dialog.showSaveDialog(browserWindow, options)
      : dialog.showSaveDialog(options))
    if (result.canceled || !result.filePath) return { ok: false }
    const extension = path.extname(result.filePath).toLowerCase()
    if (extension === '.json') {
      fs.writeFileSync(result.filePath, JSON.stringify(conversation, null, 2), 'utf-8')
    } else {
      const lines: string[] = [
        `# ${conversation.title}`,
        '',
        `_Exported from Chelp AI · ${new Date(conversation.createdAt).toLocaleString()}_`,
        ''
      ]
      for (const message of conversation.messages) {
        lines.push(`## ${message.role === 'user' ? 'You' : 'Chelp AI'}`)
        if (message.attachments?.length) {
          lines.push(
            message.attachments
              .map((a) => `![${a.name}](attachments/${path.basename(a.path)})`)
              .join('\n')
          )
          lines.push('')
        }
        lines.push(message.content, '')
      }
      fs.writeFileSync(result.filePath, lines.join('\n'), 'utf-8')
      for (const message of conversation.messages) {
        for (const attachment of message.attachments ?? []) {
          try {
            const source = this.photoPath(attachment.path)
            fs.copyFileSync(source, path.join(path.dirname(result.filePath), path.basename(source)))
          } catch {
            /* ignore missing attachment */
          }
        }
      }
    }
    return { ok: true, path: result.filePath }
  }
}

let instance: Store | null = null

export function getStore(): Store {
  if (!instance) instance = new Store()
  return instance
}
