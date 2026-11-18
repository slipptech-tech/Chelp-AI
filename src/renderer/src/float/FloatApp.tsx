import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Paperclip,
  Plus,
  RotateCcw,
  Scan,
  Square,
  X
} from 'lucide-react'
import type {
  Attachment,
  ChatError,
  ChatMessage,
  Conversation,
  Provider,
  Settings
} from '@shared/types'
import { isProviderReady, visionProviderFor } from '@shared/providers'
import { translate } from '../i18n'
import { formatKey } from '../lib/format'
import { Logo } from '../components/Logo'
import { Markdown } from '../components/Markdown'
import { IconButton, Spinner } from '../components/ui'

const STORAGE_KEY = 'chelp.float.conversation'

export function FloatApp() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY)
  )
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [streaming, setStreaming] = useState<{ text: string; providerLabel: string } | null>(null)
  const [error, setError] = useState<ChatError | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [confirming, setConfirming] = useState<{ text: string; files: Attachment[] } | null>(null)
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const conversationIdRef = useRef<string | null>(conversationId)

  const lang = settings?.language ?? 'en'
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang]
  )

  const activeProvider: Provider | undefined = settings
    ? settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
    : undefined
  const visionProvider: Provider | undefined = settings
    ? visionProviderFor(settings.providers, settings.activeProviderId, settings.autoSwitchProvider)
    : undefined
  const hasKey = Boolean(settings?.providers.some(isProviderReady))
  const providerLabel =
    attachments.length > 0
      ? visionProvider
        ? `${visionProvider.name} · ${visionProvider.model}`
        : t('screen.visionTitle')
      : activeProvider
        ? `${activeProvider.name} · ${activeProvider.model}`
        : 'AI'

  useEffect(() => {
    let alive = true
    void (async () => {
      const loaded = await window.chelp.settings.get()
      if (!alive) return
      setSettings(loaded)
      setCollapsed(loaded.floatCollapsed)
      if (conversationId) {
        const stored = await window.chelp.conversations.get(conversationId)
        if (!alive) return
        if (stored) setConversation(stored)
        else {
          localStorage.removeItem(STORAGE_KEY)
          conversationIdRef.current = null
          setConversationId(null)
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsubscribers = [
      window.chelp.settings.onChanged((next) => setSettings(next)),
      window.chelp.float.onCollapsed((value) => setCollapsed(value)),
      window.chelp.conversations.onChanged((list) => {
        const current = conversationIdRef.current
        if (current && !list.some((item) => item.id === current)) {
          localStorage.removeItem(STORAGE_KEY)
          conversationIdRef.current = null
          setConversationId(null)
          setConversation(null)
          setStreaming(null)
        }
      }),
      window.chelp.chat.onUserMessage(({ conversationId: id, conversation: next }) => {
        if (id === conversationIdRef.current) setConversation(next)
      }),
      window.chelp.chat.onStart(({ conversationId: id, providerLabel: label }) => {
        if (id === conversationIdRef.current) {
          setError(null)
          setStreaming({ text: '', providerLabel: label })
        }
      }),
      window.chelp.chat.onDelta(({ conversationId: id, delta }) => {
        if (id !== conversationIdRef.current) return
        setStreaming((current) =>
          current ? { ...current, text: current.text + delta } : current
        )
      }),
      window.chelp.chat.onDone(({ conversationId: id, conversation: next }) => {
        if (id !== conversationIdRef.current) return
        setConversation(next)
        setStreaming(null)
      }),
      window.chelp.chat.onError(({ conversationId: id, error: next }) => {
        if (id !== conversationIdRef.current) return
        setStreaming(null)
        if (next.code !== 'aborted') setError(next)
      })
    ]
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [conversation?.messages.length, streaming?.text, error])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(96, textareaRef.current.scrollHeight)}px`
  }, [text])

  const ensureConversation = async (mode: 'chat' | 'screen'): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current
    const created = await window.chelp.conversations.create({ mode })
    localStorage.setItem(STORAGE_KEY, created.id)
    conversationIdRef.current = created.id
    setConversationId(created.id)
    setConversation(created)
    return created.id
  }

  const deliver = async (value: string, files: Attachment[]): Promise<void> => {
    if (!hasKey || !settings) return
    const mode = files.length > 0 ? 'screen' : 'chat'
    const finalText = value.trim() || (files.length ? t('screen.defaultQuestion') : '')
    if (!finalText && files.length === 0) return
    if (files.length > 0 && !visionProvider) {
      window.chelp.app.focus('open-ai')
      return
    }
    setSending(true)
    setError(null)
    try {
      const id = await ensureConversation(mode)
      const result = await window.chelp.chat.send({
        conversationId: id,
        text: finalText,
        attachments: files,
        mode,
        surface: 'float'
      })
      if (result.ok) {
        setText('')
        setAttachments([])
      } else if (result.error) {
        setError(result.error)
      }
    } finally {
      setSending(false)
    }
  }

  const handleSend = (): void => {
    if (streaming || sending) return
    const value = text.trim()
    if (!value && attachments.length === 0) return
    if (attachments.length > 0 && settings?.confirmBeforeSend) {
      setConfirming({ text: value, files: attachments })
      return
    }
    void deliver(value, attachments)
  }

  const addImages = async (): Promise<void> => {
    const picked = await window.chelp.capture.pickImages()
    if (picked.length) setAttachments((current) => [...current, ...picked])
  }

  const captureRegion = async (): Promise<void> => {
    if (!settings) return
    setCapturing(true)
    try {
      const displays = await window.chelp.capture.screens(settings.captureQuality)
      const primary = displays.find((display) => display.primary) ?? displays[0]
      if (!primary) return
      const shot = await window.chelp.capture.selectRegion(primary.id)
      if (!shot) return
      const attachment = await window.chelp.capture.saveImage(shot.dataUrl)
      setAttachments((current) => [...current, attachment])
      requestAnimationFrame(() => textareaRef.current?.focus())
    } finally {
      setCapturing(false)
    }
  }

  const startNewChat = (): void => {
    const current = conversationIdRef.current
    conversationIdRef.current = null
    if (current && streaming) void window.chelp.chat.abort(current)
    localStorage.removeItem(STORAGE_KEY)
    setConversationId(null)
    setConversation(null)
    setText('')
    setAttachments([])
    setStreaming(null)
    setError(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const collapse = (): void => {
    setCollapsed(true)
    void window.chelp.float.setCollapsed(true)
  }

  const expand = (): void => {
    setCollapsed(false)
    void window.chelp.float.setCollapsed(false)
  }

  const openInApp = (): void => {
    if (conversationId) window.chelp.app.openConversation(conversationId)
    else window.chelp.app.focus('open-assistant')
    void window.chelp.float.hide()
  }

  const messages = useMemo(() => conversation?.messages ?? [], [conversation])

  if (!settings) {
    return (
      <div className="float-loading">
        <Spinner size={18} />
      </div>
    )
  }

  if (collapsed) {
    return (
      <div className="float-orb-wrap">
        <button type="button" className="float-orb" onClick={expand} title={t('float.expand')}>
          <span className="float-orb-glow" />
          <Logo size={34} />
        </button>
      </div>
    )
  }

  return (
    <div className="float-shell">
      <header className="float-head">
        <div className="float-brand">
          <Logo size={20} />
          <strong>{t('float.title')}</strong>
          {hasKey ? <span className="float-status" /> : null}
        </div>
        <div className="float-head-actions">
          <IconButton label={t('float.newChat')} onClick={startNewChat}>
            <Plus size={15} />
          </IconButton>
          <IconButton label={t('float.openApp')} onClick={openInApp}>
            <ExternalLink size={14} />
          </IconButton>
          <IconButton label={t('float.collapse')} onClick={collapse}>
            <ChevronDown size={15} />
          </IconButton>
          <IconButton label={t('float.close')} onClick={() => void window.chelp.float.hide()}>
            <X size={15} />
          </IconButton>
        </div>
      </header>

      <div className="float-body" ref={scrollRef}>
        {messages.length === 0 && !streaming ? (
          <div className="float-empty">
            <Logo size={38} />
            <strong>{t('float.empty')}</strong>
            <span>{t('assistant.subtitle')}</span>
            <div className="float-suggest">
              <button
                type="button"
                onClick={() => {
                  setText(t('assistant.suggest.errorPrompt'))
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
              >
                {t('assistant.suggest.error')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setText(t('assistant.suggest.codePrompt'))
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
              >
                {t('assistant.suggest.code')}
              </button>
            </div>
          </div>
        ) : (
          <div className="float-messages">
            {messages.map((message) => (
              <FloatMessage
                key={message.id}
                message={message}
                onLightbox={setLightbox}
                t={t}
              />
            ))}
            {streaming ? (
              <div className="float-msg is-assistant">
                <div className="float-msg-avatar">
                  <Logo size={18} />
                </div>
                <div className="float-msg-body">
                  {streaming.text ? (
                    <>
                      <Markdown content={streaming.text} />
                      <span className="stream-caret" />
                    </>
                  ) : (
                    <div className="thinking-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="float-error">
                <CircleAlert size={14} />
                <div>
                  <strong>{t('assistant.error.title')}</strong>
                  <span>{t(`errors.${error.code}`)}</span>
                  {error.providerLabel ? (
                    <span className="float-error-provider">{error.providerLabel}</span>
                  ) : null}
                </div>
                {conversationId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      void window.chelp.chat.regenerate(conversationId, 'float')
                    }}
                  >
                    <RotateCcw size={12} />
                    {t('common.retry')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!hasKey ? (
        <button type="button" className="float-banner" onClick={() => window.chelp.app.focus('open-ai')}>
          {t('ai.noKeyBanner')}
        </button>
      ) : null}

      <div className="float-composer">
        {attachments.length > 0 ? (
          <div className="float-attachments">
            {attachments.map((attachment) => (
              <div className="float-attachment" key={attachment.id}>
                <img src={attachment.url} alt={attachment.name} />
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((current) => current.filter((item) => item.id !== attachment.id))
                  }
                  aria-label={t('float.remove')}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            {!visionProvider ? (
              <button
                type="button"
                className="float-attachment-warn"
                onClick={() => window.chelp.app.focus('open-ai')}
              >
                {t('screen.visionTitle')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="float-input">
          <textarea
            ref={textareaRef}
            value={text}
            rows={1}
            placeholder={t('float.placeholder')}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                handleSend()
              }
            }}
          />
          <div className="float-input-bar">
            <div className="float-tools">
              <IconButton label={t('assistant.attach')} onClick={() => void addImages()}>
                <Paperclip size={14} />
              </IconButton>
              <IconButton
                label={t('float.capture')}
                onClick={() => void captureRegion()}
                disabled={capturing}
              >
                {capturing ? <Spinner size={13} /> : <Scan size={14} />}
              </IconButton>
              <span className="float-provider" title={providerLabel}>
                {(attachments.length > 0 ? visionProvider : activeProvider)?.model ??
                  t('nav.apiMissing')}
              </span>
            </div>
            {streaming ? (
              <button
                type="button"
                className="float-send is-stop"
                onClick={() => conversationId && void window.chelp.chat.abort(conversationId)}
                aria-label={t('common.stop')}
              >
                <Square size={11} />
              </button>
            ) : (
              <button
                type="button"
                className="float-send"
                onClick={handleSend}
                disabled={(!text.trim() && attachments.length === 0) || !hasKey}
                aria-label={t('common.send')}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="float-foot">
          <span>{t('float.hint')}</span>
          {settings ? <kbd className="kbd">{formatKey(settings.hotkeys.float)}</kbd> : null}
        </div>
      </div>

      {lightbox ? (
        <div
          className="float-lightbox"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <img src={lightbox} alt="" />
        </div>
      ) : null}

      {confirming ? (
        <div className="float-confirm">
          <div className="float-confirm-card">
            <strong>{t('assistant.confirmTitle')}</strong>
            <p>{t('assistant.confirmText', { provider: providerLabel })}</p>
            <div className="float-confirm-actions">
              <button type="button" onClick={() => setConfirming(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => {
                  const payload = confirming
                  setConfirming(null)
                  void deliver(payload.text, payload.files)
                }}
              >
                {t('common.send')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FloatMessage({
  message,
  onLightbox,
  t
}: {
  message: ChatMessage
  onLightbox: (url: string) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  if (message.role === 'user') {
    return (
      <div className="float-msg is-user">
        <div className="float-msg-body">
          {message.attachments?.length ? (
            <div className="float-msg-images">
              {message.attachments.map((attachment) => (
                <button key={attachment.id} type="button" onClick={() => onLightbox(attachment.url)}>
                  <img src={attachment.url} alt={attachment.name} />
                </button>
              ))}
            </div>
          ) : null}
          {message.content ? <p>{message.content}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="float-msg is-assistant">
      <div className="float-msg-avatar">
        <Logo size={18} />
      </div>
      <div className="float-msg-body">
        {message.content ? (
          <Markdown content={message.content} />
        ) : message.error ? (
          <span className="float-msg-error">{t(`errors.${message.error.code}`)}</span>
        ) : null}
      </div>
    </div>
  )
}
