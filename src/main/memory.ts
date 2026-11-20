import type { Conversation, ChatMessage, Lang, MemoryEntry, MemoryKind } from '@shared/types'

const MAX_MEMORY_TEXT = 260
const MAX_PROMPT_ENTRIES = 12

const SECRET_PATTERN =
  /(sk-[a-z0-9_-]{12,}|api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]{12,}|-----BEGIN [A-Z ]+-----)/i

export function cleanMemoryText(raw: string): string | null {
  let text = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  text = text.replace(
    /^(Problem|Cause|Explanation|Solution|Additional Information|Проблема|Причина|Объяснение|Решение|Дополнительно)\b[:\s-]*/i,
    ''
  )
  if (text.length < 8) return null
  if (SECRET_PATTERN.test(text)) return null
  if (text.length > MAX_MEMORY_TEXT) text = `${text.slice(0, MAX_MEMORY_TEXT - 1).trimEnd()}…`
  return text
}

export function screenMemoryFrom(conversation: Conversation, message: ChatMessage): string | null {
  const problem = /###\s*Problem\s*\n+([\s\S]*?)(?:\n###|$)/i.exec(message.content)?.[1]
  const body = problem ?? message.content
  const title = (conversation.title.trim() || (conversation.mode === 'screen' ? 'Screen analysis' : 'Chat'))
    .replace(/[.:;!?]+$/, '')
  return cleanMemoryText(`${title}: ${body}`)
}

export function taskMemoryText(goal: string, steps: number, status: 'done' | 'error', lang: Lang): string | null {
  const shortGoal = goal.replace(/\s+/g, ' ').trim()
  if (status === 'done') {
    return cleanMemoryText(
      lang === 'ru'
        ? `Задача «${shortGoal}» выполнена автоматически (шагов: ${steps}).`
        : `Task "${shortGoal}" completed automatically (${steps} steps).`
    )
  }
  return cleanMemoryText(
    lang === 'ru'
      ? `Задача «${shortGoal}» не завершилась — план остановлен.`
      : `Task "${shortGoal}" did not complete — the plan stopped.`
  )
}

export function memoryPromptBlock(entries: MemoryEntry[], displayLang: Lang): string {
  if (entries.length === 0) return ''
  const ordered = [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_PROMPT_ENTRIES)
  const labels: Record<MemoryKind, { ru: string; en: string }> = {
    screen: { ru: 'Экран', en: 'Screen' },
    task: { ru: 'Действие', en: 'Action' },
    note: { ru: 'Факт', en: 'Fact' }
  }
  const lines = ordered.map((entry) => {
    const label = labels[entry.kind]?.[displayLang] ?? labels.note.en
    const date = new Date(entry.createdAt).toLocaleDateString(displayLang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: 'short'
    })
    return `- [${label} · ${date}] ${entry.text}`
  })
  const header =
    displayLang === 'ru'
      ? 'Память Chelp о предыдущих сессиях на этом ПК (локальная, никуда не отправляется). Используй её, когда это действительно помогает: учитывай установленные программы, прошлые ошибки и задачи пользователя. Не цитируй память дословно и не упоминай сам механизм памяти.'
      : 'Chelp memory from earlier sessions on this PC (local only, never uploaded). Use it when it genuinely helps: account for installed apps, past errors and the user’s recurring tasks. Never quote it verbatim and never mention the memory mechanism itself.'
  return `${header}\n${lines.join('\n')}`
}
