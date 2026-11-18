import { useMemo, useState } from 'react'
import { Bookmark, Copy, MessageSquare, Search, Trash2, X } from 'lucide-react'
import type { SavedAnswer } from '@shared/types'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { relativeTime, stripMarkdown } from '../lib/format'
import { Button, ConfirmDialog, EmptyState, IconButton, PageHeader } from '../components/ui'

export function SavedPage() {
  const t = useT()
  const settings = useSettings()
  const saved = useApp((state) => state.saved)
  const openConversation = useApp((state) => state.openConversation)
  const removeSaved = useApp((state) => state.removeSaved)
  const toast = useApp((state) => state.toast)
  const navigate = useApp((state) => state.navigate)

  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<SavedAnswer | null>(null)

  const items = useMemo(() => {
    const search = query.trim().toLowerCase()
    if (!search) return saved
    return saved.filter(
      (item) =>
        item.question.toLowerCase().includes(search) || item.answer.toLowerCase().includes(search)
    )
  }, [saved, query])

  const copy = (item: SavedAnswer): void => {
    window.chelp.clipboard.write(item.answer)
    toast(t('toast.copied'), 'success')
  }

  const confirmRemove = async (): Promise<void> => {
    if (!target) return
    await removeSaved(target.id)
    setTarget(null)
    toast(t('saved.removed'), 'success')
  }

  return (
    <div className="page page-scroll">
      <PageHeader eyebrow={t('nav.library')} title={t('saved.title')} subtitle={t('saved.subtitle')} />

      <div className="saved-toolbar">
        <div className="search-field">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('saved.search')}
            aria-label={t('saved.search')}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}>
              <X size={12} />
            </button>
          ) : null}
        </div>
        <span className="toolbar-count">{items.length}</span>
      </div>

      {saved.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={26} />}
          title={t('saved.empty.title')}
          text={t('saved.empty.text')}
          action={
            <Button variant="primary" size="sm" icon={<MessageSquare size={14} />} onClick={() => navigate('assistant')}>
              {t('assistant.title')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState icon={<Search size={26} />} title={t('saved.emptyFiltered')} />
      ) : (
        <div className="saved-grid">
          {items.map((item) => (
            <article className="saved-card" key={item.id}>
              <div className="saved-card-head">
                <span className="saved-mark">
                  <Bookmark size={13} />
                </span>
                <span className="saved-date">{relativeTime(item.createdAt, settings.language)}</span>
                <IconButton label={t('common.delete')} onClick={() => setTarget(item)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
              <h3>{item.question}</h3>
              <p className="saved-answer">{stripMarkdown(item.answer).slice(0, 320)}</p>
              <div className="saved-card-actions">
                <Button size="sm" icon={<Copy size={12} />} onClick={() => copy(item)}>
                  {t('common.copy')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<MessageSquare size={12} />}
                  onClick={() => void openConversation(item.conversationId)}
                >
                  {t('saved.open')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {target ? (
        <ConfirmDialog
          title={t('saved.removeTitle')}
          text={t('saved.removeText')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onConfirm={() => void confirmRemove()}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  )
}
