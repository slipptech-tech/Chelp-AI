import { create } from 'zustand'
import type {
  Attachment,
  ChatError,
  ChatMessage,
  ChatMode,
  Conversation,
  ConversationMeta,
  SavedAnswer,
  Settings
} from '@shared/types'
import { DEFAULT_PROVIDERS } from '@shared/providers'
import type { Lang } from '@shared/types'
import { translate } from './i18n'

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

const fallbackSettings: Settings = {
  language: 'en',
  accent: 'violet',
  startAtLogin: false,
  closeToTray: true,
  notifyOnDone: true,
  streaming: true,
  autoSwitchProvider: false,
  saveHistory: true,
  confirmBeforeSend: true,
  captureQuality: 'high',
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

  init: () => Promise<void>
  navigate: (page: Page) => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
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

  init: async () => {
    const [settings, version, conversations, saved] = await Promise.all([
      window.chelp.settings.get(),
      window.chelp.app.getVersion(),
      window.chelp.conversations.list(),
      window.chelp.saved.list()
    ])
    set({ settings, version, conversations, saved, ready: true })
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
    set((state) => ({
      conversation: state.conversationId === id ? null : state.conversation,
      conversationId: state.conversationId === id ? null : state.conversationId
    }))
  },

  clearHistory: async () => {
    await window.chelp.conversations.clearAll()
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
    })
  ]
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
