import { useEffect, useRef, useState } from 'react'
import {
  AppWindow,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  FileText,
  Globe,
  Keyboard,
  MousePointer2,
  Pencil,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  Zap
} from 'lucide-react'
import type { AgentActionKind, AgentCapability, AgentOffer, AgentStep } from '@shared/types'
import { useApp } from '../store'
import { useT } from '../hooks'
import { Button, Segmented, Spinner } from './ui'

const CAP_ICONS: Record<AgentCapability, typeof MousePointer2> = {
  mouse: MousePointer2,
  keyboard: Keyboard,
  browser: Globe,
  files: FileText
}

const ACTION_ICONS: Record<AgentActionKind, typeof MousePointer2> = {
  move: MousePointer2,
  click: MousePointer2,
  double_click: MousePointer2,
  right_click: MousePointer2,
  type: Keyboard,
  press: Keyboard,
  scroll: MousePointer2,
  wait: Clock,
  open_url: Globe,
  open_app: AppWindow,
  edit_file: Pencil,
  finish: Check
}

type Translate = (key: string, params?: Record<string, string | number>) => string

function errorText(t: Translate, code?: string | null): string | null {
  if (!code || code === 'cancelled') return null
  if (/^(provider_\d+|input_exit_\d+)$/.test(code)) return t('agent.errors.provider')
  const key = `agent.errors.${code}`
  const value = t(key)
  return value === key ? t('agent.errors.unknown') : value
}

function shortHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

function stepLabel(t: Translate, step: AgentStep): string {
  const action = step.action
  const label = t(`agent.action.${action.kind}`)
  if (action.kind === 'open_url' && action.url) return `${label} · ${shortHost(action.url)}`
  if (action.kind === 'open_app' && action.app) {
    const key = `agent.app.${action.app}`
    const name = t(key)
    return `${label} · ${name === key ? action.app : name}`
  }
  if (action.kind === 'edit_file' && action.path) return `${label} · ${fileName(action.path)}`
  if (action.kind === 'type' && action.text) {
    const text = action.text.length > 46 ? `${action.text.slice(0, 46)}…` : action.text
    return `${label} · ${text}`
  }
  if (action.kind === 'press' && action.keys) return `${label} · ${action.keys}`
  if ((action.kind === 'move' || action.kind === 'click') && action.x !== undefined && action.y !== undefined) {
    return `${label} · ${Math.round(action.x * 100)}%, ${Math.round(action.y * 100)}%`
  }
  return label
}

export function AgentCard({
  messageId,
  offer,
  providerLabel,
  createdAt,
  latest
}: {
  messageId: string
  offer: AgentOffer
  providerLabel?: string
  createdAt: number
  latest: boolean
}) {
  const t = useT()
  const agent = useApp((state) => state.agent)
  const conversationId = useApp((state) => state.conversationId)
  const settings = useApp((state) => state.settings)
  const start = useApp((state) => state.agentStart)
  const buildPlan = useApp((state) => state.agentBuildPlan)
  const runPlan = useApp((state) => state.agentRun)
  const cancel = useApp((state) => state.agentCancel)
  const reset = useApp((state) => state.agentReset)
  const updateSettings = useApp((state) => state.updateSettings)

  const [open, setOpen] = useState(() => latest && Date.now() - createdAt < 25000)
  const [dismissed, setDismissed] = useState(false)
  const autoStarted = useRef(false)

  const scope =
    settings.agentPermission === 'always'
      ? 'always'
      : conversationId && settings.agentAllowedChats.includes(conversationId)
        ? 'chat'
        : 'ask'

  useEffect(() => {
    if (!latest || !conversationId || autoStarted.current) return
    if (scope === 'ask') return
    if (agent.stage === 'preparing' || agent.stage === 'planning' || agent.stage === 'running') return
    if (agent.messageId === messageId) return
    if (Date.now() - createdAt > 25000) return
    autoStarted.current = true
    void start(messageId, conversationId, offer, true)
  }, [latest, conversationId, scope, agent.stage, agent.messageId, messageId, createdAt, offer, start])

  if (dismissed) return null

  const setScope = (value: 'ask' | 'chat' | 'always'): void => {
    if (!conversationId) return
    if (value === 'always') {
      void updateSettings({ agentPermission: 'always' })
      return
    }
    const chats = settings.agentAllowedChats.filter((id) => id !== conversationId)
    void updateSettings({
      agentPermission: 'ask',
      agentAllowedChats: value === 'chat' ? [...chats, conversationId] : chats
    })
  }

  const autoScope = scope === 'always' ? t('agent.auto.scope.always') : t('agent.auto.scope.chat')
  const runNow = (): void => {
    if (!conversationId) return
    void start(messageId, conversationId, offer, true)
  }

  const active = agent.stage !== 'idle' && agent.messageId === messageId
  if (active) {
    const stage = agent.stage
    const plan = agent.plan
    const prepared = agent.prepared
    const provider = plan?.providerLabel || prepared?.providerLabel || providerLabel || ''
    const busy = stage === 'preparing' || stage === 'planning' || stage === 'running'
    const doneCount = plan ? plan.steps.filter((step) => step.status === 'done').length : 0
    const percent = plan && plan.steps.length ? Math.round((doneCount / plan.steps.length) * 100) : 0
    const errorTitle = errorText(t, agent.error)

    return (
      <section className={`agent-card is-panel is-${stage}`}>
        <header className="agent-panel-head">
          <span className="agent-badge">
            <Sparkles size={12} />
            {t('agent.label')}
          </span>
          <span className="agent-panel-title">
            {stage === 'preparing'
              ? t('agent.stage.preparing')
              : stage === 'planning'
                ? t('agent.stage.planning')
                : plan
                  ? t('agent.plan.title')
                  : t(`agent.kind.${offer.kind}`)}
          </span>
          {plan ? (
            <span className={`agent-risk is-${plan.risk}`}>{t(`agent.plan.risk.${plan.risk}`)}</span>
          ) : null}
          {busy ? <Spinner /> : null}
        </header>

        {stage === 'preparing' && prepared?.preview ? (
          <div className="agent-shot is-soft">
            <img src={prepared.preview} alt="" />
          </div>
        ) : null}

        {stage === 'prepared' ? (
          <div className="agent-consent">
            {prepared?.preview ? (
              <div className="agent-shot">
                <img src={prepared.preview} alt="" />
                <span className="agent-shot-meta">
                  {prepared.width} × {prepared.height} px
                </span>
              </div>
            ) : null}
            <strong className="agent-consent-title">{t('agent.consent.title')}</strong>
            <p className="agent-consent-text">{t('agent.consent.text')}</p>
            <div className="agent-card-actions">
              <Button
                size="sm"
                variant="primary"
                icon={<ArrowRight size={12} />}
                onClick={() => void buildPlan()}
              >
                {t('agent.consent.build')}
              </Button>
              <button type="button" className="agent-ghost" onClick={reset}>
                {t('agent.consent.discard')}
              </button>
            </div>
            {provider ? (
              <span className="agent-provider-line">
                {t('agent.plan.provider', { provider })}
              </span>
            ) : null}
          </div>
        ) : null}

        {plan && stage !== 'preparing' ? (
          <div className="agent-plan">
            <div className="agent-plan-meta">
              <span>{t('agent.plan.provider', { provider })}</span>
              <span>·</span>
              <span>{t('agent.plan.steps', { n: plan.steps.length })}</span>
              {stage === 'running' ? (
                <span className="agent-progress-text">
                  {t('agent.run.progress', {
                    step: Math.min(plan.steps.length, doneCount + 1),
                    total: plan.steps.length
                  })}
                </span>
              ) : null}
            </div>
            {stage === 'running' ? (
              <div className="agent-progress">
                <span style={{ width: `${percent}%` }} />
              </div>
            ) : null}
            <ol className="agent-steps">
              {plan.steps.map((step) => {
                const Icon = ACTION_ICONS[step.action.kind] ?? Check
                const detail = errorText(t, step.detail)
                return (
                  <li key={step.index} className={`agent-step is-${step.status}`}>
                    <span className="agent-step-icon">
                      {step.status === 'done' ? <Check size={13} /> : <Icon size={13} />}
                    </span>
                    <span className="agent-step-body">
                      <span className="agent-step-label">{stepLabel(t, step)}</span>
                      {step.action.note ? (
                        <span className="agent-step-note">{step.action.note}</span>
                      ) : null}
                      {detail ? <span className="agent-step-detail">{detail}</span> : null}
                    </span>
                    <span className="agent-step-status">{t(`agent.status.${step.status}`)}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        ) : null}

        {stage === 'done' ? (
          <div className="agent-outcome is-done">
            <Check size={15} />
            <div>
              <strong>{t('agent.done.title')}</strong>
              <span>{t('agent.done.text')}</span>
            </div>
          </div>
        ) : null}

        {stage === 'cancelled' ? (
          <div className="agent-outcome is-cancelled">
            <Square size={13} />
            <div>
              <strong>{t('agent.cancelled.title')}</strong>
              <span>{t('agent.cancelled.text')}</span>
            </div>
          </div>
        ) : null}

        {stage === 'error' && errorTitle ? (
          <div className="agent-outcome is-error">
            <CircleAlert size={15} />
            <div>
              <strong>{t('agent.error.title')}</strong>
              <span>{errorTitle}</span>
            </div>
          </div>
        ) : null}

        {stage === 'planned' && plan ? (
          <div className="agent-card-actions">
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={12} />}
              onClick={() => void runPlan()}
            >
              {t('agent.plan.run')}
            </Button>
            <button type="button" className="agent-ghost" onClick={reset}>
              {t('agent.plan.close')}
            </button>
          </div>
        ) : null}

        {stage === 'running' ? (
          <div className="agent-card-actions is-running">
            <Button
              size="sm"
              variant="danger"
              icon={<Square size={11} />}
              onClick={() => void cancel()}
            >
              {t('agent.run.stop')}
            </Button>
            <span className="agent-run-hint">
              <Sparkles size={12} />
              {t('agent.run.hint')}
            </span>
          </div>
        ) : null}

        {stage === 'done' || stage === 'cancelled' || stage === 'error' ? (
          <div className="agent-card-actions">
            <button type="button" className="agent-ghost" onClick={reset}>
              {t('agent.plan.close')}
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className={`agent-card is-offer ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="agent-offer-head"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="agent-badge">
          <Sparkles size={12} />
          {t('agent.label')}
        </span>
        <span className="agent-offer-title">
          {offer.kind === 'fix' ? t('agent.offer.titleFix') : t('agent.offer.title')}
        </span>
        <span className="agent-offer-tail">
          {scope !== 'ask' ? (
            <span className="agent-auto-badge">
              <Zap size={11} />
              {t('agent.auto.badge')}
            </span>
          ) : null}
          {providerLabel ? <span className="agent-offer-provider">{providerLabel}</span> : null}
          <ChevronDown size={16} className="agent-chevron" />
        </span>
      </button>

      {open ? (
        <div className="agent-offer-body">
          <p className="agent-goal">{offer.goal}</p>
          <span className="agent-caps-label">{t('agent.offer.caps')}</span>
          <div className="agent-caps">
            {offer.capabilities.map((capability) => {
              const Icon = CAP_ICONS[capability] ?? MousePointer2
              return (
                <span className="agent-cap" key={capability}>
                  <Icon size={12} />
                  {t(`agent.cap.${capability}`)}
                </span>
              )
            })}
          </div>
          <div className="agent-scope">
            <span className="agent-caps-label">{t('agent.offer.scope')}</span>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'ask', label: t('agent.permission.ask') },
                { value: 'chat', label: t('agent.permission.chat') },
                { value: 'always', label: t('agent.permission.always') }
              ]}
            />
          </div>
          {scope !== 'ask' ? (
            <p className="agent-auto-hint">
              <Zap size={12} />
              {t('agent.auto.hint', { scope: autoScope })}
            </p>
          ) : (
            <p className="agent-offer-note">
              <ShieldCheck size={13} />
              {t('agent.offer.text')}
            </p>
          )}
          <div className="agent-card-actions">
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={12} />}
              disabled={!conversationId}
              onClick={runNow}
            >
              {t('agent.offer.run')}
            </Button>
            <Button
              size="sm"
              icon={<ArrowRight size={12} />}
              disabled={!conversationId}
              onClick={() => conversationId && void start(messageId, conversationId, offer)}
            >
              {t('agent.offer.showSteps')}
            </Button>
            <button type="button" className="agent-ghost" onClick={() => setDismissed(true)}>
              {t('agent.offer.later')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
