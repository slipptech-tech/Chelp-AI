import { useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wifi
} from 'lucide-react'
import type { LocalModelOption, OllamaProgress, Provider, ProviderKind, TestResult } from '@shared/types'
import { PROVIDER_PRESETS, createProvider, isProviderReady } from '@shared/providers'
import { useApp } from '../store'
import { useSettings, useT } from '../hooks'
import { uid } from '../lib/format'
import { Button, ConfirmDialog, IconButton, Modal, PageHeader, Spinner, Switch } from '../components/ui'
import { ProviderLogo } from '../components/ProviderLogo'
import { SelectMenu } from '../components/SelectMenu'

const KINDS: ProviderKind[] = ['deepseek', 'openrouter', 'local', 'openai', 'gemini', 'custom']

export function AiPage() {
  const t = useT()
  const settings = useSettings()
  const updateSettings = useApp((state) => state.updateSettings)
  const toast = useApp((state) => state.toast)

  const activeProvider =
    settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  const [selectedId, setSelectedId] = useState(activeProvider?.id ?? '')
  const selected =
    settings.providers.find((p) => p.id === selectedId) ?? settings.providers[0] ?? null

  const [draft, setDraft] = useState<Provider | null>(selected)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [oauthBusy, setOauthBusy] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [localModels, setLocalModels] = useState<LocalModelOption[] | null>(null)
  const [localStatus, setLocalStatus] = useState<{
    ok: boolean
    installed?: boolean
    error?: string
  } | null>(null)
  const [runtimeBusy, setRuntimeBusy] = useState<'install' | 'start' | 'pull' | null>(null)
  const [progress, setProgress] = useState<OllamaProgress | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addKind, setAddKind] = useState<ProviderKind>('openrouter')
  const [addName, setAddName] = useState(PROVIDER_PRESETS.openrouter.name)

  const pendingRef = useRef<Provider | null>(null)
  const timerRef = useRef<number | null>(null)

  const flush = (): void => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return
    const providers = useApp
      .getState()
      .settings.providers.map((provider) => (provider.id === pending.id ? pending : provider))
    void updateSettings({ providers })
  }

  const refreshLocalModels = async (provider: Provider, silent = false): Promise<void> => {
    if (provider.kind !== 'local') return
    setLocalBusy(true)
    try {
      const result = await window.chelp.providers.localModels(provider.baseUrl)
      setLocalStatus({ ok: result.ok, installed: result.installed, error: result.error })
      if (result.ok) {
        setLocalModels(result.models)
        if (!silent) toast(t('ai.localFound', { count: String(result.models.length) }), 'success')
      } else if (!silent) {
        toast(t('ai.localFetchFailed'), 'error')
      }
    } finally {
      setLocalBusy(false)
    }
  }

  useEffect(() => {
    setDraft(selected)
    setTest(null)
    setShowKey(false)
    setLocalModels(null)
    setLocalStatus(null)
    setProgress(null)
    if (selected?.kind === 'local') void refreshLocalModels(selected, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return window.chelp.providers.onOllamaProgress((event) => setProgress(event))
  }, [])

  const updateDraft = (patch: Partial<Provider>): void => {
    if (!draft) return
    const next = { ...draft, ...patch }
    setDraft(next)
    setTest(null)
    pendingRef.current = next
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(flush, 320)
  }

  const selectProvider = (id: string): void => {
    flush()
    setSelectedId(id)
  }

  const hasKey = settings.providers.some(isProviderReady)
  const openrouterReady = settings.providers.some(
    (provider) => provider.kind === 'openrouter' && isProviderReady(provider)
  )

  const preset = draft ? PROVIDER_PRESETS[draft.kind] : null
  const installedLocal = draft?.kind === 'local' ? (localModels ?? []) : []
  const models: LocalModelOption[] =
    draft?.kind === 'local'
      ? [
          ...installedLocal.map((model) => ({ ...model, installed: true })),
          ...PROVIDER_PRESETS.local.models
            .filter((model) => !installedLocal.some((installed) => installed.id === model.id))
            .map((model) => ({ ...model, installed: false }))
        ]
      : (preset?.models ?? [])
  const customModel = !models.some((model) => model.id === draft?.model)
  const modelInstalled =
    draft?.kind !== 'local' || (localModels?.some((model) => model.id === draft?.model) ?? false)

  const localIssue =
    localStatus && !localStatus.ok
      ? localStatus.error === 'no_models'
        ? {
            notInstalled: false,
            noModels: true,
            title: t('ai.localNoModelsTitle'),
            text: t('ai.localNoModels')
          }
        : {
            notInstalled: localStatus.installed === false,
            noModels: false,
            title:
              localStatus.installed === false
                ? t('ai.localNotInstalledTitle')
                : localStatus.installed === true
                  ? t('ai.localOfflineTitle')
                  : t('ai.localUnreachableTitle'),
            text:
              localStatus.installed === false
                ? t('ai.localNotInstalled')
                : localStatus.installed === true
                  ? t('ai.localOffline')
                  : t('ai.localUnreachable')
          }
      : null

  const progressPercent = progress?.percent ?? 0
  const progressLabel = (() => {
    if (!progress) return ''
    if (progress.phase === 'extract') return t('ai.localExtracting')
    if (progress.phase === 'start') return t('ai.localStarting')
    if (progress.phase === 'pull') return progress.status ?? t('ai.localDownloadingModel')
    const mb = (value?: number): string =>
      value ? (value / 1048576).toFixed(value > 104857600 ? 0 : 1) : '?'
    return `${mb(progress.received)} / ${mb(progress.total)} MB`
  })()

  const runTest = async (): Promise<void> => {
    if (!draft) return
    if (draft.kind !== 'local' && !draft.apiKey.trim()) {
      toast(t('ai.testNeedsKey'), 'error')
      return
    }
    setTesting(true)
    setTest(null)
    try {
      const result = await window.chelp.providers.test(draft)
      setTest(result)
    } finally {
      setTesting(false)
    }
  }

  const connectOpenRouter = async (): Promise<void> => {
    if (!draft) return
    setOauthBusy(true)
    setTest(null)
    try {
      const result = await window.chelp.providers.openrouterAuth()
      if (result.ok && result.key) {
        const next = { ...draft, apiKey: result.key }
        setDraft(next)
        if (timerRef.current) {
          window.clearTimeout(timerRef.current)
          timerRef.current = null
        }
        pendingRef.current = null
        const providers = useApp
          .getState()
          .settings.providers.map((provider) => (provider.id === next.id ? next : provider))
        await updateSettings({ providers, activeProviderId: next.id })
        toast(t('ai.openrouterSuccess'), 'success')
      } else if (result.error === 'timeout') {
        toast(t('ai.openrouterTimeout'), 'error')
      } else {
        toast(t('ai.openrouterFailed', { error: result.error ?? '' }), 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast(t('ai.openrouterFailed', { error: message }), 'error')
    } finally {
      setOauthBusy(false)
    }
  }

  const signInOpenRouter = async (): Promise<void> => {
    flush()
    setOauthBusy(true)
    try {
      const result = await window.chelp.providers.openrouterAuth()
      if (!result.ok || !result.key) {
        if (result.error === 'timeout') toast(t('ai.openrouterTimeout'), 'error')
        else toast(t('ai.openrouterFailed', { error: result.error ?? '' }), 'error')
        return
      }
      const current = useApp.getState().settings.providers
      const existing = current.find((provider) => provider.kind === 'openrouter')
      const key = result.key
      let providerId: string
      let providers: Provider[]
      if (existing) {
        providerId = existing.id
        providers = current.map((provider) =>
          provider.id === existing.id ? { ...provider, apiKey: key } : provider
        )
      } else {
        const created = { ...createProvider('openrouter', uid()), apiKey: key }
        providerId = created.id
        providers = [...current, created]
      }
      await updateSettings({ providers, activeProviderId: providerId })
      setSelectedId(providerId)
      toast(t('ai.openrouterSuccess'), 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast(t('ai.openrouterFailed', { error: message }), 'error')
    } finally {
      setOauthBusy(false)
    }
  }

  const runOllamaAction = async (action: 'install' | 'start' | 'pull'): Promise<void> => {
    if (!draft || draft.kind !== 'local') return
    if (action === 'pull' && !draft.model.trim()) return
    setRuntimeBusy(action)
    setProgress(null)
    try {
      if (action === 'pull') {
        const result = await window.chelp.providers.ollamaPull(draft.model)
        if (result.ok) {
          toast(t('ai.localModelPulled', { model: draft.model }), 'success')
          await refreshLocalModels(draft, true)
        } else {
          toast(t('ai.localPullFailed'), 'error')
        }
        return
      }
      const result =
        action === 'install'
          ? await window.chelp.providers.ollamaInstall()
          : await window.chelp.providers.ollamaStart()
      if (result.ok) {
        if (action === 'install') toast(t('ai.localInstalled'), 'success')
        await refreshLocalModels(draft, true)
      } else {
        toast(
          action === 'install' ? t('ai.localInstallFailed') : t('ai.localStartFailed'),
          'error'
        )
      }
    } finally {
      setRuntimeBusy(null)
      setProgress(null)
    }
  }

  const setActive = (): void => {    if (!draft) return
    flush()
    void updateSettings({ activeProviderId: draft.id })
    toast(t('ai.activeToast', { name: draft.name }), 'success')
  }

  const openAdd = (): void => {
    const preferred: ProviderKind = settings.providers.some((p) => p.vision && isProviderReady(p))
      ? 'deepseek'
      : 'openrouter'
    setAddKind(preferred)
    setAddName(PROVIDER_PRESETS[preferred].name)
    setAddOpen(true)
  }

  const addProvider = async (): Promise<void> => {
    let provider = createProvider(addKind, uid())
    provider.name = addName.trim() || provider.name
    if (addKind === 'local') {
      const result = await window.chelp.providers.localModels(provider.baseUrl)
      if (result.ok && result.models.length > 0) {
        const curated = PROVIDER_PRESETS.local.models.find((model) =>
          result.models.some((installed) => installed.id === model.id)
        )
        const installed =
          (curated && result.models.find((model) => model.id === curated.id)) ||
          result.models.find((model) => model.vision) ||
          result.models[0]
        provider = { ...provider, model: installed.id, vision: installed.vision }
      }
    }
    const providers = [...settings.providers, provider]
    await updateSettings({ providers, activeProviderId: provider.id })
    setSelectedId(provider.id)
    setAddOpen(false)
    toast(t('ai.providerAdded'), 'success')
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    if (settings.providers.length <= 1) {
      setDeleteTarget(null)
      toast(t('ai.lastProvider'), 'error')
      return
    }
    const providers = settings.providers.filter((provider) => provider.id !== deleteTarget.id)
    const activeProviderId =
      settings.activeProviderId === deleteTarget.id
        ? (providers.find(isProviderReady) ?? providers[0]).id
        : settings.activeProviderId
    await updateSettings({ providers, activeProviderId })
    if (selectedId === deleteTarget.id) setSelectedId(providers[0].id)
    setDeleteTarget(null)
    toast(t('ai.providerDeleted'), 'success')
  }

  return (
    <div className="page page-scroll">
      <PageHeader
        eyebrow={t('nav.system')}
        title={t('ai.title')}
        subtitle={t('ai.subtitle')}
        actions={
          <>
            {!openrouterReady ? (
              <Button
                variant="secondary"
                size="sm"
                icon={oauthBusy ? <Spinner /> : <Link2 size={14} />}
                onClick={() => void signInOpenRouter()}
                disabled={oauthBusy}
              >
                {oauthBusy ? t('ai.openrouterConnecting') : t('ai.openrouterSignIn')}
              </Button>
            ) : null}
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openAdd}>
              {t('ai.add')}
            </Button>
          </>
        }
      />

      {!hasKey ? (
        <div className="inline-banner is-warn">
          <span>{t('ai.noKeyBanner')}</span>
        </div>
      ) : null}

      <div className="ai-layout">
        <aside className="provider-list">
          <div className="provider-list-head">
            <span>{t('ai.providers')}</span>
            <span className="provider-count">{settings.providers.length}</span>
          </div>
          {settings.providers.map((provider) => {
            const ready = isProviderReady(provider)
            return (
              <button
                type="button"
                key={provider.id}
                className={`provider-item ${provider.id === selected?.id ? 'is-selected' : ''}`}
                onClick={() => selectProvider(provider.id)}
              >
                <ProviderLogo kind={provider.kind} />
                <span className="provider-item-body">
                  <span className="provider-item-title">
                    <strong>{provider.name}</strong>
                    {provider.id === settings.activeProviderId ? (
                      <span className="provider-pill is-active">{t('ai.active')}</span>
                    ) : null}
                  </span>
                  <span className="provider-item-model">{provider.model || '—'}</span>
                  <span className="provider-item-tags">
                    <span className={`status-dot ${ready ? 'is-ready' : 'is-missing'}`} />
                    {ready ? t('ai.status.ready') : t('ai.status.noKey')}
                    <span className="dot-sep">·</span>
                    {provider.vision ? t('ai.visionRole') : t('ai.status.textOnly')}
                  </span>
                </span>
              </button>
            )
          })}

          <button type="button" className="add-provider-tile" onClick={openAdd}>
            <Plus size={14} />
            {t('ai.add')}
          </button>

          <div className="vision-why">
            <span className="vision-why-icon">
              <Sparkles size={14} />
            </span>
            <strong>{t('ai.visionWhyTitle')}</strong>
            <p>{t('ai.visionWhyText')}</p>
          </div>
        </aside>

        <section className="provider-editor">
          {!draft || !preset ? (
            <div className="provider-editor-empty">
              <Cpu size={26} />
              <p>{t('ai.emptyProviders')}</p>
              <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openAdd}>
                {t('ai.add')}
              </Button>
            </div>
          ) : (
            <>
              <header className="editor-head">
                <ProviderLogo kind={draft.kind} size="large" />
                <div className="editor-title">
                  <h2>{draft.name}</h2>
                  <div className="editor-tags">
                    <span className="tag">{preset.name}</span>
                    <span className={`tag ${draft.vision ? 'is-vision' : ''}`}>
                      {draft.vision ? t('ai.visionRole') : t('ai.status.textOnly')}
                    </span>
                    {draft.id === settings.activeProviderId ? (
                      <span className="tag is-active">
                        <Check size={11} />
                        {t('ai.active')}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="editor-actions">
                  {draft.id !== settings.activeProviderId ? (
                    <Button size="sm" variant="secondary" icon={<Check size={12} />} onClick={setActive}>
                      {t('ai.setActive')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={testing ? <Spinner /> : <Wifi size={12} />}
                    onClick={() => void runTest()}
                    disabled={testing}
                  >
                    {testing ? t('ai.testing') : t('ai.test')}
                  </Button>
                  <IconButton label={t('ai.delete')} onClick={() => setDeleteTarget(draft)}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </header>

              {test ? (
                <div className={`test-result ${test.ok ? 'is-ok' : 'is-error'}`}>
                  {test.ok ? <Check size={14} /> : <CircleAlert size={14} />}
                  <div>
                    <strong>{test.ok ? t('ai.connected') : t('ai.failed')}</strong>
                    <span title={test.error}>
                      {test.ok
                        ? [
                            test.latencyMs !== undefined ? t('ai.latency', { ms: test.latencyMs }) : '',
                            test.balance ? `${t('ai.balance')}: ${test.balance}` : ''
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : [
                            test.errorCode ? t(`errors.${test.errorCode}`) : (test.error ?? ''),
                            test.balance ? `${t('ai.balance')}: ${test.balance}` : ''
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="editor-grid">
                <label className="field">
                  <span className="field-label">{t('ai.name')}</span>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(event) => updateDraft({ name: event.target.value })}
                  />
                </label>

                <label className="field">
                  <span className="field-label">{t('ai.model')}</span>
                  {draft.kind !== 'custom' && models.length > 0 ? (
                    <SelectMenu
                      mono
                      value={customModel ? '__custom' : draft.model}
                      ariaLabel={t('ai.model')}
                      options={[
                        ...models.map((model) => ({
                          value: model.id,
                          label: model.id,
                          badge:
                            model.installed === false
                              ? t('ai.localBadgeDownload')
                              : model.vision
                                ? 'vision'
                                : undefined
                        })),
                        { value: '__custom', label: t('ai.customModel') }
                      ]}
                      onChange={(value) => {
                        if (value === '__custom') {
                          updateDraft({ model: '' })
                        } else {
                          const presetModel = models.find((model) => model.id === value)
                          updateDraft({ model: value, vision: presetModel?.vision ?? false })
                        }
                      }}
                    />
                  ) : (
                    <input
                      className="input mono"
                      value={draft.model}
                      placeholder="model-id"
                      onChange={(event) => updateDraft({ model: event.target.value })}
                    />
                  )}
                  {customModel && draft.kind !== 'custom' ? (
                    <input
                      className="input mono"
                      value={draft.model}
                      placeholder="custom-model-id"
                      onChange={(event) => updateDraft({ model: event.target.value })}
                    />
                  ) : null}
                </label>

                {draft.kind === 'local' ? (
                  localIssue ? (
                    <div className="local-status is-wide">
                      {localIssue.notInstalled ? <Cpu size={15} /> : <CircleAlert size={15} />}
                      <div className="local-status-text">
                        <strong>{localIssue.title}</strong>
                        <span>{localIssue.text}</span>
                        {localIssue.notInstalled ? (
                          <span className="local-status-note">{t('ai.localInstallHint')}</span>
                        ) : null}
                      </div>
                      <div className="local-status-actions">
                        {localIssue.notInstalled ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={runtimeBusy === 'install' ? <Spinner /> : <Download size={12} />}
                            onClick={() => void runOllamaAction('install')}
                            disabled={runtimeBusy !== null}
                          >
                            {runtimeBusy === 'install'
                              ? t('ai.localInstalling')
                              : t('ai.localInstall')}
                          </Button>
                        ) : localIssue.noModels && draft.model ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={runtimeBusy === 'pull' ? <Spinner /> : <Download size={12} />}
                            onClick={() => void runOllamaAction('pull')}
                            disabled={runtimeBusy !== null}
                          >
                            {runtimeBusy === 'pull'
                              ? t('ai.localDownloadingModel')
                              : t('ai.localDownloadModel', { model: draft.model })}
                          </Button>
                        ) : localStatus?.installed ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={runtimeBusy === 'start' ? <Spinner /> : <Play size={12} />}
                            onClick={() => void runOllamaAction('start')}
                            disabled={runtimeBusy !== null}
                          >
                            {runtimeBusy === 'start' ? t('ai.localStarting') : t('ai.localStart')}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={localBusy ? <Spinner /> : <RefreshCw size={12} />}
                          onClick={() => void refreshLocalModels(draft)}
                          disabled={localBusy || runtimeBusy !== null}
                        >
                          {localBusy ? t('ai.localRefreshing') : t('ai.localRefresh')}
                        </Button>
                      </div>
                      {runtimeBusy ? (
                        <div className="local-progress">
                          <span className="local-progress-bar">
                            <i style={{ width: `${progressPercent}%` }} />
                          </span>
                          <span className="local-progress-label">{progressLabel}</span>
                          {progress?.percent !== undefined ? (
                            <span className="local-progress-value">{progress.percent}%</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="local-row is-wide">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={localBusy ? <Spinner /> : <RefreshCw size={12} />}
                        onClick={() => void refreshLocalModels(draft)}
                        disabled={localBusy || runtimeBusy !== null}
                      >
                        {localBusy ? t('ai.localRefreshing') : t('ai.localRefresh')}
                      </Button>
                      <span className="local-hint">
                        {localStatus?.ok && localModels
                          ? t('ai.localFound', { count: String(localModels.length) })
                          : t('ai.localModelHint')}
                      </span>
                      {draft.model && !modelInstalled ? (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={runtimeBusy === 'pull' ? <Spinner /> : <Download size={12} />}
                          onClick={() => void runOllamaAction('pull')}
                          disabled={runtimeBusy !== null}
                        >
                          {runtimeBusy === 'pull'
                            ? t('ai.localDownloadingModel')
                            : t('ai.localDownloadModel', { model: draft.model })}
                        </Button>
                      ) : null}
                      {runtimeBusy === 'pull' ? (
                        <div className="local-progress">
                          <span className="local-progress-bar">
                            <i style={{ width: `${progressPercent}%` }} />
                          </span>
                          <span className="local-progress-label">{progressLabel}</span>
                          {progress?.percent !== undefined ? (
                            <span className="local-progress-value">{progress.percent}%</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                ) : null}

                <label className="field is-wide">
                  <span className="field-label">{t('ai.baseUrl')}</span>
                  <input
                    className="input mono"
                    value={draft.baseUrl}
                    spellCheck={false}
                    onChange={(event) => updateDraft({ baseUrl: event.target.value })}
                  />
                </label>

                {draft.kind === 'local' ? (
                  <div className="field is-wide">
                    <span className="field-label">{t('ai.key')}</span>
                    <div className="local-panel">
                      <Cpu size={15} />
                      <div>
                        <strong>{t('ai.localNoKeyTitle')}</strong>
                        <span>{t('ai.localNoKey')}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="field is-wide">
                    <span className="field-label">{t('ai.key')}</span>
                    <div className="input-wrap">
                      <input
                        className="input mono"
                        type={showKey ? 'text' : 'password'}
                        value={draft.apiKey}
                        placeholder={t('ai.keyPlaceholder')}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(event) => updateDraft({ apiKey: event.target.value })}
                      />
                      <button
                        type="button"
                        className="input-affix"
                        onClick={() => setShowKey((value) => !value)}
                        aria-label={showKey ? t('ai.hideKey') : t('ai.showKey')}
                        title={showKey ? t('ai.hideKey') : t('ai.showKey')}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {draft.kind === 'openrouter' ? (
                      <div className="oauth-row">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={oauthBusy ? <Spinner /> : <Link2 size={12} />}
                          onClick={() => void connectOpenRouter()}
                          disabled={oauthBusy}
                        >
                          {oauthBusy ? t('ai.openrouterConnecting') : t('ai.openrouterConnect')}
                        </Button>
                        <span className="oauth-hint">{t('ai.openrouterHint')}</span>
                      </div>
                    ) : null}
                    {preset.keyUrl ? (
                      <button
                        type="button"
                        className="link-btn is-start"
                        onClick={() => window.chelp.app.openExternal(preset.keyUrl)}
                      >
                        {t('ai.getKey')}
                      </button>
                    ) : null}
                  </label>
                )}

                <div className="setting-row is-wide">
                  <div className="setting-text">
                    <strong>{t('ai.vision')}</strong>
                    <span>{t('ai.visionHint')}</span>
                  </div>
                  <div className="setting-control">
                    <Switch checked={draft.vision} onChange={(vision) => updateDraft({ vision })} />
                  </div>
                </div>

                <label className="field">
                  <span className="field-label">
                    {t('ai.temperature')}
                    <span className="field-value">{draft.temperature.toFixed(1)}</span>
                  </span>
                  <input
                    type="range"
                    className="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(event) => updateDraft({ temperature: Number(event.target.value) })}
                  />
                </label>

                <label className="field">
                  <span className="field-label">{t('ai.maxTokens')}</span>
                  <input
                    className="input"
                    type="number"
                    min={256}
                    max={32768}
                    step={256}
                    value={draft.maxTokens}
                    onChange={(event) =>
                      updateDraft({ maxTokens: Math.max(256, Number(event.target.value) || 2048) })
                    }
                  />
                </label>
              </div>

              <footer className="editor-footer">
                <span className="editor-saved">
                  <Check size={12} />
                  {t('ai.saved')}
                </span>
                <span className="editor-fine">{t('ai.modelHint')}</span>
              </footer>
            </>
          )}
        </section>
      </div>

      {addOpen ? (
        <Modal
          title={t('ai.addTitle')}
          description={t('ai.addText')}
          width={540}
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <Button onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" icon={<Plus size={13} />} onClick={() => void addProvider()}>
                {t('ai.add')}
              </Button>
            </>
          }
        >
          <div className="preset-grid">
            {KINDS.map((kind) => {
              const item = PROVIDER_PRESETS[kind]
              return (
                <button
                  type="button"
                  key={kind}
                  className={`preset-tile kind-${kind} ${addKind === kind ? 'is-selected' : ''}`}
                  onClick={() => {
                    setAddKind(kind)
                    setAddName(item.name)
                  }}
                >
                  <ProviderLogo kind={kind} />
                  <span className="preset-text">
                    <strong>{item.name}</strong>
                    <span>
                      {kind === 'custom'
                        ? t('ai.customUrl')
                        : kind === 'local'
                          ? t('ai.localTiles')
                          : item.baseUrl.replace(/^https?:\/\//, '')}
                    </span>
                  </span>
                  {addKind === kind ? <Check size={14} /> : null}
                </button>
              )
            })}
          </div>
          <label className="field">
            <span className="field-label">{t('ai.name')}</span>
            <input
              className="input"
              value={addName}
              onChange={(event) => setAddName(event.target.value)}
            />
          </label>
          {addKind === 'openrouter' ? (
            <div className="oauth-row">
              <Button
                variant="secondary"
                icon={oauthBusy ? <Spinner /> : <Link2 size={12} />}
                onClick={() => {
                  setAddOpen(false)
                  void signInOpenRouter()
                }}
                disabled={oauthBusy}
              >
                {oauthBusy ? t('ai.openrouterConnecting') : t('ai.openrouterSignIn')}
              </Button>
              <span className="oauth-hint">{t('ai.openrouterHint')}</span>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={t('ai.deleteTitle')}
          text={t('ai.deleteText')}
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
