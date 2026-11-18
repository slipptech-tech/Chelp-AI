import { create } from 'zustand'
import type {
  AgentOffer,
  AgentPlan,
  AgentPrepared,
  Attachment,
  ChatError,
  ChatMessage,
  ChatMode,
  Conversation,
  ConversationMeta,
  SavedAnswer,
  Settings,
  StorageInfo,
  UpdateInfo,
  UpdateProgress
} from '@shared/types'
import { DEFAULT_PROVIDERS } from '@shared/providers'
import type { Lang } from '@shared/types'
import { translate } from './i18n'
import { formatBytes } from './lib/format'

export type Page =
  | 'dashboard'
  | 'assistant'
  | 'screen'
  | 'history'
  | 'saved'
  | 'settings'
  | 'ai'

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

export interface StreamingState {
  messageId: string
  text: string
  providerLabel: string
  mode: ChatMode
}

export interface UpdateState {
  info: UpdateInfo | null
  checking: boolean
  downloading: boolean
  installing: boolean
  progress: UpdateProgress | null
  ready: boolean
  dismissed: boolean
  error: string | null
}

const INITIAL_UPDATE: UpdateState = {
  info: null,
  checking: false,
  downloading: false,
  installing: false,
  progress: null,
  ready: false,
  dismissed: false,
  error: null
}

export type AgentStage =
  | 'idle'
  | 'preparing'
  | 'prepared'
  | 'planning'
  | 'planned'
  | 'running'
  | 'done'
  | 'cancelled'
  | 'error'

export interface AgentUiState {
  stage: AgentStage
  messageId: string | null
  conversationId: string | null
  prepared: AgentPrepared | null
  plan: AgentPlan | null
  error: string | null
  step: number
  total: number
}

const INITIAL_AGENT: AgentUiState = {
  stage: 'idle',
  messageId: null,
  conversationId: null,
  prepared: null,
  plan: null,
  error: null,
  step: 0,
  total: 0
}

const fallbackSettings: Settings = {
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
  hotkeysEnabled: true,
  hotkeys: { float: 'Ctrl+Shift+Space', capture: 'Ctrl+Shift+X' },
  providers: DEFAULT_PROVIDERS,
  activeProviderId: DEFAULT_PROVIDERS[0].id,
  floatCollapsed: false,
  mainBounds: null,
  floatBounds: null
}

function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function agentErrorText(language: Lang, code: string): string {
  if (/^(provider_\d+|input_exit_\d+)$/.test(code)) {
    return translate(language, 'agent.errors.provider')
  }
  const key = `agent.errors.${code}`
  const text = translate(language, key)
  return text === key ? translate(language, 'agent.errors.unknown') : text
}

interface AppState {
  ready: boolean
  settings: Settings
  version: string
  page: Page
  conversationId: string | null
  conversation: Conversation | null
  conversations: ConversationMeta[]
  saved: SavedAnswer[]
  streaming: Record<string, StreamingState | undefined>
  chatErrors: Record<string, ChatError | undefined>
  toasts: Toast[]
  loadingConversation: boolean
  storage: StorageInfo | null
  update: UpdateState
  agent: AgentUiState

  init: () => Promise<void>
  navigate: (page: Page) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  refreshStorage: () => Promise<void>
  clearPhotos: () => Promise<void>
  checkUpdates: (manual?: boolean) => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  dismissUpdate: () => void
  agentStart: (
    messageId: string,
    conversationId: string,
    offer: AgentOffer,
    run?: boolean
  ) => Promise<void>
  agentBuildPlan: () => Promise<boolean>
  agentRun: () => Promise<void>
  agentCancel: () => Promise<void>
  agentReset: () => void
  agentAllowChat: (conversationId: string) => Promise<void>
  agentForgetChat: (conversationId: string) => Promise<void>
  refreshConversations: () => Promise<void>
  refreshSaved: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  newChat: (mode?: ChatMode) => Promise<Conversation>
  closeConversation: () => void
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  sendMessage: (input: {
    text: string
    attachments?: Attachment[]
    mode?: ChatMode
    surface?: 'main' | 'float'
  }) => Promise<boolean>
  stopGeneration: (conversationId?: string) => Promise<void>
  retry: (conversationId: string) => Promise<void>
  analyzeCapture: (input: {
    dataUrl: string
    question: string
    defaultQuestion: string
  }) => Promise<boolean>
  saveAnswer: (message: ChatMessage, conversationId: string) => Promise<void>
  removeSaved: (id: string) => Promise<void>
  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
  clearChatError: (conversationId: string) => void
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  settings: fallbackSettings,
  version: '',
  page: 'dashboard',
  conversationId: null,
  conversation: null,
  conversations: [],
  saved: [],
  streaming: {},
  chatErrors: {},
  toasts: [],
  loadingConversation: false,
  storage: null,
  update: INITIAL_UPDATE,
  agent: INITIAL_AGENT,

  init: async () => {
    const [settings, version, conversations, saved] = await Promise.all([
      window.chelp.settings.get(),
      window.chelp.app.getVersion(),
      window.chelp.conversations.list(),
      window.chelp.saved.list()
    ])
    set({ settings, version, conversations, saved, ready: true })
    void get().refreshStorage()
    if (settings.checkUpdates) {
      setTimeout(() => void get().checkUpdates(), 1800)
    }
  },

  refreshStorage: async () => {
    try {
      set({ storage: await window.chelp.storage.info() })
    } catch {
      /* storage info is informational */
    }
  },

  clearPhotos: async () => {
    const language = get().settings.language
    const { freed, info } = await window.chelp.storage.clearPhotos()
    set({ storage: info })
    get().toast(translate(language, 'settings.photosCleared', { size: formatBytes(freed, language) }), 'success')
  },

  checkUpdates: async (manual = false) => {
    const language = get().settings.language
    set((state) => ({ update: { ...state.update, checking: true, error: null } }))
    const info = await window.chelp.update.check()
    set((state) => ({ update: { ...state.update, info, checking: false, error: info.error ?? null } }))
    if (!manual) return
    if (info.error) get().toast(translate(language, 'settings.updateCheckFailed'), 'error')
    else if (info.available) get().toast(translate(language, 'settings.updateFound', { version: info.version }), 'info')
    else get().toast(translate(language, 'settings.upToDate'), 'success')
  },

  downloadUpdate: async () => {
    const state = get()
    if (!state.update.info?.available || state.update.downloading) return
    const version = state.update.info.version
    set((current) => ({
      update: {
        ...current.update,
        downloading: true,
        ready: false,
        error: null,
        dismissed: false,
        progress: { version, received: 0, total: 0, percent: 0 }
      }
    }))
    const result = await window.chelp.update.download()
    if (!result.ok) {
      set((current) => ({
        update: {
          ...current.update,
          downloading: false,
          ready: false,
          progress: null,
          error: result.error ?? 'download_failed'
        }
      }))
      get().toast(translate(get().settings.language, 'settings.updateFailed'), 'error')
      return
    }
    set((current) => ({
      update: { ...current.update, downloading: false, ready: true, progress: null, error: null }
    }))
  },

  installUpdate: async () => {
    set((state) => ({ update: { ...state.update, installing: true } }))
    const result = await window.chelp.update.install()
    if (!result.ok) {
      set((state) => ({ update: { ...state.update, installing: false, error: result.error ?? 'install_failed' } }))
      get().toast(translate(get().settings.language, 'settings.updateFailed'), 'error')
    }
  },

  dismissUpdate: () => set((state) => ({ update: { ...state.update, dismissed: true } })),

  agentStart: async (messageId, conversationId, offer, run = false) => {
    const language = get().settings.language
    set({
      agent: {
        ...INITIAL_AGENT,
        stage: 'preparing',
        messageId,
        conversationId
      }
    })
    const result = await window.chelp.agent.prepare({
      conversationId,
      messageId,
      goal: offer.goal,
      kind: offer.kind,
      url: offer.url
    })
    if ('error' in result) {
      set((state) => ({ agent: { ...state.agent, stage: 'error', error: result.error } }))
      get().toast(agentErrorText(language, result.error), 'error')
      return
    }
    set((state) => ({
      agent: { ...state.agent, stage: 'prepared', prepared: result, total: 0, step: 0 }
    }))
    if (run) {
      if (await get().agentBuildPlan()) await get().agentRun()
    } else if (!result.needsScreenshot) {
      void get().agentBuildPlan()
    }
  },

  agentBuildPlan: async () => {
    const state = get()
    if (!state.agent.prepared) return false
    const language = state.settings.language
    set((current) => ({ agent: { ...current.agent, stage: 'planning', error: null } }))
    const result = await window.chelp.agent.plan(state.agent.prepared.id, language)
    if ('error' in result) {
      set((current) => ({ agent: { ...current.agent, stage: 'error', error: result.error } }))
      get().toast(agentErrorText(language, result.error), 'error')
      return false
    }
    set((current) => ({
      agent: { ...current.agent, stage: 'planned', plan: result, total: result.steps.length, step: 0 }
    }))
    return true
  },

  agentRun: async () => {
    const state = get()
    if (!state.agent.plan) return
    const language = state.settings.language
    set((current) => ({
      agent: {
        ...current.agent,
        stage: 'running',
        error: null,
        plan: current.agent.plan
          ? {
              ...current.agent.plan,
              steps: current.agent.plan.steps.map((step) => ({ ...step, status: 'pending' }))
            }
          : null
      }
    }))
    const result = await window.chelp.agent.run(state.agent.plan.id, language)
    if (!result.ok && result.error) {
      const current = get().agent
      if (current.stage === 'running') {
        set((agent) => ({
          agent: { ...agent.agent, stage: 'error', error: result.error ?? 'run_failed' }
        }))
      }
    }
  },

  agentCancel: async () => {
    await window.chelp.agent.cancel()
  },

  agentReset: () => set({ agent: INITIAL_AGENT }),

  agentAllowChat: async (conversationId) => {
    const chats = get().settings.agentAllowedChats
    if (chats.includes(conversationId)) return
    await get().updateSettings({ agentAllowedChats: [...chats, conversationId] })
  },

  agentForgetChat: async (conversationId) => {
    const chats = get().settings.agentAllowedChats
    if (!chats.includes(conversationId)) return
    await get().updateSettings({
      agentAllowedChats: chats.filter((id) => id !== conversationId)
    })
  },

  navigate: (page) => set({ page }),

  updateSettings: async (patch) => {
    const previous = get().settings
    set({ settings: { ...previous, ...patch, hotkeys: { ...previous.hotkeys, ...(patch.hotkeys ?? {}) } } })
    try {
      await window.chelp.settings.update(patch)
    } catch {
      set({ settings: previous })
      get().toast(translate(previous.language, 'errors.unknown'), 'error')
    }
  },

  refreshConversations: async () => {
    const conversations = await window.chelp.conversations.list()
    set({ conversations })
  },

  refreshSaved: async () => {
    const saved = await window.chelp.saved.list()
    set({ saved })
  },

  openConversation: async (id) => {
    set({ page: 'assistant', loadingConversation: true })
    const conversation = await window.chelp.conversations.get(id)
    set((state) => ({
      conversation,
      conversationId: conversation?.id ?? null,
      loadingConversation: false,
      chatErrors: { ...state.chatErrors, [id]: undefined }
    }))
  },

  newChat: async (mode = 'chat') => {
    const state = get()
    const current = state.conversation
    if (
      current &&
      current.messages.length === 0 &&
      current.mode === mode &&
      !state.streaming[current.id]
    ) {
      set({ page: 'assistant' })
      return current
    }
    if (current && current.messages.length === 0 && !state.streaming[current.id]) {
      await window.chelp.conversations.remove(current.id).catch(() => undefined)
    }
    const conversation = await window.chelp.conversations.create({ mode })
    set({
      conversation,
      conversationId: conversation.id,
      page: 'assistant',
      chatErrors: {}
    })
    return conversation
  },

  closeConversation: () => set({ conversation: null, conversationId: null }),

  renameConversation: async (id, title) => {
    await window.chelp.conversations.rename(id, title)
    set((state) => ({
      conversation:
        state.conversation?.id === id ? { ...state.conversation, title } : state.conversation
    }))
  },

  deleteConversation: async (id) => {
    await window.chelp.conversations.remove(id)
    if (get().settings.agentAllowedChats.includes(id)) {
      await get().updateSettings({
        agentAllowedChats: get().settings.agentAllowedChats.filter((chat) => chat !== id)
      })
    }
    set((state) => ({
      conversation: state.conversationId === id ? null : state.conversation,
      conversationId: state.conversationId === id ? null : state.conversationId
    }))
  },

  clearHistory: async () => {
    await window.chelp.conversations.clearAll()
    if (get().settings.agentAllowedChats.length) {
      await get().updateSettings({ agentAllowedChats: [] })
    }
    set({ conversation: null, conversationId: null, saved: [] })
  },

  sendMessage: async ({ text, attachments, mode, surface = 'main' }) => {
    const state = get()
    let conversationId = state.conversationId
    let conversation = state.conversation
    if (!conversationId) {
      conversation = await window.chelp.conversations.create({ mode: mode ?? 'chat' })
      conversationId = conversation.id
      set({ conversation, conversationId, page: 'assistant' })
    }
    const payloadMode = mode ?? conversation?.mode ?? 'chat'
    const result = await window.chelp.chat.send({
      conversationId,
      text,
      attachments,
      mode: payloadMode,
      surface
    })
    if (!result.ok) {
      const error = result.error ?? { code: 'unknown' }
      set((s) => ({ chatErrors: { ...s.chatErrors, [conversationId as string]: error } }))
      get().toast(translate(get().settings.language, `errors.${error.code}`), 'error')
      return false
    }
    return true
  },

  stopGeneration: async (conversationId) => {
    const id = conversationId ?? get().conversationId
    if (id) await window.chelp.chat.abort(id)
  },

  retry: async (conversationId) => {
    set((state) => ({ chatErrors: { ...state.chatErrors, [conversationId]: undefined } }))
    const result = await window.chelp.chat.regenerate(conversationId)
    if (!result.ok) {
      const error = result.error ?? { code: 'unknown' }
      set((state) => ({ chatErrors: { ...state.chatErrors, [conversationId]: error } }))
      get().toast(translate(get().settings.language, `errors.${error.code}`), 'error')
    }
  },

  analyzeCapture: async ({ dataUrl, question, defaultQuestion }) => {
    const attachment = await window.chelp.capture.saveImage(dataUrl)
    const conversation = await window.chelp.conversations.create({ mode: 'screen' })
    set({ conversation, conversationId: conversation.id, page: 'assistant' })
    return get().sendMessage({
      text: question.trim() || defaultQuestion,
      attachments: [attachment],
      mode: 'screen'
    })
  },

  saveAnswer: async (message, conversationId) => {
    const state = get()
    const conversation = state.conversation
    if (!conversation) return
    const index = conversation.messages.findIndex((m) => m.id === message.id)
    const question =
      [...conversation.messages.slice(0, index)]
        .reverse()
        .find((m) => m.role === 'user')?.content ?? conversation.title
    await window.chelp.saved.add({
      conversationId,
      messageId: message.id,
      question,
      answer: message.content
    })
    get().toast(translate(state.settings.language, 'toast.saved'), 'success')
  },

  removeSaved: async (id) => {
    await window.chelp.saved.remove(id)
  },

  toast: (message, tone = 'info') => {
    const id = uid()
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }))
    setTimeout(() => get().dismissToast(id), 4200)
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clearChatError: (conversationId) =>
    set((state) => ({ chatErrors: { ...state.chatErrors, [conversationId]: undefined } }))
}))

export function currentLanguage(): Lang {
  return useApp.getState().settings.language
}

export function wireEvents(): () => void {
  const api = window.chelp
  const unsubscribers = [
    api.settings.onChanged((settings) => useApp.setState({ settings })),
    api.conversations.onChanged((conversations) => useApp.setState({ conversations })),
    api.saved.onChanged((saved) => useApp.setState({ saved })),
    api.chat.onUserMessage(({ conversationId, conversation }) => {
      useApp.setState((state) => ({
        conversation: state.conversationId === conversationId ? conversation : state.conversation,
        chatErrors: { ...state.chatErrors, [conversationId]: undefined }
      }))
    }),
    api.chat.onStart(({ conversationId, messageId, providerLabel, mode }) => {
      useApp.setState((state) => ({
        streaming: {
          ...state.streaming,
          [conversationId]: { messageId, text: '', providerLabel, mode }
        },
        chatErrors: { ...state.chatErrors, [conversationId]: undefined }
      }))
    }),
    api.chat.onDelta(({ conversationId, delta }) => {
      useApp.setState((state) => {
        const current = state.streaming[conversationId]
        if (!current) return {}
        return {
          streaming: {
            ...state.streaming,
            [conversationId]: { ...current, text: current.text + delta }
          }
        }
      })
    }),
    api.chat.onDone(({ conversationId, conversation }) => {
      useApp.setState((state) => {
        const streaming = { ...state.streaming }
        delete streaming[conversationId]
        return {
          streaming,
          conversation: state.conversationId === conversationId ? conversation : state.conversation,
          chatErrors: { ...state.chatErrors, [conversationId]: undefined }
        }
      })
    }),
    api.chat.onError(({ conversationId, error }) => {
      const language = useApp.getState().settings.language
      useApp.setState((state) => {
        const streaming = { ...state.streaming }
        delete streaming[conversationId]
        return {
          streaming,
          chatErrors: { ...state.chatErrors, [conversationId]: error }
        }
      })
      if (error.code !== 'aborted') {
        useApp
          .getState()
          .toast(translate(language, `errors.${error.code}`, { keys: '' }), 'error')
      }
    }),
    api.hotkeys.onError((keys) => {
      const language = useApp.getState().settings.language
      useApp.getState().toast(translate(language, 'errors.hotkey', { keys }), 'error')
    }),
    api.update.onAvailable((info) => {
      useApp.setState((state) => ({
        update: { ...state.update, info, checking: false, dismissed: false }
      }))
    }),
    api.update.onProgress((progress) => {
      useApp.setState((state) => ({
        update: { ...state.update, downloading: true, progress }
      }))
    }),
    api.update.onReady(({ version }) => {
      useApp.setState((state) => ({
        update: {
          ...state.update,
          ready: true,
          downloading: false,
          progress: null,
          info: state.update.info ? { ...state.update.info, version, available: true } : state.update.info
        }
      }))
    }),
    api.update.onError(({ message }) => {
      useApp.setState((state) => ({
        update: { ...state.update, downloading: false, ready: false, progress: null, error: message }
      }))
    }),
    api.agent.onStep(({ id, step, total }) => {
      useApp.setState((state) => {
        const agent = state.agent
        const planId = agent.plan?.id
        const planned = agent.prepared?.id
        if (!planId || (planId !== id && planned !== id)) return {}
        return {
          agent: {
            ...agent,
            total,
            step: step.status === 'running' ? Math.max(agent.step, step.index - 1) : step.index,
            plan: agent.plan
              ? {
                  ...agent.plan,
                  steps: agent.plan.steps.map((entry) =>
                    entry.index === step.index ? step : entry
                  )
                }
              : agent.plan
          }
        }
      })
    }),
    api.agent.onRun(({ status, step, total, message }) => {
      useApp.setState((state) => {
        const agent = state.agent
        if (agent.stage !== 'running' && status === 'running') {
          return { agent: { ...agent, stage: 'running', step, total } }
        }
        if (status === 'running') {
          return { agent: { ...agent, step, total } }
        }
        const language = state.settings.language
        if (status === 'error' && message) {
          useApp.getState().toast(agentErrorText(language, message), 'error')
        }
        return {
          agent: {
            ...agent,
            stage: status === 'cancelled' ? 'cancelled' : status === 'error' ? 'error' : 'done',
            step,
            total,
            error: status === 'error' ? message ?? agent.error : agent.error
          }
        }
      })
    })
  ]
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
