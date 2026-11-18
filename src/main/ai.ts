import { BrowserWindow, Notification, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type {
  Attachment,
  ChatError,
  ChatMessage,
  ChatMode,
  Conversation,
  LocalModelsResult,
  Provider,
  SendChatPayload,
  TestResult
} from '@shared/types'
import { FLOAT_PROMPT, SCREEN_PROMPT, SYSTEM_PROMPT } from '@shared/prompts'
import { isProviderReady } from '@shared/providers'
import { getStore } from './store'
import { managedOllamaInstalled, startOllama } from './ollama'
import { GUARD_POLICY, guardRefusal, inspectRequest } from './guard'

interface StreamOptions {
  provider: Provider
  messages: unknown[]
  signal: AbortSignal
  onDelta: (delta: string) => void
}

const activeRequests = new Map<string, AbortController>()

export function abortRequest(conversationId: string): void {
  activeRequests.get(conversationId)?.abort()
}

export function isBusy(conversationId: string): boolean {
  return activeRequests.has(conversationId)
}

function endpointFor(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

function headersFor(provider: Provider): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey}`
  if (provider.kind === 'openrouter') {
    headers['HTTP-Referer'] = 'https://chelp.app'
    headers['X-Title'] = 'Chelp AI'
  }
  return headers
}

function errorOf(code: string, detail?: string, status?: number): ChatError {
  return { code, detail, status }
}

async function describeHttp(res: Response): Promise<string> {
  let detail = ''
  try {
    const text = await res.text()
    const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    const raw = typeof json.error === 'string' ? json.error : json.error?.message ?? json.message
    detail = raw ? String(raw) : text.slice(0, 300)
  } catch {
    /* ignore */
  }
  return detail || res.statusText
}

function classifyMessage(message: string): string | null {
  const text = message.toLowerCase()
  if (/insufficient|balance|quota|credit|billing|payment required/.test(text)) return 'no_balance'
  if (/rate limit|too many requests/.test(text)) return 'rate_limit'
  if (/invalid api key|incorrect api key|api key not valid|unauthorized|authentication|invalid.*token/.test(text)) {
    return 'auth'
  }
  if (/context length|maximum context|context window|too many tokens|token limit|too long/.test(text)) {
    return 'too_long'
  }
  if (/image_url|image input|images? (are|is) not supported|does not support image|not support.*image|unknown variant.*image/.test(text)) {
    return 'image_unsupported'
  }
  if (/model.*(not found|not exist|does not exist|is not available)|no such model|unknown model/.test(text)) {
    return 'not_found_model'
  }
  return null
}

function mapHttpError(status: number, detail: string): ChatError {
  const hint = classifyMessage(detail)
  if (status === 402) return errorOf('no_balance', detail, status)
  if (status === 401 || status === 403) {
    return errorOf(hint === 'no_balance' ? 'no_balance' : 'auth', detail, status)
  }
  if (status === 404) return errorOf(hint ?? 'not_found_model', detail, status)
  if (status === 429) return errorOf(hint === 'no_balance' ? 'no_balance' : 'rate_limit', detail, status)
  if (status === 408 || status === 504) return errorOf('timeout', detail, status)
  if (status >= 500) return errorOf('provider_down', detail, status)
  if (hint) return errorOf(hint, detail, status)
  return errorOf('http', detail, status)
}

function mapThrown(error: unknown): ChatError {
  if (error && typeof error === 'object' && 'code' in error) {
    const known = error as ChatError
    if (known.code) return known
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/timeout|timed out/i.test(message)) return errorOf('timeout', message)
  if (/abort/i.test(message)) return errorOf('aborted')
  const hint = classifyMessage(message)
  if (hint) return errorOf(hint, message)
  if (/fetch failed|ENOTFOUND|ECONN|network|socket|EAI_AGAIN|certificate|TLS/i.test(message)) {
    return errorOf('network', message)
  }
  return errorOf('unknown', message)
}

const LOCAL_KEEP_ALIVE = '2h'

async function streamCompletion({ provider, messages, signal, onDelta }: StreamOptions): Promise<string> {
  const res = await fetch(endpointFor(provider.baseUrl), {
    method: 'POST',
    headers: headersFor(provider),
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: provider.temperature,
      max_tokens: provider.maxTokens,
      stream: true,
      ...(provider.kind === 'local' ? { keep_alive: LOCAL_KEEP_ALIVE } : {})
    }),
    signal
  })
  if (!res.ok || !res.body) {
    throw mapHttpError(res.status, await describeHttp(res))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() ?? ''
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
            error?: { message?: string }
          }
          if (json.error?.message) {
            const message = json.error.message
            throw errorOf(classifyMessage(message) ?? 'provider', message)
          }
          const delta = json.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error) throw error
        }
      }
    }
  }
  return full
}

async function plainCompletion({ provider, messages, signal }: Omit<StreamOptions, 'onDelta'>): Promise<string> {
  const res = await fetch(endpointFor(provider.baseUrl), {
    method: 'POST',
    headers: headersFor(provider),
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: provider.temperature,
      max_tokens: provider.maxTokens,
      stream: false,
      ...(provider.kind === 'local' ? { keep_alive: LOCAL_KEEP_ALIVE } : {})
    }),
    signal
  })
  if (!res.ok) throw mapHttpError(res.status, await describeHttp(res))
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
  }
  const message = json.choices?.[0]?.message
  return message?.content ?? ''
}

function imagePart(attachment: Attachment): unknown | null {
  const store = getStore()
  const dataUrl = store.readAttachmentDataUrl(attachment)
  if (!dataUrl) return null
  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    const size = image.getSize()
    const maxWidth = 1600
    const resized =
      size.width > maxWidth
        ? image.resize({ width: maxWidth, quality: 'good' })
        : image
    const jpeg = resized.toJPEG(88)
    return {
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` }
    }
  } catch {
    return { type: 'image_url', image_url: { url: dataUrl } }
  }
}

function buildMessages(
  conversation: Conversation,
  provider: Provider,
  mode: ChatMode,
  surface: 'main' | 'float'
): unknown[] {
  const system =
    surface === 'float'
      ? mode === 'screen'
        ? `${FLOAT_PROMPT}\n\n${SCREEN_PROMPT}`
        : FLOAT_PROMPT
      : mode === 'screen'
        ? SCREEN_PROMPT
        : SYSTEM_PROMPT
  const messages: unknown[] = [
    { role: 'system', content: `${system}\n\n${GUARD_POLICY}` }
  ]
  const history = conversation.messages.filter((m) => !m.error || m.content.trim()).slice(-24)

  const imageMessages = new Set<string>()
  if (provider.vision) {
    for (const message of [...history].reverse()) {
      if (message.attachments?.length) imageMessages.add(message.id)
      if (imageMessages.size >= 3) break
    }
  }

  for (const message of history) {
    if (message.role === 'assistant') {
      if (message.content.trim()) messages.push({ role: 'assistant', content: message.content })
      continue
    }
    const images =
      provider.vision && imageMessages.has(message.id)
        ? (message.attachments ?? []).map(imagePart).filter(Boolean)
        : []
    if (images.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: message.content.trim() || 'Analyze the attached screenshot.' },
          ...images
        ]
      })
    } else {
      messages.push({ role: 'user', content: message.content.trim() || 'Screenshot attached.' })
    }
  }
  return messages
}

function withProvider(error: ChatError, provider: Provider): ChatError {
  return { ...error, providerLabel: providerLabel(provider) }
}

function providerIssue(provider: Provider, needsVision: boolean): ChatError | null {
  if (!provider.baseUrl.trim() || !provider.model.trim()) return errorOf('incomplete')
  if (!isProviderReady(provider)) {
    return errorOf(provider.kind === 'local' ? 'local_down' : 'no_key')
  }
  if (needsVision && !provider.vision) {
    return errorOf(provider.kind === 'local' ? 'local_vision' : 'no_vision_model')
  }
  return null
}

function resolveProviders(needsVision: boolean): { providers: Provider[] } | { error: ChatError } {
  const settings = getStore().settings
  const selected =
    settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  if (!selected) return { error: errorOf('no_provider') }

  const issue = providerIssue(selected, needsVision)
  if (!settings.autoSwitchProvider || selected.kind === 'local') {
    return issue ? { error: withProvider(issue, selected) } : { providers: [selected] }
  }

  const backups = settings.providers.filter(
    (provider) => provider.id !== selected.id && providerIssue(provider, needsVision) === null
  )
  const providers = issue ? backups : [selected, ...backups]
  if (providers.length === 0) {
    return { error: withProvider(issue ?? errorOf('no_provider'), selected) }
  }
  return { providers }
}

const AUTO_SWITCH_CODES = new Set([
  'no_balance',
  'auth',
  'no_key',
  'provider_down',
  'rate_limit',
  'not_found_model',
  'network',
  'timeout',
  'http',
  'local_down',
  'empty'
])

function providerLabel(provider: Provider): string {
  return `${provider.name} · ${provider.model}`
}

function notifyDone(conversation: Conversation, mode: ChatMode): void {
  const store = getStore()
  if (!store.settings.notifyOnDone) return
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) return
  if (!Notification.isSupported()) return
  const ru = store.settings.language === 'ru'
  new Notification({
    title: ru ? 'Анализ готов' : mode === 'screen' ? 'Analysis ready' : 'Answer ready',
    body: conversation.title || (ru ? 'Chelp AI' : 'Chelp AI')
  }).show()
}

async function run(
  conversationId: string,
  providers: Provider[],
  mode: ChatMode,
  surface: 'main' | 'float'
): Promise<void> {
  const store = getStore()
  const messageId = crypto.randomUUID()
  const controller = new AbortController()
  activeRequests.set(conversationId, controller)
  const started = Date.now()
  const settings = store.settings
  const selected =
    settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  const skippedActive =
    settings.autoSwitchProvider && selected && providers[0]?.id !== selected.id
      ? providerLabel(selected)
      : undefined
  let firstError: ChatError | null = null

  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  const persist = (
    provider: Provider,
    content: string,
    error?: ChatError,
    fallbackFrom?: string
  ): void => {
    const message: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content,
      createdAt: Date.now(),
      providerLabel: providerLabel(provider),
      fallbackFrom,
      durationMs: Date.now() - started,
      error
    }
    store.addMessage(conversationId, message)
    const updated = store.getConversation(conversationId)
    if (updated) {
      broadcast('chat:done', { conversationId, messageId, conversation: updated })
      if (!error) notifyDone(updated, mode)
    }
  }

  try {
    const current = store.getConversation(conversationId)
    const lastUser = current
      ? [...current.messages].reverse().find((message) => message.role === 'user')
      : undefined
    const verdict = inspectRequest(lastUser?.content ?? '')
    if (verdict.blocked && verdict.reason) {
      const guardMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: guardRefusal(verdict.reason, settings.language),
        createdAt: Date.now(),
        durationMs: 0,
        guard: verdict.reason
      }
      store.addMessage(conversationId, guardMessage)
      const updated = store.getConversation(conversationId)
      if (updated) {
        broadcast('chat:done', { conversationId, messageId, conversation: updated })
      }
      return
    }

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index]
      let partial = ''
      broadcast('chat:start', {
        conversationId,
        messageId,
        providerLabel: providerLabel(provider),
        mode
      })

      try {
        if (provider.kind === 'local' && managedOllamaInstalled()) {
          const runtime = await startOllama()
          if (!runtime.ok) throw errorOf('local_down')
        }
        const conversation = store.getConversation(conversationId)
        if (!conversation) throw errorOf('not_found')
        const messages = buildMessages(conversation, provider, mode, surface)
        const signal = controller.signal
        const text = store.settings.streaming
          ? await streamCompletion({
              provider,
              messages,
              signal,
              onDelta: (delta) => {
                partial += delta
                broadcast('chat:delta', { conversationId, messageId, delta })
              }
            })
          : await plainCompletion({ provider, messages, signal })

        if (!text.trim()) throw errorOf('empty')
        const fallbackFrom = skippedActive ?? (index > 0 ? providerLabel(providers[0]) : undefined)
        persist(provider, text.trim(), undefined, fallbackFrom)
        return
      } catch (error) {
        const raw = mapThrown(error)
        const mapped = withProvider(
          provider.kind === 'local' &&
            (raw.code === 'network' || raw.code === 'timeout' || raw.code === 'provider_down')
            ? errorOf('local_down', raw.detail)
            : raw,
          provider
        )
        if (!firstError) firstError = mapped
        if (mapped.code === 'aborted') {
          if (partial.trim()) {
            const fallbackFrom =
              skippedActive ?? (index > 0 ? providerLabel(providers[0]) : undefined)
            persist(provider, partial.trim(), undefined, fallbackFrom)
          } else {
            broadcast('chat:error', { conversationId, messageId, error: mapped })
          }
          return
        }
        if (partial.trim()) {
          const fallbackFrom =
            skippedActive ?? (index > 0 ? providerLabel(providers[0]) : undefined)
          persist(provider, partial.trim(), mapped, fallbackFrom)
          return
        }
        if (index < providers.length - 1 && AUTO_SWITCH_CODES.has(mapped.code)) continue
        break
      }
    }
    broadcast('chat:error', {
      conversationId,
      messageId,
      error: firstError ?? errorOf('no_provider')
    })
  } finally {
    activeRequests.delete(conversationId)
  }
}

export async function sendChat(
  payload: SendChatPayload
): Promise<{ ok: boolean; error?: ChatError }> {
  const store = getStore()
  if (activeRequests.has(payload.conversationId)) return { ok: false, error: errorOf('busy') }
  const conversation = store.getConversation(payload.conversationId)
  if (!conversation) return { ok: false, error: errorOf('not_found') }

  const needsVision = (payload.attachments?.length ?? 0) > 0
  const resolved = resolveProviders(needsVision)
  if ('error' in resolved) return { ok: false, error: resolved.error }

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: payload.text.trim(),
    createdAt: Date.now(),
    attachments: payload.attachments?.length ? payload.attachments : undefined
  }
  const updated = store.addMessage(payload.conversationId, userMessage)
  if (!updated) return { ok: false, error: errorOf('not_found') }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('chat:user-message', {
        conversationId: payload.conversationId,
        conversation: updated
      })
    }
  }

  void run(payload.conversationId, resolved.providers, payload.mode, payload.surface ?? 'main')
  return { ok: true }
}

export async function regenerate(
  conversationId: string,
  surface: 'main' | 'float' = 'main'
): Promise<{ ok: boolean; error?: ChatError }> {
  const store = getStore()
  if (activeRequests.has(conversationId)) return { ok: false, error: errorOf('busy') }
  const conversation = store.getConversation(conversationId)
  if (!conversation) return { ok: false, error: errorOf('not_found') }
  const lastUser = [...conversation.messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) return { ok: false, error: errorOf('nothing_to_retry') }

  store.truncateAfter(conversationId, lastUser.id)
  const needsVision = (lastUser.attachments?.length ?? 0) > 0
  const resolved = resolveProviders(needsVision)
  if ('error' in resolved) return { ok: false, error: resolved.error }
  void run(conversationId, resolved.providers, conversation.mode, surface)
  return { ok: true }
}

async function deepseekBalance(provider: Provider): Promise<string | undefined> {
  if (provider.kind !== 'deepseek' || !provider.apiKey.trim()) return undefined
  try {
    const origin = new URL(provider.baseUrl).origin
    const res = await fetch(`${origin}/user/balance`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) return undefined
    const info = (await res.json()) as {
      balance_infos?: Array<{ currency: string; total_balance: string }>
    }
    const first = info.balance_infos?.[0]
    return first ? `${first.total_balance} ${first.currency}` : undefined
  } catch {
    return undefined
  }
}

export async function warmLocalModel(provider: Provider): Promise<void> {
  if (provider.kind !== 'local' || !provider.model.trim()) return
  let origin = ''
  try {
    origin = new URL(provider.baseUrl).origin
  } catch {
    return
  }
  try {
    await fetch(`${origin}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        prompt: 'hi',
        stream: false,
        keep_alive: LOCAL_KEEP_ALIVE,
        options: { num_predict: 1 }
      }),
      signal: AbortSignal.timeout(180000)
    })
  } catch {
    /* warm-up is best effort */
  }
}

async function localServerTest(provider: Provider): Promise<TestResult | null> {
  let origin = ''
  try {
    origin = new URL(provider.baseUrl).origin
  } catch {
    return null
  }
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(4000) })
  } catch {
    return null
  }
  if (!res.ok) return null
  let names: string[] = []
  try {
    const json = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
    names = (json.models ?? []).map((model) => model.name ?? model.model ?? '').filter(Boolean)
  } catch {
    return null
  }
  const wanted = provider.model.trim()
  const normalize = (name: string): string => name.replace(/:latest$/, '')
  const installed = names.some(
    (name) => name === wanted || normalize(name) === normalize(wanted)
  )
  if (!installed) {
    return {
      ok: false,
      error: names.length ? `Model ${wanted} is not downloaded` : 'No models installed yet',
      errorCode: 'not_found_model',
      latencyMs: Date.now() - started
    }
  }
  void warmLocalModel(provider)
  return { ok: true, latencyMs: Date.now() - started }
}

export async function testProvider(provider: Provider): Promise<TestResult> {
  if (provider.kind !== 'local' && !provider.apiKey.trim()) {
    return { ok: false, error: 'no_key', errorCode: 'no_key' }
  }
  if (!provider.baseUrl.trim() || !provider.model.trim()) {
    return { ok: false, error: 'incomplete', errorCode: 'incomplete' }
  }
  const started = Date.now()
  const balancePromise = deepseekBalance(provider)
  if (provider.kind === 'local') {
    const local = await localServerTest(provider)
    if (local) return local
  }
  try {
    const res = await fetch(endpointFor(provider.baseUrl), {
      method: 'POST',
      headers: headersFor(provider),
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 2,
        stream: false
      }),
      signal: AbortSignal.timeout(provider.kind === 'local' ? 90000 : 25000)
    })
    if (!res.ok) {
      const mapped = mapHttpError(res.status, await describeHttp(res))
      return {
        ok: false,
        error: mapped.detail,
        errorCode: mapped.code,
        latencyMs: Date.now() - started,
        balance: await balancePromise
      }
    }
    await res.json()
    return { ok: true, latencyMs: Date.now() - started, balance: await balancePromise }
  } catch (error) {
    const mapped = mapThrown(error)
    const localDown =
      provider.kind === 'local' &&
      (mapped.code === 'network' || mapped.code === 'timeout' || mapped.code === 'provider_down')
    return {
      ok: false,
      error: mapped.detail,
      errorCode: localDown ? 'local_down' : mapped.code,
      latencyMs: Date.now() - started
    }
  }
}

const LOCAL_VISION_HINT = /(vl|vision|llava|moondream|minicpm-v|gemma-?[34]|qwen3\.[5-8]|qwen2\.5vl|mistral-small3)/i

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function localRuntimeInstalled(): boolean {
  if (managedOllamaInstalled()) return true
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)']
  ].filter((root): root is string => Boolean(root))
  const candidates = roots.flatMap((root) => [
    join(root, 'Programs', 'Ollama', 'ollama.exe'),
    join(root, 'Ollama', 'ollama.exe'),
    join(root, 'Programs', 'LM Studio', 'LM Studio.exe'),
    join(root, 'LM-Studio', 'LM Studio.exe'),
    join(root, 'LM Studio', 'LM Studio.exe'),
    join(root, 'Programs', 'lms', 'lms.exe')
  ])
  if (process.env.USERPROFILE) {
    candidates.push(join(process.env.USERPROFILE, '.lmstudio', 'bin', 'lms.exe'))
    candidates.push(join(process.env.USERPROFILE, '.ollama', 'id_ed25519'))
  }
  if (candidates.some((candidate) => existsSync(candidate))) return true
  const pathEnv = process.env.PATH ?? ''
  return pathEnv
    .split(delimiter)
    .some((dir) => dir.length > 0 && existsSync(join(dir, 'ollama.exe')))
}

export async function listLocalModels(baseUrl: string): Promise<LocalModelsResult> {
  let base = ''
  let origin = ''
  let host = ''
  try {
    const url = new URL(baseUrl.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, models: [], error: 'bad_url' }
    }
    base = url.toString().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
    origin = url.origin
    host = url.hostname
  } catch {
    return { ok: false, models: [], error: 'bad_url' }
  }

  let reachable = false

  const finish = (ids: string[]): LocalModelsResult => {
    const unique = [...new Set(ids.filter(Boolean))].sort((a, b) => a.localeCompare(b))
    return {
      ok: true,
      models: unique.map((id) => ({ id, vision: LOCAL_VISION_HINT.test(id), installed: true }))
    }
  }

  try {
    const res = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(6000) })
    reachable = true
    if (res.ok) {
      const json = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
      if (Array.isArray(json.models) && json.models.length > 0) {
        return finish(json.models.map((model) => model.name ?? model.model ?? ''))
      }
    }
  } catch {
    /* try the OpenAI-compatible endpoint next */
  }

  try {
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(6000) })
    reachable = true
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id?: string }> }
      if (Array.isArray(json.data) && json.data.length > 0) {
        return finish(json.data.map((model) => model.id ?? ''))
      }
    }
  } catch {
    /* offline */
  }

  if (reachable) {
    return { ok: false, models: [], error: 'no_models', installed: true }
  }
  return {
    ok: false,
    models: [],
    error: 'offline',
    installed: LOOPBACK_HOSTS.has(host) ? localRuntimeInstalled() : undefined
  }
}
