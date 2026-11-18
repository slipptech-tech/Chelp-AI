import type { Provider, ProviderKind } from './types'

export interface ModelPreset {
  id: string
  vision: boolean
}

export interface ProviderPreset {
  kind: ProviderKind
  name: string
  baseUrl: string
  keyUrl: string
  models: ModelPreset[]
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  deepseek: {
    kind: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-flash', vision: true },
      { id: 'deepseek-v4-pro', vision: false }
    ]
  },
  openai: {
    kind: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', vision: true },
      { id: 'gpt-4o-mini', vision: true },
      { id: 'gpt-4.1', vision: true },
      { id: 'gpt-4.1-mini', vision: true }
    ]
  },
  openrouter: {
    kind: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'google/gemini-3.8-flash', vision: true },
      { id: 'openai/gpt-6.2-astra', vision: true },
      { id: 'anthropic/claude-sonnet-5.5', vision: true },
      { id: 'deepseek/deepseek-v4.1-flash', vision: true },
      { id: 'qwen/qwen3.8-max-prime', vision: true },
      { id: 'deepseek/deepseek-v4-pro', vision: false },
      { id: 'google/gemma-4-31b-it:free', vision: true },
      { id: 'openrouter/free', vision: true }
    ]
  },
  local: {
    kind: 'local',
    name: 'Local models',
    baseUrl: 'http://127.0.0.1:11434/v1',
    keyUrl: '',
    models: [
      { id: 'qwen3.5:27b', vision: true },
      { id: 'gemma4:31b', vision: true },
      { id: 'gemma4:12b', vision: true },
      { id: 'qwen3-vl:8b', vision: true },
      { id: 'llama3.3:70b', vision: false },
      { id: 'gpt-oss:120b', vision: false },
      { id: 'qwen3:30b', vision: false },
      { id: 'deepseek-r1:32b', vision: false },
      { id: 'qwen3-coder:30b', vision: false }
    ]
  },
  gemini: {
    kind: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', vision: true },
      { id: 'gemini-2.5-pro', vision: true }
    ]
  },
  custom: {
    kind: 'custom',
    name: 'Custom endpoint',
    baseUrl: 'https://',
    keyUrl: '',
    models: []
  }
}

export function isProviderReady(provider: Provider): boolean {
  if (!provider.baseUrl.trim() || !provider.model.trim()) return false
  return provider.kind === 'local' || provider.apiKey.trim().length > 0
}

export function visionProviderFor(
  providers: Provider[],
  activeProviderId: string,
  allowBackup = false
): Provider | undefined {
  const active = providers.find((provider) => provider.id === activeProviderId)
  if (active?.vision && isProviderReady(active)) return active
  if (!allowBackup || active?.kind === 'local') return undefined
  return providers.find(
    (provider) =>
      provider.id !== active?.id && provider.vision && isProviderReady(provider)
  )
}

export function createProvider(kind: ProviderKind, id: string): Provider {
  const preset = PROVIDER_PRESETS[kind]
  const model = preset.models[0]
  return {
    id,
    kind,
    name: preset.name,
    baseUrl: preset.baseUrl,
    apiKey: '',
    model: model?.id ?? '',
    vision: model?.vision ?? false,
    temperature: 0.4,
    maxTokens: 2048
  }
}

export const DEFAULT_PROVIDERS: Provider[] = [createProvider('deepseek', 'deepseek-default')]
