import type { ConversationMeta, Lang } from '@shared/types'
import { translate } from '../i18n'

export function relativeTime(timestamp: number, lang: Lang): string {
  const now = Date.now()
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return translate(lang, 'time.justNow')
  if (minutes < 60) return translate(lang, 'time.minutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return translate(lang, 'time.hours', { n: hours })
  const date = new Date(timestamp)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return translate(lang, 'time.yesterday')
  const days = Math.floor(hours / 24)
  if (days < 7) return translate(lang, 'time.days', { n: days })
  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short'
  })
}

export function greetingKey(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'dashboard.greeting.night'
  if (hour < 12) return 'dashboard.greeting.morning'
  if (hour < 18) return 'dashboard.greeting.afternoon'
  return 'dashboard.greeting.evening'
}

export function formatClock(timestamp: number, lang: Lang): string {
  return new Date(timestamp).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatBytes(bytes: number, lang: Lang): string {
  if (!bytes || bytes < 0) return lang === 'ru' ? '0 Б' : '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')} ${units[unit]}`
}

export function formatKey(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'Ctrl' || part === 'Control') return 'Ctrl'
      if (part === 'CommandOrControl') return 'Ctrl'
      if (part === 'Space') return 'Space'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .join(' + ')
}

export function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ConversationGroup {
  label: string
  items: ConversationMeta[]
}

export function groupConversations(list: ConversationMeta[], lang: Lang): ConversationGroup[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const groups = new Map<string, ConversationMeta[]>()

  for (const item of list) {
    let label: string
    if (item.updatedAt >= startOfToday) label = translate(lang, 'time.today')
    else if (item.updatedAt >= startOfYesterday) label = translate(lang, 'time.yesterday')
    else label = translate(lang, 'time.earlier')
    const bucket = groups.get(label) ?? []
    bucket.push(item)
    groups.set(label, bucket)
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

export function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}
