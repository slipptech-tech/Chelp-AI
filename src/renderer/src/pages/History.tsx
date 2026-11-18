import { useMemo, useState } from 'react'
import {
  Download,
  History,
  MessageSquare,
  MonitorUp,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { ConversationMeta } from '@shared/types'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { relativeTime } from '../lib/format'
import { Button, ConfirmDialog, EmptyState, IconButton, Modal, PageHeader, Segmented } from '../components/ui'
import { SelectMenu } from '../components/SelectMenu'

type Filter = 'all' | 'screen' | 'chat'
type Sort = 'newest' | 'oldest' | 'messages'

export function HistoryPage() {
  const t = useT()
  const settings = useSettings()
  const conversations = useApp((state) => state.conversations)
  const openConversation = useApp((state) => state.openConversation)
  const newChat = useApp((state) => state.newChat)
  const renameConversation = useApp((state) => state.renameConversation)
  const deleteConversation = useApp((state) => state.deleteConversation)
  const toast = useApp((state) => state.toast)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [renameTarget, setRenameTarget] = useState<ConversationMeta | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ConversationMeta | null>(null)

  const items = useMemo(() => {
    const search = query.trim().toLowerCase()
    const filtered = conversations.filter((item) => {
      if (filter !== 'all' && item.mode !== filter) return false
      if (!search) return true
      return (
        item.title.toLowerCase().includes(search) || item.preview.toLowerCase().includes(search)
      )
    })
    return filtered.sort((a, b) => {
      if (sort === 'messages') return b.messageCount - a.messageCount
      if (sort === 'oldest') return a.updatedAt - b.updatedAt
      return b.updatedAt - a.updatedAt
    })
  }, [conversations, query, filter, sort])

  const exportItem = async (item: ConversationMeta): Promise<void> => {
    const result = await window.chelp.conversations.export(item.id)
    if (result.ok) toast(t('toast.exported'), 'success')
  }

  const confirmRename = async (): Promise<void> => {
    if (!renameTarget) return
    const value = renameValue.trim()
    if (!value) return
    await renameConversation(renameTarget.id, value)
    setRenameTarget(null)
    toast(t('history.renamed'), 'success')
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    await deleteConversation(deleteTarget.id)
    setDeleteTarget(null)
    toast(t('history.deleted'), 'success')
  }

  const hasAny = conversations.length > 0

  return (
    <div className="page page-scroll">
      <PageHeader
        eyebrow={t('nav.library')}
        title={t('history.title')}
        subtitle={t('history.subtitle')}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => void newChat('chat')}>
            {t('common.newChat')}
          </Button>
        }
      />

      <div className="history-toolbar">
        <div className="search-field">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('history.search')}
            aria-label={t('history.search')}
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}>
              <X size={12} />
            </button>
          ) : null}
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('history.filter.all') },
            { value: 'screen', label: t('history.filter.analysis') },
            { value: 'chat', label: t('history.filter.chat') }
          ]}
        />
        <SelectMenu
          value={sort}
          ariaLabel={t('history.sort')}
          width={196}
          options={[
            { value: 'newest', label: t('history.sort.newest') },
            { value: 'oldest', label: t('history.sort.oldest') },
            { value: 'messages', label: t('history.sort.messages') }
          ]}
          onChange={(value) => setSort(value as Sort)}
        />
      </div>

      {!hasAny ? (
        <EmptyState
          icon={<History size={26} />}
          title={t('history.empty.title')}
          text={t('history.empty.text')}
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<MonitorUp size={14} />}
              onClick={() => void newChat('chat')}
            >
              {t('common.newChat')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Search size={26} />}
          title={t('history.emptyFiltered.title')}
          text={t('history.emptyFiltered.text')}
        />
      ) : (
        <div className="history-list">
          {items.map((item) => {
            const Icon = item.mode === 'screen' ? MonitorUp : MessageSquare
            return (
              <article className="history-row" key={item.id}>
                <button
                  type="button"
                  className={`history-icon ${item.mode === 'screen' ? 'is-screen' : ''}`}
                  onClick={() => void openConversation(item.id)}
                  aria-label={item.title}
                >
                  <Icon size={16} />
                </button>
                <button
                  type="button"
                  className="history-main"
                  onClick={() => void openConversation(item.id)}
                >
                  <span className="history-title-line">
                    <strong>{item.title}</strong>
                    {item.mode === 'screen' ? (
                      <span className="mode-chip is-screen">{t('assistant.analysisMode')}</span>
                    ) : null}
                  </span>
                  <span className="history-preview">
                    {item.preview || t('assistant.emptyConversation')}
                  </span>
                </button>
                <div className="history-meta">
                  <span>{relativeTime(item.updatedAt, settings.language)}</span>
                  <span>{t('history.messages', { n: item.messageCount })}</span>
                </div>
                <div className="history-actions">
                  <IconButton label={t('common.export')} onClick={() => void exportItem(item)}>
                    <Download size={14} />
                  </IconButton>
                  <IconButton
                    label={t('common.rename')}
                    onClick={() => {
                      setRenameTarget(item)
                      setRenameValue(item.title)
                    }}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label={t('common.delete')} onClick={() => setDeleteTarget(item)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {renameTarget ? (
        <Modal
          title={t('assistant.renameTitle')}
          onClose={() => setRenameTarget(null)}
          footer={
            <>
              <Button onClick={() => setRenameTarget(null)}>{t('common.cancel')}</Button>
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

      {deleteTarget ? (
        <ConfirmDialog
          title={t('history.deleteTitle')}
          text={t('history.deleteText')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  )
}
