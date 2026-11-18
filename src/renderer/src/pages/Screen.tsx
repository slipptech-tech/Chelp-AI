import { useEffect, useState } from 'react'
import {
  AppWindow,
  Eye,
  MonitorUp,
  RefreshCw,
  Scan,
  Shield,
  ShieldAlert,
  Sparkles
} from 'lucide-react'
import type { CaptureResult, DisplayInfo, WindowInfo } from '@shared/types'
import { visionProviderFor } from '@shared/providers'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { formatKey } from '../lib/format'
import { Redactor } from '../components/Redactor'
import { Button, PageHeader, Segmented, Spinner } from '../components/ui'

interface SelectedSource {
  title: string
  subtitle: string
  image: CaptureResult
}

export function ScreenPage() {
  const t = useT()
  const settings = useSettings()
  const navigate = useApp((state) => state.navigate)
  const analyzeCapture = useApp((state) => state.analyzeCapture)
  const toast = useApp((state) => state.toast)

  const [tab, setTab] = useState<'displays' | 'windows'>('displays')
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [windows, setWindows] = useState<WindowInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [selected, setSelected] = useState<SelectedSource | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  const [redact, setRedact] = useState(false)
  const [question, setQuestion] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const activeProvider =
    settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  const visionProvider = visionProviderFor(
    settings.providers,
    settings.activeProviderId,
    settings.autoSwitchProvider
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      window.chelp.capture.screens(settings.captureQuality),
      window.chelp.capture.windows()
    ])
      .then(([screenList, windowList]) => {
        if (cancelled) return
        setDisplays(screenList)
        setWindows(windowList)
      })
      .catch(() => {
        if (!cancelled) toast(t('toast.captureFailed'), 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshTick, settings.captureQuality, toast, t])

  const refresh = (): void => setRefreshTick((value) => value + 1)

  const selectDisplay = (display: DisplayInfo, index: number): void => {
    if (!display.thumbnail) {
      toast(t('screen.captureFailed'), 'error')
      return
    }
    setSelected({
      title: t('screen.preview.display', { n: index + 1 }),
      subtitle: t('screen.dimensions', {
        w: Math.round(display.width * display.scaleFactor),
        h: Math.round(display.height * display.scaleFactor)
      }),
      image: {
        dataUrl: display.thumbnail,
        width: Math.round(display.width * display.scaleFactor),
        height: Math.round(display.height * display.scaleFactor)
      }
    })
    setEdited(null)
    setRedact(false)
  }

  const selectWindow = async (windowInfo: WindowInfo): Promise<void> => {
    setCapturing(true)
    try {
      const shot = await window.chelp.capture.captureWindow(windowInfo.id)
      if (!shot) {
        toast(t('screen.captureFailed'), 'error')
        return
      }
      setSelected({
        title: windowInfo.name,
        subtitle: t('screen.dimensions', { w: shot.width, h: shot.height }),
        image: shot
      })
      setEdited(null)
      setRedact(false)
    } finally {
      setCapturing(false)
    }
  }

  const selectRegion = async (display: DisplayInfo): Promise<void> => {
    setCapturing(true)
    try {
      const shot = await window.chelp.capture.selectRegion(display.id)
      if (!shot) {
        toast(t('screen.regionFailed'), 'info')
        return
      }
      setSelected({
        title: t('screen.region'),
        subtitle: t('screen.dimensions', { w: shot.width, h: shot.height }),
        image: shot
      })
      setEdited(null)
      setRedact(false)
    } finally {
      setCapturing(false)
    }
  }

  const providerLabel = visionProvider
    ? `${visionProvider.name} · ${visionProvider.model}`
    : activeProvider
      ? `${activeProvider.name} · ${activeProvider.model}`
      : 'AI'

  const runAnalyze = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    try {
      await analyzeCapture({
        dataUrl: edited ?? selected.image.dataUrl,
        question,
        defaultQuestion: t('screen.defaultQuestion')
      })
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  const requestAnalyze = (): void => {
    if (!selected) return
    if (!visionProvider) {
      navigate('ai')
      return
    }
    if (settings.confirmBeforeSend) setConfirmOpen(true)
    else void runAnalyze()
  }

  return (
    <div className="page page-scroll">
      <PageHeader
        eyebrow={t('screen.eyebrow')}
        title={t('screen.title')}
        subtitle={t('screen.subtitle')}
        actions={
          <Button
            size="sm"
            icon={<RefreshCw size={13} className={loading ? 'spin' : ''} />}
            onClick={refresh}
            disabled={loading}
          >
            {t('screen.refresh')}
          </Button>
        }
      />

      <div className="screen-layout">
        <section className="screen-sources">
          <div className="sources-head">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                {
                  value: 'displays',
                  label: `${t('screen.tab.displays')}${displays.length ? ` · ${displays.length}` : ''}`
                },
                {
                  value: 'windows',
                  label: `${t('screen.tab.windows')}${windows.length ? ` · ${windows.length}` : ''}`
                }
              ]}
            />
            <span className="sources-hint">
              {tab === 'displays' ? t('screen.displaysHint') : t('screen.windowsHint')}
            </span>
          </div>

          {loading ? (
            <div className="source-grid">
              {[0, 1, 2, 3].map((index) => (
                <div className="source-card is-skeleton" key={index}>
                  <div className="source-thumb shimmer" />
                  <div className="source-meta">
                    <span className="skeleton-line" />
                    <span className="skeleton-line is-short" />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'displays' ? (
            <div className="source-grid">
              {displays.map((display, index) => (
                <div
                  key={display.id}
                  className={`source-card ${
                    selected?.title === t('screen.preview.display', { n: index + 1 })
                      ? 'is-selected'
                      : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectDisplay(display, index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') selectDisplay(display, index)
                  }}
                >
                  <div className="source-thumb">
                    {display.thumbnail ? (
                      <img src={display.thumbnail} alt={display.label} />
                    ) : (
                      <div className="source-no-image">
                        <MonitorUp size={22} />
                      </div>
                    )}
                    {display.primary ? (
                      <span className="source-badge">{t('screen.primary')}</span>
                    ) : null}
                  </div>
                  <div className="source-meta">
                    <div className="source-meta-text">
                      <strong>{t('screen.preview.display', { n: index + 1 })}</strong>
                      <span>
                        {display.width} × {display.height} · {display.scaleFactor}x
                      </span>
                    </div>
                    <button
                      type="button"
                      className="source-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        void selectRegion(display)
                      }}
                      disabled={capturing}
                    >
                      <Scan size={13} />
                      {t('screen.region')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : windows.length === 0 ? (
            <div className="sources-empty">
              <AppWindow size={26} />
              <p>{t('screen.noWindows')}</p>
            </div>
          ) : (
            <div className="source-grid">
              {windows.map((windowInfo) => (
                <div
                  key={windowInfo.id}
                  className="source-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => void selectWindow(windowInfo)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void selectWindow(windowInfo)
                  }}
                >
                  <div className="source-thumb is-window">
                    <img src={windowInfo.thumbnail} alt={windowInfo.name} />
                  </div>
                  <div className="source-meta">
                    <div className="source-meta-text">
                      <strong>
                        {windowInfo.icon ? <img src={windowInfo.icon} alt="" /> : null}
                        {windowInfo.name}
                      </strong>
                      <span>{windowInfo.appName}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="screen-preview">
          <div className="preview-card">
            <div className="preview-head">
              <div>
                <span className="preview-eyebrow">{t('screen.preview.source')}</span>
                <strong>{selected?.title ?? t('screen.preview.emptyTitle')}</strong>
                {selected ? <span className="preview-sub">{selected.subtitle}</span> : null}
              </div>
              {selected ? (
                <button
                  type="button"
                  className={`redact-toggle ${redact ? 'is-on' : ''}`}
                  onClick={() => setRedact((value) => !value)}
                  title={t('screen.redactHint')}
                >
                  {redact ? <Eye size={14} /> : <Shield size={14} />}
                  {t('screen.redact')}
                </button>
              ) : null}
            </div>

            {selected ? (
              <>
                <Redactor src={selected.image.dataUrl} enabled={redact} onChange={setEdited} />
                {!visionProvider ? (
                  <div className="vision-warning">
                    <div className="vision-warning-icon">
                      <ShieldAlert size={17} />
                    </div>
                    <div>
                      <strong>{t('screen.visionTitle')}</strong>
                      <p>{t('screen.visionText')}</p>
                      <Button size="sm" variant="secondary" onClick={() => navigate('ai')}>
                        {t('screen.visionCta')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="vision-note">
                    <Sparkles size={13} />
                    {t('screen.usingProvider', { provider: providerLabel })}
                  </p>
                )}

                <label className="field">
                  <span className="field-label">{t('screen.question')}</span>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={question}
                    placeholder={t('screen.questionPlaceholder')}
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                  <span className="field-hint">{t('screen.questionHint')}</span>
                </label>

                <div className="privacy-note">
                  <Shield size={13} />
                  <span>{t('screen.privacy')}</span>
                </div>

                <Button
                  variant="primary"
                  className="analyze-btn"
                  onClick={requestAnalyze}
                  disabled={busy || !visionProvider}
                  icon={busy ? <Spinner /> : <Scan size={15} />}
                >
                  {busy ? t('screen.analyzing') : t('screen.analyze')}
                </Button>
              </>
            ) : (
              <div className="preview-empty">
                <div className="preview-empty-icon">
                  <Scan size={24} />
                </div>
                <strong>{t('screen.preview.emptyTitle')}</strong>
                <p>{t('screen.preview.emptyText')}</p>
                <div className="preview-hint">
                  <kbd className="kbd">{formatKey(settings.hotkeys.capture)}</kbd>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {confirmOpen && selected ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmOpen(false)
          }}
        >
          <div className="modal" style={{ width: 480 }} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <h2>{t('screen.confirmTitle')}</h2>
                <p>{t('screen.confirmText', { provider: providerLabel })}</p>
              </div>
            </div>
            <div className="modal-body">
              <div className="confirm-preview">
                <img src={edited ?? selected.image.dataUrl} alt="" />
                <p>{question.trim() || t('screen.defaultQuestion')}</p>
              </div>
            </div>
            <div className="modal-footer">
              <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                onClick={() => void runAnalyze()}
                disabled={busy}
                icon={busy ? <Spinner /> : <Scan size={14} />}
              >
                {t('screen.analyze')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
