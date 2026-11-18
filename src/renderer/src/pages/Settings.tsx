import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  ArrowDownToLine,
  CheckCircle2,
  CircleAlert,
  FolderOpen,
  HardDrive,
  Images,
  Info,
  Keyboard,
  Lock,
  Palette,
  RefreshCw,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { Accent, Hotkeys } from '@shared/types'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { formatBytes, formatKey } from '../lib/format'
import { Logo } from '../components/Logo'
import { Button, ConfirmDialog, PageHeader, Segmented, Switch } from '../components/ui'

const ACCENTS: Accent[] = ['violet', 'blue', 'emerald', 'amber', 'rose']
const DEFAULT_HOTKEYS: Hotkeys = { float: 'Ctrl+Shift+Space', capture: 'Ctrl+Shift+X' }

const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Return',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

function toAccelerator(event: ReactKeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  const key = KEY_ALIASES[event.key] ?? event.key
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey
  if (!hasModifier && !/^F\d{1,2}$/.test(key)) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')
  parts.push(key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}

function HotkeyInput({
  value,
  disabled,
  onChange
}: {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const t = useT()
  const [recording, setRecording] = useState(false)

  return (
    <button
      type="button"
      className={`hotkey-input ${recording ? 'is-recording' : ''}`}
      disabled={disabled}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        if (!recording) return
        event.preventDefault()
        event.stopPropagation()
        if (event.key === 'Escape') {
          setRecording(false)
          return
        }
        const accelerator = toAccelerator(event)
        if (!accelerator) return
        onChange(accelerator)
        setRecording(false)
      }}
    >
      {recording ? (
        <>
          <span className="record-dot" />
          {t('settings.recording')}
        </>
      ) : (
        <>
          {formatKey(value)
            .split(' + ')
            .map((part) => (
              <kbd className="kbd" key={part}>
                {part}
              </kbd>
            ))}
        </>
      )}
    </button>
  )
}

function SettingRow({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <strong>{title}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const t = useT()
  const settings = useSettings()
  const version = useApp((state) => state.version)
  const updateSettings = useApp((state) => state.updateSettings)
  const clearHistory = useApp((state) => state.clearHistory)
  const toast = useApp((state) => state.toast)
  const storage = useApp((state) => state.storage)
  const update = useApp((state) => state.update)
  const clearPhotos = useApp((state) => state.clearPhotos)
  const checkUpdates = useApp((state) => state.checkUpdates)
  const downloadUpdate = useApp((state) => state.downloadUpdate)
  const installUpdate = useApp((state) => state.installUpdate)
  const [clearOpen, setClearOpen] = useState(false)
  const [photosOpen, setPhotosOpen] = useState(false)

  const setHotkey = (key: keyof Hotkeys, accelerator: string): void => {
    const other = key === 'float' ? settings.hotkeys.capture : settings.hotkeys.float
    if (accelerator === other) {
      toast(t('settings.shortcutConflict'), 'error')
      return
    }
    void updateSettings({ hotkeys: { ...settings.hotkeys, [key]: accelerator } })
  }

  const confirmClear = async (): Promise<void> => {
    await clearHistory()
    setClearOpen(false)
    toast(t('settings.cleared'), 'success')
  }

  const confirmClearPhotos = async (): Promise<void> => {
    await clearPhotos()
    setPhotosOpen(false)
  }

  const photosHint = storage
    ? storage.photos > 0
      ? t('settings.photosCacheHint', {
          files: storage.photos,
          size: formatBytes(storage.photoBytes, settings.language)
        })
      : t('settings.photosCacheEmpty')
    : '—'

  const updateStatus = update.checking
    ? t('settings.checking')
    : update.installing
      ? t('settings.updateInstalling')
      : update.downloading
        ? t('settings.updateDownloading', { percent: update.progress?.percent ?? 0 })
        : update.ready
          ? t('settings.updateReady', { version: update.info?.version ?? '' })
          : update.info?.available
            ? t('settings.updateVersion', { version: update.info.version })
            : update.error
              ? t('settings.updateCheckFailed')
              : update.info
                ? t('settings.upToDate')
                : t('settings.updateNote')

  return (
    <div className="page page-scroll">
      <PageHeader
        eyebrow={t('nav.system')}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <div className="settings-grid">
        <div className="settings-col">
        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <Palette size={16} />
            </span>
            <h3>{t('settings.appearance')}</h3>
          </div>
          <SettingRow title={t('settings.language')}>
            <Segmented
              value={settings.language}
              onChange={(language) => void updateSettings({ language })}
              options={[
                { value: 'en', label: t('settings.lang.en') },
                { value: 'ru', label: t('settings.lang.ru') }
              ]}
            />
          </SettingRow>
          <div className="setting-row is-stacked">
            <div className="setting-text">
              <strong>{t('settings.accent')}</strong>
            </div>
            <div className="accent-row">
              {ACCENTS.map((accent) => (
                <button
                  type="button"
                  key={accent}
                  className={`accent-chip data-accent-${accent} ${
                    settings.accent === accent ? 'is-active' : ''
                  }`}
                  onClick={() => void updateSettings({ accent })}
                  title={t(`settings.accent.${accent}`)}
                >
                  <span className="accent-dot" />
                  <span>{t(`settings.accent.${accent}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <Shield size={16} />
            </span>
            <h3>{t('settings.capture')}</h3>
          </div>
          <SettingRow title={t('settings.quality')} hint={t('settings.qualityHint')}>
            <Segmented
              value={settings.captureQuality}
              onChange={(captureQuality) => void updateSettings({ captureQuality })}
              options={[
                { value: 'standard', label: t('settings.quality.standard') },
                { value: 'high', label: t('settings.quality.high') }
              ]}
            />
          </SettingRow>
          <SettingRow title={t('settings.confirm')} hint={t('settings.confirmHint')}>
            <Switch
              checked={settings.confirmBeforeSend}
              onChange={(confirmBeforeSend) => void updateSettings({ confirmBeforeSend })}
            />
          </SettingRow>
          <SettingRow title={t('settings.saveHistory')} hint={t('settings.saveHistoryHint')}>
            <Switch
              checked={settings.saveHistory}
              onChange={(saveHistory) => void updateSettings({ saveHistory })}
            />
          </SettingRow>
          <div className="privacy-note">
            <Shield size={13} />
            <span>{t('settings.privacyNote')}</span>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon is-danger">
              <Trash2 size={16} />
            </span>
            <h3>{t('settings.privacy')}</h3>
          </div>
          <SettingRow title={t('settings.clearHistory')} hint={t('settings.clearHistoryHint')}>
            <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => setClearOpen(true)}>
              {t('common.clear')}
            </Button>
          </SettingRow>
          <div className="privacy-note">
            <Shield size={13} />
            <span>{t('settings.privacyNote')}</span>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <HardDrive size={16} />
            </span>
            <h3>{t('settings.storage')}</h3>
          </div>
          <SettingRow title={t('settings.dataFolder')} hint={t('settings.dataFolderHint')}>
            <Button
              size="sm"
              icon={<FolderOpen size={12} />}
              onClick={() => window.chelp.storage.openDataFolder()}
            >
              {t('settings.openFolder')}
            </Button>
          </SettingRow>
          {storage ? (
            <div className="path-line" title={storage.dataPath}>
              <code>{storage.dataPath}</code>
            </div>
          ) : null}
          <SettingRow title={t('settings.photosCache')} hint={photosHint}>
            <div className="settings-button-row">
              <Button
                size="sm"
                icon={<Images size={12} />}
                onClick={() => window.chelp.storage.openPhotos()}
              >
                {t('settings.openFolder')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={12} />}
                disabled={!storage?.photos}
                onClick={() => setPhotosOpen(true)}
              >
                {t('settings.clearPhotos')}
              </Button>
            </div>
          </SettingRow>
          <SettingRow title={t('settings.photoCleanup')} hint={t('settings.photoCleanupHint')}>
            <Segmented
              value={settings.photoRetentionDays > 0 ? String(settings.photoRetentionDays) : 'never'}
              onChange={(value) =>
                void updateSettings({ photoRetentionDays: value === 'never' ? 0 : Number(value) })
              }
              options={[
                { value: 'never', label: t('settings.photoCleanup.never') },
                { value: '7', label: t('settings.photoCleanup.7') },
                { value: '30', label: t('settings.photoCleanup.30') },
                { value: '90', label: t('settings.photoCleanup.90') }
              ]}
            />
          </SettingRow>
        </section>

        <section className="settings-card about-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <Info size={16} />
            </span>
            <h3>{t('settings.about')}</h3>
          </div>
          <div className="about-body">
            <Logo size={46} />
            <div>
              <strong>{t('app.name')}</strong>
              <span>{t('settings.tagline')}</span>
            </div>
          </div>
          <div className="about-meta">
            <div>
              <span>{t('settings.version')}</span>
              <strong>{version || '1.0.0'}</strong>
            </div>
            <div>
              <span>Electron</span>
              <strong>{window.chelp.versions.electron}</strong>
            </div>
            <div>
              <span>{t('settings.language')}</span>
              <strong>{settings.language === 'ru' ? 'Русский' : 'English'}</strong>
            </div>
          </div>
        </section>
        </div>

        <div className="settings-col">
        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <Lock size={16} />
            </span>
            <h3>{t('settings.protection')}</h3>
          </div>
          <SettingRow title={t('settings.guard')} hint={t('settings.guardHint')}>
            <span className="guard-badge">
              <Lock size={12} />
              {t('settings.guardBadge')}
            </span>
          </SettingRow>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <Sparkles size={16} />
            </span>
            <h3>{t('settings.agentActions')}</h3>
          </div>
          <SettingRow title={t('settings.agentPermission')} hint={t('settings.agentActionsHint')}>
            <Segmented
              value={settings.agentPermission}
              onChange={(agentPermission) => void updateSettings({ agentPermission })}
              options={[
                { value: 'ask', label: t('settings.agentActions.ask') },
                { value: 'always', label: t('settings.agentActions.always') }
              ]}
            />
          </SettingRow>
          {settings.agentAllowedChats.length > 0 ? (
            <SettingRow
              title={t('settings.agentChats')}
              hint={t('settings.agentChatsHint', { n: settings.agentAllowedChats.length })}
            >
              <Button
                size="sm"
                icon={<RotateCcw size={12} />}
                onClick={() => void updateSettings({ agentAllowedChats: [] })}
              >
                {t('settings.agentChatsReset')}
              </Button>
            </SettingRow>
          ) : null}
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <SlidersHorizontal size={16} />
            </span>
            <h3>{t('settings.behavior')}</h3>
          </div>
          <SettingRow title={t('settings.startup')} hint={t('settings.startupHint')}>
            <Switch
              checked={settings.startAtLogin}
              onChange={(startAtLogin) => void updateSettings({ startAtLogin })}
            />
          </SettingRow>
          <SettingRow title={t('settings.startMinimized')} hint={t('settings.startMinimizedHint')}>
            <Switch
              checked={settings.startMinimized}
              onChange={(startMinimized) => void updateSettings({ startMinimized })}
            />
          </SettingRow>
          <SettingRow title={t('settings.closeToTray')} hint={t('settings.closeToTrayHint')}>
            <Switch
              checked={settings.closeToTray}
              onChange={(closeToTray) => void updateSettings({ closeToTray })}
            />
          </SettingRow>
          <SettingRow title={t('settings.notifications')} hint={t('settings.notificationsHint')}>
            <Switch
              checked={settings.notifyOnDone}
              onChange={(notifyOnDone) => void updateSettings({ notifyOnDone })}
            />
          </SettingRow>
          <SettingRow title={t('settings.streaming')} hint={t('settings.streamingHint')}>
            <Switch
              checked={settings.streaming}
              onChange={(streaming) => void updateSettings({ streaming })}
            />
          </SettingRow>
          <SettingRow
            title={t('settings.autoSwitch')}
            hint={t('settings.autoSwitchHint')}
          >
            <Switch
              checked={settings.autoSwitchProvider}
              onChange={(autoSwitchProvider) => void updateSettings({ autoSwitchProvider })}
            />
          </SettingRow>
          <SettingRow title={t('settings.enterToSend')} hint={t('settings.enterToSendHint')}>
            <Switch
              checked={settings.enterToSend}
              onChange={(enterToSend) => void updateSettings({ enterToSend })}
            />
          </SettingRow>
          <SettingRow title={t('settings.reduceMotion')} hint={t('settings.reduceMotionHint')}>
            <Switch
              checked={settings.reduceMotion}
              onChange={(reduceMotion) => void updateSettings({ reduceMotion })}
            />
          </SettingRow>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <ArrowDownToLine size={16} />
            </span>
            <h3>{t('settings.updates')}</h3>
          </div>
          <SettingRow title={t('settings.autoUpdate')} hint={t('settings.autoUpdateHint')}>
            <Switch
              checked={settings.checkUpdates}
              onChange={(checkUpdates) => void updateSettings({ checkUpdates })}
            />
          </SettingRow>
          <div className="update-status">
            <div className="update-status-main">
              {update.ready || (update.info && !update.info.available && !update.error) ? (
                <CheckCircle2 size={15} className="update-status-icon is-ok" />
              ) : update.info?.available || update.downloading || update.installing ? (
                <ArrowDownToLine size={15} className="update-status-icon is-new" />
              ) : update.error ? (
                <CircleAlert size={15} className="update-status-icon is-bad" />
              ) : (
                <RefreshCw size={15} className={`update-status-icon ${update.checking ? 'is-spin' : ''}`} />
              )}
              <div className="update-status-text">
                <strong>
                  {t('settings.currentVersion')} {version || '1.0.0'}
                </strong>
                <span>{updateStatus}</span>
              </div>
            </div>
            {update.downloading ? (
              <div className="update-progress is-inline">
                <span style={{ width: `${update.progress?.percent ?? 0}%` }} />
              </div>
            ) : update.info?.available ? (
              <Button
                variant="primary"
                size="sm"
                icon={update.ready ? <RefreshCw size={12} /> : <ArrowDownToLine size={12} />}
                disabled={update.installing}
                onClick={() => void (update.ready ? installUpdate() : downloadUpdate())}
              >
                {update.installing
                  ? t('settings.updateInstalling')
                  : update.ready
                    ? t('settings.updateInstall')
                    : t('settings.updateDownload')}
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<RefreshCw size={12} />}
                disabled={update.checking}
                onClick={() => void checkUpdates(true)}
              >
                {update.checking ? t('settings.checking') : t('settings.checkNow')}
              </Button>
            )}
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <span className="settings-icon">
              <Keyboard size={16} />
            </span>
            <h3>{t('settings.hotkeys')}</h3>
          </div>
          <SettingRow title={t('settings.hotkeysEnable')} hint={t('settings.hotkeysHint')}>
            <Switch
              checked={settings.hotkeysEnabled}
              onChange={(hotkeysEnabled) => void updateSettings({ hotkeysEnabled })}
            />
          </SettingRow>
          <div className={`hotkey-grid ${settings.hotkeysEnabled ? '' : 'is-disabled'}`}>
            <div className="hotkey-row">
              <span>{t('settings.hotkey.float')}</span>
              <HotkeyInput
                value={settings.hotkeys.float}
                disabled={!settings.hotkeysEnabled}
                onChange={(value) => setHotkey('float', value)}
              />
            </div>
            <div className="hotkey-row">
              <span>{t('settings.hotkey.capture')}</span>
              <HotkeyInput
                value={settings.hotkeys.capture}
                disabled={!settings.hotkeysEnabled}
                onChange={(value) => setHotkey('capture', value)}
              />
            </div>
          </div>
          <div className="settings-inline-actions">
            <Button
              size="sm"
              icon={<RotateCcw size={12} />}
              onClick={() => void updateSettings({ hotkeys: DEFAULT_HOTKEYS })}
            >
              {t('settings.hotkeyReset')}
            </Button>
          </div>
        </section>
        </div>
      </div>

      {photosOpen ? (
        <ConfirmDialog
          title={t('settings.clearPhotosTitle')}
          text={t('settings.clearPhotosText')}
          confirmLabel={t('settings.clearPhotos')}
          cancelLabel={t('common.cancel')}
          danger
          onConfirm={() => void confirmClearPhotos()}
          onClose={() => setPhotosOpen(false)}
        />
      ) : null}

      {clearOpen ? (
        <ConfirmDialog
          title={t('settings.clearTitle')}
          text={t('settings.clearText')}
          confirmLabel={t('common.deleteAll')}
          cancelLabel={t('common.cancel')}
          danger
          onConfirm={() => void confirmClear()}
          onClose={() => setClearOpen(false)}
        />
      ) : null}
    </div>
  )
}
