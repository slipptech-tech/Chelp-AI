import {
  ArrowRight,
  Bookmark,
  ChevronRight,
  CircleAlert,
  Cpu,
  Layers,
  MessagesSquare,
  MonitorUp,
  Scan,
  Sparkles
} from 'lucide-react'
import { isProviderReady } from '@shared/providers'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { formatKey, greetingKey, relativeTime } from '../lib/format'
import { Kbd } from '../components/ui'

export function DashboardPage() {
  const t = useT()
  const settings = useSettings()
  const version = useApp((state) => state.version)
  const conversations = useApp((state) => state.conversations)
  const saved = useApp((state) => state.saved)
  const navigate = useApp((state) => state.navigate)
  const newChat = useApp((state) => state.newChat)
  const openConversation = useApp((state) => state.openConversation)
  const toast = useApp((state) => state.toast)

  const readyProviders = settings.providers.filter(isProviderReady)
  const hasKey = readyProviders.length > 0
  const messageCount = conversations.reduce((sum, item) => sum + item.messageCount, 0)
  const recent = conversations.slice(0, 5)

  const openFloat = async (): Promise<void> => {
    const visible = await window.chelp.float.toggle()
    toast(t(visible ? 'toast.floatOpened' : 'toast.floatClosed'), 'info')
  }

  return (
    <div className="page page-scroll dashboard">
      <header className="dash-head">
        <div>
          <span className="eyebrow">{t('dashboard.eyebrow')}</span>
          <h1>{t(greetingKey())}</h1>
          <p>{t('dashboard.subtitle')}</p>
        </div>
        <span className="dash-version">v{version || '1.0.0'}</span>
      </header>

      {!hasKey ? (
        <button type="button" className="setup-banner" onClick={() => navigate('ai')}>
          <span className="setup-banner-icon">
            <Cpu size={17} />
          </span>
          <span className="setup-banner-body">
            <strong>{t('dashboard.setup.title')}</strong>
            <span>{t('dashboard.setup.text')}</span>
          </span>
          <span className="setup-banner-cta">
            {t('dashboard.setup.cta')}
            <ArrowRight size={14} />
          </span>
        </button>
      ) : null}

      <section className="dash-hero">
        <div className="dash-hero-copy">
          <span className="hero-badge">
            <Sparkles size={13} />
            {t('dashboard.hero.badge')}
          </span>
          <h2>{t('dashboard.hero.title')}</h2>
          <p>{t('dashboard.hero.text')}</p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary btn-md" onClick={() => navigate('screen')}>
              <Scan size={15} />
              {t('dashboard.hero.primary')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => void newChat('chat')}
            >
              {t('dashboard.hero.secondary')}
            </button>
          </div>
          <span className="hero-hint">
            {t('dashboard.hero.hintPrefix')}
            <Kbd>{formatKey(settings.hotkeys.capture)}</Kbd>
            {t('dashboard.hero.hintSuffix')}
          </span>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-glow" />
          <div className="hero-window">
            <div className="hero-window-bar">
              <span className="hero-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="hero-window-title">system — context</span>
            </div>
            <div className="hero-window-body">
              <div className="hero-error">
                <span className="hero-error-icon">
                  <CircleAlert size={17} />
                </span>
                <div className="hero-error-text">
                  <strong>{t('dashboard.hero.mockErrorTitle')}</strong>
                  <span>{t('dashboard.hero.mockErrorText')}</span>
                  <code>0x80070005</code>
                </div>
              </div>
              <div className="hero-lines">
                <span style={{ width: '86%' }} />
                <span style={{ width: '64%' }} />
                <span style={{ width: '74%' }} />
              </div>
              <div className="hero-chips">
                <span className="hero-chip">
                  <Sparkles size={11} />
                  {t('dashboard.hero.mockCause')}
                </span>
                <span className="hero-chip is-ghost">{t('dashboard.hero.mockSolution')}</span>
              </div>
            </div>
            <div className="scan-line" />
            <span className="hero-corner tl" />
            <span className="hero-corner tr" />
            <span className="hero-corner bl" />
            <span className="hero-corner br" />
          </div>
          <span className="hero-tag hero-tag-one">
            <Scan size={12} />
            {t('dashboard.hero.mockReading')}
          </span>
          <span className="hero-tag hero-tag-two">
            <Sparkles size={12} />
            {t('dashboard.hero.mockCauseFound')}
          </span>
        </div>
      </section>

      <div className="stats-grid">
        <button type="button" className="stat-card" onClick={() => navigate('history')}>
          <span className="stat-icon">
            <MessagesSquare size={16} />
          </span>
          <span className="stat-value">{conversations.length}</span>
          <span className="stat-label">{t('dashboard.stats.conversations')}</span>
        </button>
        <div className="stat-card">
          <span className="stat-icon">
            <Scan size={16} />
          </span>
          <span className="stat-value">{messageCount}</span>
          <span className="stat-label">{t('dashboard.stats.messages')}</span>
        </div>
        <button type="button" className="stat-card" onClick={() => navigate('saved')}>
          <span className="stat-icon">
            <Bookmark size={16} />
          </span>
          <span className="stat-value">{saved.length}</span>
          <span className="stat-label">{t('dashboard.stats.saved')}</span>
        </button>
        <button type="button" className="stat-card" onClick={() => navigate('ai')}>
          <span className="stat-icon">
            <Cpu size={16} />
          </span>
          <span className="stat-value">{readyProviders.length}</span>
          <span className="stat-label">{t('dashboard.stats.providers')}</span>
          <span className="stat-note">
            {readyProviders.length
              ? t('dashboard.stats.providersReady', { n: readyProviders.length })
              : t('dashboard.stats.providersNone')}
          </span>
        </button>
      </div>

      <div className="dash-columns">
        <section className="panel recent-panel">
          <div className="panel-head">
            <h3>{t('dashboard.recent.title')}</h3>
            <button type="button" className="link-btn" onClick={() => navigate('history')}>
              {t('dashboard.recent.viewAll')}
              <ChevronRight size={13} />
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="recent-empty">
              <MessagesSquare size={22} />
              <p>{t('dashboard.recent.empty')}</p>
            </div>
          ) : (
            <div className="recent-list">
              {recent.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="recent-item"
                  onClick={() => void openConversation(item.id)}
                >
                  <span className={`recent-icon ${item.mode === 'screen' ? 'is-screen' : ''}`}>
                    {item.mode === 'screen' ? <MonitorUp size={14} /> : <MessagesSquare size={14} />}
                  </span>
                  <span className="recent-body">
                    <span className="recent-title">{item.title}</span>
                    <span className="recent-preview">{item.preview || t('assistant.emptyConversation')}</span>
                  </span>
                  <span className="recent-time">{relativeTime(item.updatedAt, settings.language)}</span>
                  <ChevronRight size={14} className="recent-chevron" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel quick-panel">
          <div className="panel-head">
            <h3>{t('dashboard.quick.title')}</h3>
          </div>
          <div className="quick-grid">
            <button type="button" className="quick-action" onClick={() => navigate('screen')}>
              <span className="quick-icon">
                <Scan size={16} />
              </span>
              <span className="quick-text">
                <strong>{t('dashboard.quick.region')}</strong>
                <span>{t('dashboard.quick.regionHint')}</span>
              </span>
            </button>
            <button
              type="button"
              className="quick-action"
              onClick={() => navigate('screen')}
            >
              <span className="quick-icon">
                <MonitorUp size={16} />
              </span>
              <span className="quick-text">
                <strong>{t('dashboard.quick.window')}</strong>
                <span>{t('dashboard.quick.windowHint')}</span>
              </span>
            </button>
            <button type="button" className="quick-action" onClick={() => void openFloat()}>
              <span className="quick-icon">
                <Layers size={16} />
              </span>
              <span className="quick-text">
                <strong>{t('dashboard.quick.float')}</strong>
                <span>{t('dashboard.quick.floatHint')}</span>
              </span>
            </button>
            <button type="button" className="quick-action" onClick={() => navigate('ai')}>
              <span className="quick-icon">
                <Cpu size={16} />
              </span>
              <span className="quick-text">
                <strong>{t('dashboard.quick.ai')}</strong>
                <span>{t('dashboard.quick.aiHint')}</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
