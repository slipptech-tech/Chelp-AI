import type { AgentCapability, AgentKind, AgentOffer } from './types'

const FIX_INTENT =
  /(почини|починить|исправ|устрани|убрать ошибк|убер[иё] ошибк|реши проблем|помоги с ошибк|как.*(починить|исправить|убрать)|не работает|не запускается|вылетает|зависает|тормозит|сломал|\b(fix|repair|resolve|solve|troubleshoot|debug)\b|not working|won'?t (start|open|launch|work)|keeps? (crashing|failing)|broken|error.*(fix|solve)|how (do i|to) (fix|repair))/i

const BROWSER_INTENT =
  /(открой|открыть|зайди|зайти|перейди|перейти|\bopen\b|\bgo to\b|\bvisit\b).{0,60}(сайт|страниц|ссылк|браузер|site|page|link|website|browser)|\bhttps?:\/\/|\bwww\.|\b[\w-]+\.(com|ru|org|net|io|app|dev|site|me|tech)\b/i

const SETTINGS_INTENT =
  /(настрой|настроить|измени|изменить|включи|включить|выключи|выключить|переключи|открой настройк|\bsettings?\b|turn (on|off)|enable|disable|change|switch).{0,80}(windows|виндовс|параметр|настройк|setting|option|панель|control panel|экран|display|звук|sound|клавиатур|keyboard|мыш|mouse|сеть|network|bluetooth|блютуз|принтер|printer)/i

const CODE_INTENT =
  /(файл|файлы|код|скрипт|\bfile\b|\bcode\b|\bscript\b|\.(txt|md|json|js|ts|tsx|jsx|css|html|py|ps1|yml|yaml|ini|conf|log)\b|баг|\bbug\b)/i

const OPEN_VERB =
  /(открой|откройте|открыть|запусти|запустите|запустить|включи|включите|включить|\bopen\b|\blaunch\b|\bstart\b|\brun\b)/i

const ACTION_VERB =
  /(открой|откройте|открыть|запусти|запустите|запустить|включи|включите|включить|выключи|выключите|выключить|переключи|переключить|настрой|настроить|измени|измените|изменить|поменяй|поменять|перенеси|перенести|перемести|переместить|скопируй|скопировать|переименуй|переименовать|установи|установить|скачай|скачать|создай|создать|подключи|подключить|\bopen\b|\blaunch\b|\bstart\b|\brun\b|\binstall\b|\bdownload\b|\bmove\b|\bcopy\b|\brename\b|\bchange\b|\bcreate\b|\bconfigure\b|\benable\b|\bdisable\b|\bset up\b)/i

const NOT_ACTIONABLE =
  /^(что такое|что значит|объясни|объясните|расскажи|what is|what does|explain|tell me about)\b/i

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/i
const DOMAIN_PATTERN = /\b((?:[\w-]+\.)+(?:com|ru|org|net|io|app|dev|site|me|tech))(?:\/[^\s<>"']*)?/i

const APP_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  {
    id: 'cmd',
    pattern: /(командн[а-яё]*\s+строк|(?<![\p{L}\d])cmd(?![\p{L}\d])|(?<![\p{L}\d])смд(?![\p{L}\d])|command prompt)/iu
  },
  { id: 'terminal', pattern: /(терминал|windows terminal|(?<![\p{L}\d])wt(?![\p{L}\d])|(?<![\p{L}\d])wt\.exe)/iu },
  { id: 'powershell', pattern: /(powershell|пауэршелл)/iu },
  { id: 'notepad', pattern: /(блокнот|notepad)/iu },
  { id: 'calculator', pattern: /(калькулятор|calculator|(?<![\p{L}\d])calc(?![\p{L}\d]))/iu },
  { id: 'paint', pattern: /(mspaint|пейнт|(?<![\p{L}\d])paint(?![\p{L}\d]))/iu },
  { id: 'explorer', pattern: /(проводник|explorer|файловый менеджер)/iu },
  { id: 'taskmgr', pattern: /(диспетчер задач|task ?manager)/iu },
  { id: 'control', pattern: /(панель управления|control panel)/iu },
  { id: 'settings', pattern: /(параметры windows|настройки windows|windows settings|ms-settings)/iu },
  { id: 'snippingtool', pattern: /(ножницы|snipping tool)/iu }
]

export function extractUrl(text: string): string | null {
  const direct = text.match(URL_PATTERN)?.[0]
  if (direct) return direct.replace(/[),.;!?]+$/, '')
  const domain = text.match(DOMAIN_PATTERN)?.[0]
  return domain ? `https://${domain.replace(/[),.;!?]+$/, '')}` : null
}

export function matchAgentApp(text: string): string | null {
  const hit = APP_PATTERNS.find((entry) => entry.pattern.test(text))
  return hit ? hit.id : null
}

function dedupe(capabilities: AgentCapability[]): AgentCapability[] {
  return [...new Set(capabilities)]
}

export function detectAgentIntent(text: string): AgentOffer | null {
  const goal = text.trim()
  if (!goal || goal.length < 4) return null
  if (
    NOT_ACTIONABLE.test(goal) &&
    !FIX_INTENT.test(goal) &&
    !BROWSER_INTENT.test(goal) &&
    !ACTION_VERB.test(goal)
  ) {
    return null
  }

  const url = extractUrl(goal)
  if (BROWSER_INTENT.test(goal) && url) {
    return { kind: 'browse', goal, url, capabilities: ['browser'] }
  }
  if (FIX_INTENT.test(goal)) {
    const capabilities: AgentCapability[] = ['mouse', 'keyboard']
    if (CODE_INTENT.test(goal)) capabilities.push('files')
    return { kind: 'fix', goal, capabilities: dedupe(capabilities) }
  }
  if (CODE_INTENT.test(goal) && /(открой|открыть|найди|покаж|open|find|show|измени|поменяй|edit|change)/i.test(goal)) {
    return { kind: 'code', goal, capabilities: ['mouse', 'keyboard', 'files'] }
  }
  if (SETTINGS_INTENT.test(goal)) {
    return { kind: 'settings', goal, capabilities: ['mouse', 'keyboard'] }
  }
  if (OPEN_VERB.test(goal)) {
    return { kind: 'app', goal, capabilities: ['mouse', 'keyboard'] }
  }
  if (ACTION_VERB.test(goal)) {
    const capabilities: AgentCapability[] = ['mouse', 'keyboard']
    if (CODE_INTENT.test(goal)) capabilities.push('files')
    return { kind: 'action', goal, capabilities: dedupe(capabilities) }
  }
  return null
}

export function agentKindLabelKey(kind: AgentKind): string {
  return `agent.offer.${kind}`
}
