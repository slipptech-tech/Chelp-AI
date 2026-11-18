import {
  ArrowDownToLine,
  Bookmark,
  Cpu,
  History,
  Layers,
  LayoutDashboard,
  MessagesSquare,
  MonitorUp,
  Settings2,
  X,
  type LucideIcon
} from 'lucide-react'
import { isProviderReady } from '@shared/providers'
import { useApp, type Page } from '../store'
import { useT } from '../hooks'

interface NavItem {
  page: Page
  label: string
  icon: LucideIcon
}

export function Sidebar() {
  const t = useT()
  const page = useApp((state) => state.page)
  const navigate = useApp((state) => state.navigate)
  const settings = useApp((state) => state.settings)
  const version = useApp((state) => state.version)
  const toast = useApp((state) => state.toast)
  const update = useApp((state) => state.update)
  const downloadUpdate = useApp((state) => state.downloadUpdate)
  const installUpdate = useApp((state) => state.installUpdate)
  const dismissUpdate = useApp((state) => state.dismissUpdate)

  const showUpdate = Boolean(update.info?.available) && !update.dismissed
  const updatePercent = update.progress?.percent ?? 0
  const updateMessage = update.error
    ? t('sidebar.updateFailed')
    : update.installing
      ? t('sidebar.updateInstalling')
      : update.ready
        ? t('sidebar.updateReady')
        : update.downloading
          ? t('sidebar.updateDownloading', { percent: updatePercent })
          : t('sidebar.updateText', { version: update.info?.version ?? '' })

  const provider =
    settings.providers.find((item) => item.id === settings.activeProviderId) ??
    settings.providers[0]
  const ready = settings.providers.some(isProviderReady)

  const workspace: NavItem[] = [
    { page: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { page: 'assistant', label: t('nav.assistant'), icon: MessagesSquare },
    { page: 'screen', label: t('nav.screen'), icon: MonitorUp }
  ]
  const library: NavItem[] = [
    { page: 'history', label: t('nav.history'), icon: History },
    { page: 'saved', label: t('nav.saved'), icon: Bookmark }
  ]
  const system: NavItem[] = [
    { page: 'settings', label: t('nav.settings'), icon: Settings2 },
    { page: 'ai', label: t('nav.ai'), icon: Cpu }
  ]

  const renderGroup = (label: string, items: NavItem[]) => (
    <div className="nav-group" key={label}>
      <span className="nav-label">{label}</span>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.page}
            type="button"
            className={`nav-item ${page === item.page ? 'is-active' : ''}`}
            onClick={() => navigate(item.page)}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )

  const toggleFloat = async (): Promise<void> => {
    const visible = await window.chelp.float.toggle()
    toast(t(visible ? 'toast.floatOpened' : 'toast.floatClosed'), 'info')
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {renderGroup(t('nav.workspace'), workspace)}
        {renderGroup(t('nav.library'), library)}
        {renderGroup(t('nav.system'), system)}
      </nav>

      <div className="sidebar-footer">
        <button type="button" className="float-launch" onClick={toggleFloat}>
          <span className="float-launch-icon">
            <Layers size={16} />
          </span>
          <span className="float-launch-text">
            <strong>{t('nav.float')}</strong>
            <span>{t('nav.floatHint')}</span>
          </span>
          <span className="float-launch-orb" />
        </button>

        <button type="button" className="provider-card" onClick={() => navigate('ai')}>
          <span className={`status-dot ${ready ? 'is-ready' : 'is-missing'}`} />
          <span className="provider-card-text">
            <strong>{provider?.name ?? t('nav.apiMissing')}</strong>
            <span>{provider?.model ?? '—'}</span>
          </span>
          <span className="provider-card-state">
            {ready ? t('nav.apiReady') : t('nav.apiMissing')}
          </span>
        </button>

        {showUpdate ? (
          <div className="update-card">
            <div className="update-card-head">
              <span className="update-card-icon">
                <ArrowDownToLine size={12} />
              </span>
              <strong>{t('sidebar.updateTitle')}</strong>
              <button
                type="button"
                className="update-card-close"
                onClick={dismissUpdate}
                aria-label={t('common.later')}
                title={t('common.later')}
              >
                <X size={11} />
              </button>
            </div>
            <span className={`update-card-text ${update.error ? 'is-error' : ''}`}>{updateMessage}</span>
            {update.downloading || update.installing ? (
              <div className="update-progress">
                <span style={{ width: `${update.installing ? 100 : updatePercent}%` }} />
              </div>
            ) : (
              <button
                type="button"
                className="update-card-btn"
                onClick={() => void (update.ready ? installUpdate() : downloadUpdate())}
              >
                {update.ready ? t('sidebar.updateInstall') : t('sidebar.updateDownload')}
              </button>
            )}
          </div>
        ) : null}

        <div className="sidebar-meta">
          <span>Chelp AI</span>
          <span>v{version || '1.0.0'}</span>
        </div>
      </div>
    </aside>
  )
}
