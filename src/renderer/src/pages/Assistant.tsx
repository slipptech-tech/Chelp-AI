import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import {
  ArrowUp,
  BookmarkPlus,
  Check,
  CircleAlert,
  Copy,
  Download,
  MessageSquare,
  MonitorUp,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Scan,
  Search,
  Settings2,
  Square,
  Trash2,
  X
} from 'lucide-react'
import type { Attachment, ChatError, ChatMessage } from '@shared/types'
import { isProviderReady, visionProviderFor } from '@shared/providers'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { formatClock, groupConversations, relativeTime } from '../lib/format'
import { clipboardImage } from '../lib/clipboard'
import { Logo } from '../components/Logo'
import { Markdown } from '../components/Markdown'
import { AgentCard } from '../components/AgentCard'
import { ThinkingText } from '../components/Thinking'
import { Button, IconButton, Modal, Spinner } from '../components/ui'

export function AssistantPage() {
  const t = useT()
  const settings = useSettings()
  const conversation = useApp((state) => state.conversation)
  const conversationId = useApp((state) => state.conversationId)
  const conversations = useApp((state) => state.conversations)
  const streaming = useApp((state) =>
    conversationId ? state.streaming[conversationId] : undefined
  )
  const chatError = useApp((state) =>
    conversationId ? state.chatErrors[conversationId] : undefined
  )
  const saved = useApp((state) => state.saved)
  const loading = useApp((state) => state.loadingConversation)
  const sendMessage = useApp((state) => state.sendMessage)
  const newChat = useApp((state) => state.newChat)
  const openConversation = useApp((state) => state.openConversation)
  const renameConversation = useApp((state) => state.renameConversation)
  const deleteConversation = useApp((state) => state.deleteConversation)
  const stopGeneration = useApp((state) => state.stopGeneration)
  const retry = useApp((state) => state.retry)
  const saveAnswer = useApp((state) => state.saveAnswer)
  const toast = useApp((state) => state.toast)
  const navigate = useApp((state) => state.navigate)

  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pending, setPending] = useState<{ text: string; attachments: Attachment[] } | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeProvider =
    settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  const visionProvider = visionProviderFor(
    settings.providers,
    settings.activeProviderId,
    settings.autoSwitchProvider
  )
  const hasKey = settings.providers.some(isProviderReady)
  const noVision = attachments.length > 0 && !visionProvider

  const groups = useMemo(() => {
    const filtered = conversations.filter((item) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q)
    })
    return groupConversations(filtered, settings.language)
  }, [conversations, query, settings.language])

  useEffect(() => {
    if (conversationId && !conversation) void openConversation(conversationId)
  }, [conversationId, conversation, openConversation])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [conversation?.id, conversation?.messages.length, streaming?.text, chatError])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(180, textareaRef.current.scrollHeight)}px`
  }, [text])

  const focusComposer = (value?: string): void => {
    if (value !== undefined) setText(value)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const startNewChat = async (): Promise<void> => {
    setText('')
    setAttachments([])
    await newChat('chat')
    focusComposer()
  }

  const addAttachments = async (): Promise<void> => {
    const picked = await window.chelp.capture.pickImages()
    if (picked.length) setAttachments((current) => [...current, ...picked])
  }

  const captureRegion = async (): Promise<void> => {
    setCapturing(true)
    try {
      const displays = await window.chelp.capture.screens(settings.captureQuality)
      const primary = displays.find((d) => d.primary) ?? displays[0]
      if (!primary) return
      const shot = await window.chelp.capture.selectRegion(primary.id)
      if (!shot) {
        toast(t('toast.regionCancelled'), 'info')
        return
      }
      const attachment = await window.chelp.capture.saveImage(shot.dataUrl)
      setAttachments((current) => [...current, attachment])
      focusComposer()
    } finally {
      setCapturing(false)
    }
  }

  const pasteImage = async (event: ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
    try {
      const dataUrl = await clipboardImage(event)
      if (!dataUrl) return
      const attachment = await window.chelp.capture.saveImage(
        dataUrl,
        t('assistant.pastedImage')
      )
      setAttachments((current) => [...current, attachment])
      focusComposer()
    } catch {
      toast(t('toast.pasteFailed'), 'error')
    }
  }

  const doSend = async (
    value: string,
    files: Attachment[],
    mode: 'chat' | 'screen'
  ): Promise<void> => {
    const finalText = value.trim() || (files.length ? t('screen.defaultQuestion') : '')
    if (!finalText && files.length === 0) return
    const ok = await sendMessage({ text: finalText, attachments: files, mode })
    if (ok) {
      setText('')
      setAttachments([])
    }
  }

  const handleSend = (): void => {
    if (streaming) return
    const value = text.trim()
    if (!value && attachments.length === 0) return
    if (attachments.length > 0 && noVision) {
      toast(t('screen.visionTitle'), 'error')
      return
    }
    if (attachments.length > 0 && settings.confirmBeforeSend) {
      setPending({ text: value, attachments })
      return
    }
    void doSend(value, attachments, attachments.length > 0 ? 'screen' : conversation?.mode ?? 'chat')
  }

  const exportConversation = async (): Promise<void> => {
    if (!conversationId) return
    const result = await window.chelp.conversations.export(conversationId)
    if (result.ok) toast(t('assistant.exported'), 'success')
  }

  const confirmRename = async (): Promise<void> => {
    if (!conversationId) return
    const value = renameValue.trim()
    if (!value) return
    await renameConversation(conversationId, value)
    setRenameOpen(false)
    toast(t('history.renamed'), 'success')
  }

  const confirmDelete = async (): Promise<void> => {
    if (!conversationId) return
    await deleteConversation(conversationId)
    setDeleteOpen(false)
    toast(t('history.deleted'), 'success')
  }

  const providerLabel = visionProvider
    ? `${visionProvider.name} · ${visionProvider.model}`
    : activeProvider
      ? `${activeProvider.name} · ${activeProvider.model}`
      : 'AI'

  const messages = conversation?.messages ?? []
  const showEmpty = !loading && messages.length === 0 && !streaming

  return (
    <div className="page page-assistant">
      <aside className="conv-rail">
        <div className="conv-rail-head">
          <span className="conv-rail-title">{t('assistant.rail')}</span>
          <IconButton label={t('common.newChat')} onClick={() => void startNewChat()}>
            <Plus size={16} />
          </IconButton>
        </div>
        <div className="rail-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('assistant.search')}
            aria-label={t('assistant.search')}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}>
              <X size={12} />
            </button>
          ) : null}
        </div>
        <div className="conv-list">
          {groups.length === 0 ? (
            <p className="rail-empty">{t('assistant.emptyRail')}</p>
          ) : (
            groups.map((group) => (
              <div className="conv-group" key={group.label}>
                <span className="conv-group-label">{group.label}</span>
                {group.items.map((item) => {
                  const ItemIcon = item.mode === 'screen' ? MonitorUp : MessageSquare
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`conv-item ${item.id === conversationId ? 'is-active' : ''}`}
                      onClick={() => void openConversation(item.id)}
                    >
                      <span className="conv-item-icon">
                        <ItemIcon size={14} />
                      </span>
                      <span className="conv-item-body">
                        <span className="conv-item-title">
                          {item.title || t('common.untitled')}
                        </span>
                        <span className="conv-item-meta">
                          {relativeTime(item.updatedAt, settings.language)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="chat-pane">
        <header className="chat-header">
          <div className="chat-header-main">
            <h1>{conversation?.title || t('assistant.newConversation')}</h1>
            <div className="chat-header-meta">
              {conversation ? (
                <>
                  <span className={`mode-chip ${conversation.mode === 'screen' ? 'is-screen' : ''}`}>
                    {conversation.mode === 'screen'
                      ? t('assistant.analysisMode')
                      : t('assistant.chatMode')}
                  </span>
                  <span className="meta-dot">·</span>
                  <span>{t('common.messages', { n: conversation.messages.length })}</span>
                </>
              ) : (
                <span>{t('assistant.subtitle')}</span>
              )}
              {activeProvider ? (
                <>
                  <span className="meta-dot">·</span>
                  <button
                    type="button"
                    className="provider-chip"
                    onClick={() => navigate('ai')}
                    title={t('nav.ai')}
                  >
                    {activeProvider.name} · {activeProvider.model}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="chat-header-actions">
            {conversation ? (
              <>
                <IconButton label={t('common.export')} onClick={() => void exportConversation()}>
                  <Download size={15} />
                </IconButton>
                <IconButton
                  label={t('common.rename')}
                  onClick={() => {
                    setRenameValue(conversation.title || '')
                    setRenameOpen(true)
                  }}
                >
                  <Pencil size={15} />
                </IconButton>
                <IconButton label={t('common.delete')} onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={15} />
                </IconButton>
              </>
            ) : null}
            <IconButton label={t('common.newChat')} onClick={() => void startNewChat()}>
              <Plus size={16} />
            </IconButton>
          </div>
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          {showEmpty ? (
            <div className="chat-empty">
              <div className="chat-empty-glow" />
              <Logo size={54} />
              <h2>{t('assistant.empty.title')}</h2>
              <p>{t('assistant.empty.text')}</p>
              <div className="suggest-grid">
                <button type="button" className="suggest-card" onClick={() => navigate('screen')}>
                  <Scan size={16} />
                  <span>{t('assistant.suggest.analyze')}</span>
                </button>
                <button
                  type="button"
                  className="suggest-card"
                  onClick={() => focusComposer(t('assistant.suggest.errorPrompt'))}
                >
                  <CircleAlert size={16} />
                  <span>{t('assistant.suggest.error')}</span>
                </button>
                <button
                  type="button"
                  className="suggest-card"
                  onClick={() => focusComposer(t('assistant.suggest.codePrompt'))}
                >
                  <MessageSquare size={16} />
                  <span>{t('assistant.suggest.code')}</span>
                </button>
                <button
                  type="button"
                  className="suggest-card"
                  onClick={() => focusComposer(t('assistant.suggest.windowsPrompt'))}
                >
                  <Settings2 size={16} />
                  <span>{t('assistant.suggest.windows')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  isSaved={saved.some((item) => item.messageId === message.id)}
                  isLast={index === messages.length - 1}
                  disabled={Boolean(streaming)}
                  onLightbox={setLightbox}
                  onSave={() => conversationId && void saveAnswer(message, conversationId)}
                  onRetry={() => conversationId && void retry(conversationId)}
                  onCopy={() => {
                    window.chelp.clipboard.write(message.content)
                    toast(t('toast.copied'), 'success')
                  }}
                />
              ))}

              {streaming ? (
                <StreamingRow text={streaming.text} providerLabel={streaming.providerLabel} />
              ) : null}

              {chatError ? (
                <ErrorBanner
                  error={chatError}
                  onRetry={() => conversationId && void retry(conversationId)}
                  onConfigure={() => navigate('ai')}
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {!hasKey ? (
            <div className="inline-banner">
              <span>{t('ai.noKeyBanner')}</span>
              <button type="button" onClick={() => navigate('ai')}>
                {t('nav.ai')}
              </button>
            </div>
          ) : null}
          {noVision ? (
            <div className="inline-banner is-warn">
              <span>{t('screen.visionTitle')}</span>
              <button type="button" onClick={() => navigate('ai')}>
                {t('screen.visionCta')}
              </button>
            </div>
          ) : null}

          <div className="composer">
            {attachments.length > 0 ? (
              <div className="attachment-strip">
                {attachments.map((attachment) => (
                  <div className="attachment-chip" key={attachment.id}>
                    <img src={attachment.url} alt={attachment.name} />
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((current) => current.filter((a) => a.id !== attachment.id))
                      }
                      aria-label={t('float.remove')}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              placeholder={t('assistant.composer.placeholder')}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => void pasteImage(event)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                const chord = event.ctrlKey || event.metaKey
                const send = settings.enterToSend ? !event.shiftKey : chord
                if (!send) return
                event.preventDefault()
                handleSend()
              }}
            />
            <div className="composer-bar">
              <div className="composer-tools">
                <IconButton label={t('assistant.attach')} onClick={() => void addAttachments()}>
                  <Paperclip size={16} />
                </IconButton>
                <IconButton
                  label={t('assistant.capture')}
                  onClick={() => void captureRegion()}
                  disabled={capturing}
                >
                  {capturing ? <Spinner /> : <Scan size={16} />}
                </IconButton>
                <button
                  type="button"
                  className="composer-model"
                  onClick={() => navigate('ai')}
                  title={t('nav.ai')}
                >
                  {activeProvider ? activeProvider.model : t('nav.apiMissing')}
                </button>
              </div>
              <div className="composer-send">
                {streaming ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Square size={12} />}
                    onClick={() => void stopGeneration()}
                  >
                    {t('common.stop')}
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="send-btn"
                    onClick={handleSend}
                    disabled={(!text.trim() && attachments.length === 0) || !hasKey || noVision}
                    aria-label={t('common.send')}
                  >
                    <ArrowUp size={17} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <span className="composer-hint">
            {t(settings.enterToSend ? 'assistant.composer.hint' : 'assistant.composer.hintCtrl')}
          </span>
        </div>
      </section>

      {lightbox ? (
        <div className="lightbox" onClick={() => setLightbox(null)} role="presentation">
          <img src={lightbox} alt="" />
          <IconButton label={t('common.close')} className="lightbox-close" onClick={() => setLightbox(null)}>
            <X size={18} />
          </IconButton>
        </div>
      ) : null}

      {pending ? (
        <Modal
          title={t('assistant.confirmTitle')}
          description={t('assistant.confirmText', { provider: providerLabel })}
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const payload = pending
                  setPending(null)
                  void doSend(payload.text, payload.attachments, 'screen')
                }}
              >
                {t('common.send')}
              </Button>
            </>
          }
        >
          <div className="confirm-preview">
            <img src={pending.attachments[0].url} alt="" />
            <p>{pending.text || t('screen.defaultQuestion')}</p>
          </div>
        </Modal>
      ) : null}

      {renameOpen ? (
        <Modal
          title={t('assistant.renameTitle')}
          onClose={() => setRenameOpen(false)}
          footer={
            <>
              <Button onClick={() => setRenameOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void confirmRename()}>
                {t('common.save')}
              </Button>
            </>
          }
        >
          <input
            className="input"
            autoFocus
            value={renameValue}
            placeholder={t('assistant.renamePlaceholder')}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirmRename()
            }}
          />
        </Modal>
      ) : null}

      {deleteOpen ? (
        <Modal
          title={t('assistant.deleteTitle')}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <Button onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => void confirmDelete()}>
                {t('common.delete')}
              </Button>
            </>
          }
        >
          <p className="modal-text">{t('assistant.deleteText')}</p>
        </Modal>
      ) : null}
    </div>
  )
}

function MessageRow({
  message,
  isSaved,
  isLast,
  disabled,
  onLightbox,
  onSave,
  onRetry,
  onCopy
}: {
  message: ChatMessage
  isSaved: boolean
  isLast: boolean
  disabled: boolean
  onLightbox: (url: string) => void
  onSave: () => void
  onRetry: () => void
  onCopy: () => void
}) {
  const t = useT()
  const settings = useSettings()

  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-user-body">
          {message.attachments?.length ? (
            <div className="msg-attachments">
              {message.attachments.map((attachment) => (
                <button
                  type="button"
                  key={attachment.id}
                  className="msg-attachment"
                  onClick={() => onLightbox(attachment.url)}
                >
                  <img src={attachment.url} alt={attachment.name} />
                </button>
              ))}
            </div>
          ) : null}
          {message.content ? <p>{message.content}</p> : null}
          <span className="msg-user-time">{formatClock(message.createdAt, settings.language)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="msg msg-assistant">
      <div className="msg-avatar">
        <Logo size={26} />
      </div>
      <div className="msg-main">
        <div className="msg-meta">
          <span className="msg-author">
            {message.guard ? t('assistant.guardAuthor') : t('assistant.answerBy')}
          </span>
          {message.providerLabel ? <span className="msg-provider">{message.providerLabel}</span> : null}
          <span className="msg-time">{formatClock(message.createdAt, settings.language)}</span>
        </div>
        {message.content ? (
          <Markdown content={message.content} />
        ) : message.error ? (
          <div className="msg-error-inline">
            <CircleAlert size={14} />
            {t(`errors.${message.error.code}`)}
          </div>
        ) : null}
        {message.error && message.content ? (
          <div className="msg-error-inline">
            <CircleAlert size={14} />
            {t(`errors.${message.error.code}`)}
            {message.error.detail ? <span className="msg-error-detail">— {message.error.detail}</span> : null}
          </div>
        ) : null}
        {message.fallbackFrom ? (
          <div className="msg-fallback">
            {t('assistant.fallbackFrom', { provider: message.fallbackFrom })}
          </div>
        ) : null}
        {message.guard ? <div className="msg-guard">{t('assistant.guardNote')}</div> : null}
        {message.agentOffer ? (
          <AgentCard
            messageId={message.id}
            offer={message.agentOffer}
            providerLabel={message.providerLabel}
            createdAt={message.createdAt}
            latest={isLast}
          />
        ) : null}
        <div className="msg-actions">
          <button type="button" onClick={onCopy} title={t('common.copy')}>
            <Copy size={13} />
            <span>{t('common.copy')}</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaved}
            title={t('assistant.saveAnswer')}
          >
            {isSaved ? <Check size={13} /> : <BookmarkPlus size={13} />}
            <span>{isSaved ? t('assistant.savedAnswer') : t('assistant.saveAnswer')}</span>
          </button>
          {isLast && !message.guard ? (
            <button type="button" onClick={onRetry} disabled={disabled} title={t('common.retry')}>
              <RotateCcw size={13} />
              <span>{t('common.retry')}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StreamingRow({ text, providerLabel }: { text: string; providerLabel: string }) {
  const t = useT()
  return (
    <div className="msg msg-assistant is-streaming">
      <div className="msg-avatar">
        <Logo size={26} />
      </div>
      <div className="msg-main">
        <div className="msg-meta">
          <span className="msg-author">{t('assistant.answerBy')}</span>
          <span className="msg-provider">{providerLabel}</span>
          <span className="msg-live">
            <span className="live-dot" />
            {text ? t('assistant.generating') : <ThinkingText />}
          </span>
        </div>
        {text ? (
          <>
            <Markdown content={text} />
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
  )
}

function ErrorBanner({
  error,
  onRetry,
  onConfigure
}: {
  error: ChatError
  onRetry: () => void
  onConfigure: () => void
}) {
  const t = useT()
  const needsSetup = error.code.startsWith('no_') || error.code === 'auth'
  return (
    <div className="error-banner">
      <div className="error-banner-icon">
        <CircleAlert size={18} />
      </div>
      <div className="error-banner-body">
        <strong>{t('assistant.error.title')}</strong>
        <p>{t(`errors.${error.code}`)}</p>
        {error.providerLabel ? (
          <span className="error-banner-provider">{error.providerLabel}</span>
        ) : null}
        {error.detail ? <code>{error.detail}</code> : null}
      </div>
      <div className="error-banner-actions">
        {needsSetup ? (
          <Button size="sm" variant="secondary" onClick={onConfigure}>
            {t('nav.ai')}
          </Button>
        ) : null}
        <Button size="sm" variant="primary" icon={<RotateCcw size={12} />} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    </div>
  )
}
