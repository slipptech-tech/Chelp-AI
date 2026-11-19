import {
  app,
  dialog,
  globalShortcut,
  nativeImage,
  Notification,
  screen,
  shell
} from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AgentAction,
  AgentKind,
  AgentPlan,
  AgentPrepared,
  AgentStep,
  ChatMessage,
  Lang,
  Provider
} from '@shared/types'
import { isProviderReady, visionProviderFor } from '@shared/providers'
import { matchAgentApp } from '@shared/agent'
import { managedOllamaInstalled, startOllama } from './ollama'
import { getStore } from './store'
import { captureForAgent } from './capture'
import { broadcast, getFloatWindow, getMainWindow } from './windows'

interface Prepared {
  id: string
  conversationId: string
  messageId: string
  kind: AgentKind
  goal: string
  url?: string
  app?: string
  launch?: string
  provider: Provider | null
  providerLabel: string
  needsScreenshot: boolean
  dataUrl?: string
  width: number
  height: number
  plan?: AgentPlan
}

const prepared = new Map<string, Prepared>()

interface RunState {
  id: string
  cancelled: boolean
  child: ChildProcess | null
}

let activeRun: RunState | null = null
let escRegistered = false

const MAX_STEPS = 10
const MAX_TEXT = 2000
const MAX_PLAN_TEXT = 1500

interface AppTarget {
  target: string
  args: string[]
  ru: string
  en: string
}

const APP_TARGETS: Record<string, AppTarget> = {
  cmd: { target: 'cmd.exe', args: ['/K'], ru: 'Командная строка', en: 'Command Prompt' },
  terminal: { target: 'wt.exe', args: [], ru: 'Терминал', en: 'Terminal' },
  powershell: {
    target: 'powershell.exe',
    args: ['-NoExit'],
    ru: 'PowerShell',
    en: 'PowerShell'
  },
  notepad: { target: 'notepad.exe', args: [], ru: 'Блокнот', en: 'Notepad' },
  calculator: { target: 'calc.exe', args: [], ru: 'Калькулятор', en: 'Calculator' },
  paint: { target: 'mspaint.exe', args: [], ru: 'Paint', en: 'Paint' },
  explorer: { target: 'explorer.exe', args: [], ru: 'Проводник', en: 'File Explorer' },
  taskmgr: { target: 'taskmgr.exe', args: [], ru: 'Диспетчер задач', en: 'Task Manager' },
  control: { target: 'control.exe', args: [], ru: 'Панель управления', en: 'Control Panel' },
  settings: { target: 'ms-settings:', args: [], ru: 'Параметры Windows', en: 'Windows Settings' },
  snippingtool: { target: 'snippingtool.exe', args: [], ru: 'Ножницы', en: 'Snipping Tool' }
}

const APP_EXTRA_ACTION =
  /(введи|ввод|напиши|напечатай|выполни|проверь|найди|перейди|покажи|скопируй|вставь|загруз|и\s+(открой|нажми|выбери)|затем|потом|после этого|\btype\b|\benter\b|\bexecute\b|\bwrite\b|\bsend\b|\bpaste\b|\bfind\b|\bnavigate\b|\bthen\b|\bafter\b)/iu

function appEntry(id: string | undefined): AppTarget | null {
  if (!id) return null
  return APP_TARGETS[id] ?? null
}

const WINDOWS_ROOT = process.env.SystemRoot ?? 'C:\\Windows'

const APP_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._+()'-]{0,79}$/u

const SHELL_APPS = new Set(['powershell', 'cmd', 'terminal'])

const START_MENU_DIRS = [
  path.join(
    process.env.ProgramData ?? 'C:\\ProgramData',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  ),
  path.join(
    process.env.APPDATA ?? '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  )
].filter((dir) => dir && fs.existsSync(dir))

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya'
}

function labelTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[а-яё]/g, (char) => TRANSLIT[char] ?? char)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function matchScore(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return 0
  let matched = 0
  for (const token of needle) {
    if (haystack.includes(token)) matched += 1
  }
  return matched / needle.length
}

const APP_ALIASES: Record<string, string> = {
  дискорд: 'Discord',
  телега: 'Telegram',
  телеграм: 'Telegram',
  хром: 'Google Chrome',
  стим: 'Steam',
  спотифай: 'Spotify',
  скайп: 'Skype',
  ватсап: 'WhatsApp',
  вотсап: 'WhatsApp',
  тимс: 'Microsoft Teams',
  зум: 'Zoom',
  обсидиан: 'Obsidian',
  нотион: 'Notion',
  фотошоп: 'Photoshop',
  эксель: 'Excel',
  ворд: 'Word',
  реестр: 'regedit',
  'редактор реестра': 'regedit',
  registry: 'regedit',
  'registry editor': 'regedit',
  'диспетчер устройств': 'devmgmt.msc',
  'device manager': 'devmgmt.msc',
  'сведения о системе': 'msinfo32.exe',
  'system information': 'msinfo32.exe',
  'удалённый рабочий стол': 'mstsc.exe',
  'remote desktop': 'mstsc.exe'
}

function resolveAlias(name: string): string {
  return APP_ALIASES[name.trim().toLowerCase()] ?? name
}

function sanitizeAppName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (name.length < 2 || !APP_NAME_PATTERN.test(name)) return null
  return name
}

function systemExe(name: string): string {
  return path.join(WINDOWS_ROOT, 'System32', name)
}

function resolveExecutable(target: string): string {
  if (path.isAbsolute(target) || target.includes(path.sep)) return target
  for (const dir of [path.join(WINDOWS_ROOT, 'System32'), WINDOWS_ROOT]) {
    const candidate = path.join(dir, target)
    if (fs.existsSync(candidate)) return candidate
  }
  return target
}

function spawnDetached(target: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    try {
      child = spawn(resolveExecutable(target), args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
    } catch {
      reject(new Error('spawn_failed'))
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      reject(new Error('spawn_failed'))
    }, 12000)
    child.once('spawn', () => {
      clearTimeout(timer)
      child.unref()
      resolve()
    })
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('spawn_failed'))
    })
  })
}

async function launchDetached(target: string, args: string[] = []): Promise<void> {
  const file = resolveExecutable(target)
  if (path.isAbsolute(file) && fs.existsSync(file)) {
    const error = await shell.openPath(file)
    if (!error) return
  }
  await spawnDetached(file, args)
}

function execText(file: string, args: string[], timeout = 4000): Promise<string> {
  return new Promise((resolve) => {
    let output = ''
    let done = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (): void => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      resolve(output)
    }
    let child: ChildProcess
    try {
      child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      finish()
      return
    }
    timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish()
    }, timeout)
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf-8')
    })
    child.once('error', finish)
    child.once('close', finish)
  })
}

const LAUNCHABLE_FILES = /\.(exe|msc|cpl)$/i

async function findInstalledExecutable(name: string): Promise<string | null> {
  const bare = name.replace(/\.exe$/i, '')
  const queries = /\.(msc|cpl)$/i.test(bare) ? [bare] : [`${bare}.exe`, bare]
  for (const query of queries) {
    const whereOut = await execText(systemExe('where.exe'), [query])
    const whereHit = whereOut
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => LAUNCHABLE_FILES.test(line) && fs.existsSync(line))
    if (whereHit) return whereHit
  }
  if (/\.(msc|cpl)$/i.test(bare)) return null
  const keys = [
    `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${bare}.exe`,
    `HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${bare}.exe`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${bare}.exe`
  ]
  for (const key of keys) {
    const out = await execText(systemExe('reg.exe'), ['query', key, '/ve'])
    const line = out.split(/\r?\n/).find((row) => /REG_SZ/i.test(row))
    const value = line?.split(/REG_SZ\s+/i)[1]?.trim().replace(/^"|"$/g, '')
    if (value && fs.existsSync(value)) return value
  }
  return null
}

function findStartMenuShortcut(name: string): string | null {
  const needle = labelTokens(name)
  if (needle.length === 0) return null
  const candidates: Array<{ path: string; score: number; exact: boolean; length: number }> = []
  let visited = 0
  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || visited > 4000) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      visited += 1
      if (visited > 4000) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.lnk')) continue
      const base = labelTokens(entry.name.slice(0, -4))
      if (base.length === 0) continue
      const score = matchScore(base, needle)
      if (score === 0 || (needle.length > 1 && score < 1)) continue
      candidates.push({
        path: full,
        score,
        exact: score === 1 && base.length === needle.length,
        length: base.join('').length
      })
    }
  }
  for (const dir of START_MENU_DIRS) walk(dir, 0)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    return a.length - b.length
  })
  return candidates[0].path
}

function usableStartAppId(id: string): boolean {
  if (!id) return false
  if (/^https?:/i.test(id)) return false
  if (/^[a-z]:\\/i.test(id) || /\.exe$/i.test(id)) return fs.existsSync(id)
  return /^[\w.!-]+$/i.test(id)
}

async function findStartMenuApp(name: string): Promise<{ name: string; id: string } | null> {
  const needle = labelTokens(name)
  if (needle.length === 0) return null
  const script =
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | ForEach-Object { $_.Name + [char]124 + $_.AppID }"
  const out = await execText(
    psBinary(),
    ['-NoProfile', '-NonInteractive', '-Command', script],
    8000
  )
  const candidates: Array<{ name: string; id: string; score: number; exact: boolean; length: number }> = []
  for (const line of out.split(/\r?\n/)) {
    const text = line.trim()
    const at = text.lastIndexOf('|')
    if (at <= 0) continue
    const id = text.slice(at + 1)
    if (!usableStartAppId(id)) continue
    const appName = text.slice(0, at)
    const base = labelTokens(appName)
    const score = matchScore(base, needle)
    if (score === 0 || (needle.length > 1 && score < 1)) continue
    candidates.push({
      name: appName,
      id,
      score,
      exact: score === 1 && base.length === needle.length,
      length: base.join('').length
    })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    return a.length - b.length
  })
  return { name: candidates[0].name, id: candidates[0].id }
}

async function launchApp(raw: string): Promise<void> {
  const clean = sanitizeAppName(raw)
  if (!clean) throw new Error('blocked_app')
  const name = resolveAlias(clean)
  const exe = await findInstalledExecutable(name)
  if (exe) {
    if (/\.exe$/i.test(exe)) {
      await launchDetached(exe)
    } else {
      const error = await shell.openPath(exe)
      if (error) throw new Error('app_not_found')
    }
    return
  }
  const shortcut = findStartMenuShortcut(name)
  if (shortcut) {
    const error = await shell.openPath(shortcut)
    if (!error) return
  }
  const startApp = await findStartMenuApp(name)
  if (startApp) {
    if (/^[a-z]:\\/i.test(startApp.id) || /\.exe$/i.test(startApp.id)) {
      await launchDetached(startApp.id)
    } else {
      try {
        await shell.openExternal(`shell:AppsFolder\\${startApp.id}`)
      } catch {
        throw new Error('app_not_found')
      }
    }
    return
  }
  throw new Error('app_not_found')
}

async function isAppAvailable(raw: string): Promise<boolean> {
  const name = resolveAlias(raw)
  if (matchAgentApp(name)) return true
  if (await findInstalledExecutable(name)) return true
  if (findStartMenuShortcut(name)) return true
  return Boolean(await findStartMenuApp(name))
}

function extractLaunchName(goal: string): string | null {
  const match = goal
    .trim()
    .match(
      /^(?:chelp[,\s]+|пожалуйста[,\s]+|плиз[,\s]+|please[,\s]+)?(?:открой|откройте|открыть|запусти|запустите|запустить|включи|включите|\bopen\b|\blaunch\b|\bstart\b|\brun\b)\s+(?:приложение\s+|прогу\s+|программу\s+|app\s+|the\s+)?(.+)$/iu
    )
  if (!match) return null
  let rest = match[1].replace(/[.!?]+$/g, '').trim()
  for (;;) {
    const next = rest
      .replace(/^(?:мне|для меня|на компьютере|на компе|пожалуйста|плиз|please)\s+/iu, '')
      .replace(/\s+(?:пожалуйста|плиз|please)$/iu, '')
      .trim()
    if (next === rest) break
    rest = next
  }
  const name = sanitizeAppName(rest)
  return name ? resolveAlias(name) : null
}

function stripUnrequestedShells(actions: AgentAction[], goal: string): AgentAction[] {
  const requested = matchAgentApp(goal)
  if (requested && SHELL_APPS.has(requested)) return actions
  const opensShell = actions.some(
    (action) => action.kind === 'open_app' && action.app && SHELL_APPS.has(action.app)
  )
  return opensShell ? [{ kind: 'finish' }] : actions
}

const AGENT_PLAN_PROMPT = `You are the action planner of Chelp AI, a Windows desktop assistant.
The user asked Chelp to help with a task on their computer. You get a screenshot of their primary display.

Work like a careful technician: first read what is actually on screen (error text, dialogs, which app is focused), decide the shortest reliable way to solve the task, then return the concrete steps.

Return ONLY valid JSON, no markdown, no commentary, with this shape:
{"goal":"short restatement","risk":"low"|"medium","steps":[{"kind":"move|click|double_click|right_click|type|press|scroll|wait|open_url|open_app|edit_file|finish","x":0.0,"y":0.0,"text":"","keys":"","amount":0,"url":"","app":"","path":"","find":"","replace":"","note":"short action description"}]}

Rules:
- Screenshot coordinates are normalized: x and y from 0.0 to 1.0, origin at the top-left of the image.
- Use 2-8 steps. Always end with a finish step.
- Choose the most reliable route: open_app to launch an app, open_url with an exact settings page to reach a setting, press for well-known shortcuts, clicks only on elements clearly visible in the screenshot.
- If the needed window or app is already open on screen, use it instead of launching another copy.
- After an action that changes the screen (opening a window or menu, pressing keys), add a wait step of 600-1500 ms before interacting with the new state.
- Keep one action per step and write "note" in the language of the user request, describing the action for the user without technical coordinates.
- To launch a program use one open_app step with "app" set to the program name as it appears in the Start menu or its exe name, for example "Telegram", "Chrome", "Discord", "regedit", "devmgmt.msc". Chelp launches it directly, so never open PowerShell, Command Prompt or Terminal to start another program and never simulate the Start menu.
- Built-in targets Chelp knows: {{APPS}}. Only open a shell when the user explicitly asks for it or needs an interactive console.
- The Win key is not available, so never plan press sequences that need it.
- open_url accepts full http(s) links or official Windows Settings pages, for example ms-settings:windowsupdate, ms-settings:display, ms-settings:network, ms-settings:privacy, ms-settings:appsfeatures, ms-settings:sound, ms-settings:bluetooth, ms-settings:defaultapps.
- For repair tasks, name the real cause in goal and notes and use built-in Windows tools; do not install unknown software.
- Never run destructive or irreversible commands, never delete files, never touch system folders, never close apps with unsaved work.
- Never type passwords, API keys, payment data or personal secrets.
- Only use edit_file when a file was provided below and a minimal find/replace is enough. Never invent file contents.
- Do not click Chelp AI windows or anything about Chelp AI itself.
- If the screen does not allow a step, skip it and explain why in note instead of guessing coordinates.`

const KEY_CODES: Record<string, number> = {
  enter: 0x0d,
  tab: 0x09,
  esc: 0x1b,
  escape: 0x1b,
  backspace: 0x08,
  delete: 0x2e,
  space: 0x20,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22
}
const MODIFIER_CODES: Record<string, number> = { ctrl: 0x11, control: 0x11, alt: 0x12, shift: 0x10 }
const BLOCKED_TEXT =
  /(format\s+[a-z]:|diskpart|bcdedit|shutdown\s|del\s+\/[sq]|rd\s+\/s|rmdir\s+\/s|reg\s+delete|Remove-Item[^\n]*-Recurse|cipher\s+\/w|Set-MpPreference|DisableRealtimeMonitoring|vssadmin\s+delete|taskkill\s+\/f\s+\/im\s+explorer)/i
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.py',
  '.ps1',
  '.yml',
  '.yaml',
  '.ini',
  '.conf',
  '.log'
])

const INPUT_SCRIPT = String.raw`param([string]$Encoded)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ChelpAgentInput {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  public static void TypeText(string text) {
    foreach (char c in text) {
      INPUT down = new INPUT();
      down.type = 1;
      down.U.ki = new KEYBDINPUT();
      down.U.ki.wScan = (ushort)c;
      down.U.ki.dwFlags = 4;
      INPUT up = new INPUT();
      up.type = 1;
      up.U.ki = new KEYBDINPUT();
      up.U.ki.wScan = (ushort)c;
      up.U.ki.dwFlags = 6;
      SendInput(1, new INPUT[] { down }, Marshal.SizeOf(typeof(INPUT)));
      SendInput(1, new INPUT[] { up }, Marshal.SizeOf(typeof(INPUT)));
      System.Threading.Thread.Sleep(6);
    }
  }
}
"@
try { [ChelpAgentInput]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}
$data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Encoded)) | ConvertFrom-Json
function Move-To([int]$x, [int]$y) {
  $p = [System.Windows.Forms.Cursor]::Position
  for ($i = 1; $i -le 12; $i++) {
    [ChelpAgentInput]::SetCursorPos([int]($p.X + ($x - $p.X) * $i / 12), [int]($p.Y + ($y - $p.Y) * $i / 12)) | Out-Null
    Start-Sleep -Milliseconds 10
  }
  [ChelpAgentInput]::SetCursorPos($x, $y) | Out-Null
}
switch ($data.action) {
  'move' { Move-To ([int]$data.x) ([int]$data.y) }
  'click' {
    Move-To ([int]$data.x) ([int]$data.y)
    Start-Sleep -Milliseconds 90
    $flag = 2
    if ($data.button -eq 'right') { $flag = 8 }
    [ChelpAgentInput]::mouse_event($flag, 0, 0, 0, [UIntPtr]::Zero)
    [ChelpAgentInput]::mouse_event($flag * 2, 0, 0, 0, [UIntPtr]::Zero)
    if ($data.double -eq $true) {
      Start-Sleep -Milliseconds 70
      [ChelpAgentInput]::mouse_event($flag, 0, 0, 0, [UIntPtr]::Zero)
      [ChelpAgentInput]::mouse_event($flag * 2, 0, 0, 0, [UIntPtr]::Zero)
    }
  }
  'scroll' { [ChelpAgentInput]::mouse_event(0x0800, 0, 0, [uint32]([int]$data.amount * 120), [UIntPtr]::Zero) }
  'type' { [ChelpAgentInput]::TypeText([string]$data.text) }
  'keys' {
    $codes = @($data.codes)
    foreach ($code in $codes) { [ChelpAgentInput]::keybd_event([byte]$code, 0, 0, [UIntPtr]::Zero) }
    Start-Sleep -Milliseconds 40
    [array]::Reverse($codes)
    foreach ($code in $codes) { [ChelpAgentInput]::keybd_event([byte]$code, 0, 2, [UIntPtr]::Zero) }
  }
}
Write-Output 'ok'`

function inputScriptPath(): string {
  const dir = path.join(app.getPath('userData'), 'agent')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'input.ps1')
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== INPUT_SCRIPT) {
    fs.writeFileSync(file, INPUT_SCRIPT, 'utf-8')
  }
  return file
}

function isAllowedKeyCombo(combo: string): number[] | null {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length || parts.length > 3) return null
  const codes: number[] = []
  const key = parts.pop() as string
  for (const modifier of parts) {
    const code = MODIFIER_CODES[modifier]
    if (!code) return null
    codes.push(code)
  }
  if (key === 'win' || key === 'windows' || key === 'meta' || key === 'cmd') return null
  if (key === 'f4' && parts.includes('alt')) return null
  if (/^f([1-9]|1[0-2])$/.test(key)) {
    codes.push(0x6f + Number(key.slice(1)))
  } else if (KEY_CODES[key] !== undefined) {
    codes.push(KEY_CODES[key])
  } else if (/^[a-z0-9]$/.test(key)) {
    codes.push(key.toUpperCase().charCodeAt(0))
  } else {
    return null
  }
  return codes
}

function isBlockedTyping(text: string): boolean {
  return BLOCKED_TEXT.test(text)
}

function allowedFilePath(value: string): string | null {
  try {
    const resolved = path.resolve(value)
    const home = app.getPath('home').toLowerCase()
    const lower = resolved.toLowerCase()
    if (process.platform === 'win32' && !lower.startsWith(home + path.sep)) return null
    if (lower.includes(`${path.sep}appdata${path.sep}`)) return null
    if (lower.startsWith(app.getPath('userData').toLowerCase())) return null
    if (!TEXT_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return null
    if (!fs.existsSync(resolved)) return null
    if (fs.statSync(resolved).size > 512 * 1024) return null
    return resolved
  } catch {
    return null
  }
}

function detectFileInGoal(goal: string): string | null {
  const matches = goal.match(/[A-Za-z]:\\[^\n"'<>|?*]+/g) ?? []
  for (const match of matches) {
    const file = allowedFilePath(match.trim())
    if (file) return file
  }
  return null
}

function providerForAgent(): Provider | null {
  const settings = getStore().settings
  if (settings.providers.length === 0) return null
  return visionProviderFor(settings.providers, settings.activeProviderId, settings.autoSwitchProvider) ?? null
}

function label(provider: Provider | null): string {
  return provider ? `${provider.name} · ${provider.model}` : 'AI'
}

function endpointFor(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

function imagePayload(dataUrl: string): string {
  try {
    const image = nativeImage.createFromDataURL(dataUrl)
    const size = image.getSize()
    const resized = size.width > 1440 ? image.resize({ width: 1440, quality: 'good' }) : image
    return `data:image/jpeg;base64,${resized.toJPEG(85).toString('base64')}`
  } catch {
    return dataUrl
  }
}

async function requestPlanText(provider: Provider, dataUrl: string, prompt: string): Promise<string> {
  if (provider.kind === 'local') {
    if (managedOllamaInstalled()) {
      const runtime = await startOllama()
      if (!runtime.ok) throw new Error('local_down')
    }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.apiKey.trim()) headers.Authorization = `Bearer ${provider.apiKey}`
  if (provider.kind === 'openrouter') {
    headers['HTTP-Referer'] = 'https://chelp.app'
    headers['X-Title'] = 'Chelp AI'
  }
  const res = await fetch(endpointFor(provider.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.1,
      max_tokens: Math.max(600, Math.min(provider.maxTokens, 1200)),
      stream: false,
      messages: [
        { role: 'system', content: AGENT_PLAN_PROMPT.replace('{{APPS}}', Object.keys(APP_TARGETS).join(', ')) },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imagePayload(dataUrl) } }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(provider.kind === 'local' ? 180000 : 60000)
  })
  if (!res.ok) throw new Error(`provider_${res.status}`)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content ?? ''
}

function parseJsonPlan(raw: string): unknown {
  const fenced = raw.replace(/```(?:json)?/gi, '').trim()
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('bad_plan')
  return JSON.parse(fenced.slice(start, end + 1))
}

function clamp01(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  const normalized = number > 1 ? number / 100 : number
  if (normalized < 0 || normalized > 1) return null
  return normalized
}

function sanitizeSteps(raw: unknown): AgentAction[] {
  if (!raw || typeof raw !== 'object') throw new Error('bad_plan')
  const list = (raw as { steps?: unknown[] }).steps
  if (!Array.isArray(list) || list.length === 0) throw new Error('bad_plan')
  const actions: AgentAction[] = []
  for (const item of list.slice(0, MAX_STEPS)) {
    if (!item || typeof item !== 'object') continue
    const source = item as Record<string, unknown>
    const kind = String(source.kind ?? '')
    const note = typeof source.note === 'string' ? source.note.slice(0, 240) : undefined
    if (kind === 'finish') {
      actions.push({ kind: 'finish', note })
      break
    }
    if (kind === 'click' || kind === 'double_click' || kind === 'right_click' || kind === 'move') {
      const x = clamp01(source.x)
      const y = clamp01(source.y)
      if (x === null || y === null) continue
      actions.push({ kind, x, y, note })
      continue
    }
    if (kind === 'type') {
      const text = typeof source.text === 'string' ? source.text.slice(0, MAX_PLAN_TEXT) : ''
      if (!text.trim()) continue
      actions.push({ kind, text, note })
      continue
    }
    if (kind === 'press') {
      const keys = typeof source.keys === 'string' ? source.keys : ''
      const codes = isAllowedKeyCombo(keys)
      if (!codes) continue
      actions.push({ kind, keys, note })
      continue
    }
    if (kind === 'scroll') {
      const amount = Number(source.amount)
      if (!Number.isFinite(amount) || amount === 0) continue
      actions.push({ kind, amount: Math.max(-6, Math.min(6, Math.round(amount))), note })
      continue
    }
    if (kind === 'wait') {
      const amount = Number(source.amount)
      actions.push({ kind, amount: Math.max(300, Math.min(3000, Math.round(amount) || 800)), note })
      continue
    }
    if (kind === 'open_url') {
      const url = typeof source.url === 'string' ? source.url.trim() : ''
      if (!/^(https?:\/\/|ms-settings:)[^\s]+$/i.test(url) || url.length > 2000) continue
      actions.push({ kind, url, note })
      continue
    }
    if (kind === 'open_app') {
      const known = typeof source.app === 'string' ? matchAgentApp(source.app) : null
      const app = known ?? sanitizeAppName(source.app)
      if (!app) continue
      if (known && !appEntry(known)) continue
      actions.push({ kind, app, note })
      continue
    }
    if (kind === 'edit_file') {
      const file = typeof source.path === 'string' ? allowedFilePath(source.path) : null
      const find = typeof source.find === 'string' ? source.find : ''
      const replace = typeof source.replace === 'string' ? source.replace : ''
      if (!file || !find) continue
      actions.push({ kind, path: file, find: find.slice(0, 4000), replace: replace.slice(0, 4000), note })
      continue
    }
  }
  if (!actions.some((action) => action.kind === 'finish')) actions.push({ kind: 'finish' })
  return actions
}

function riskFor(actions: AgentAction[]): 'low' | 'medium' {
  return actions.some((action) => action.kind === 'edit_file' || action.kind === 'press')
    ? 'medium'
    : 'low'
}

function buildSteps(actions: AgentAction[]): AgentStep[] {
  return actions.map((action, index) => ({ index, action, status: 'pending' }))
}

export async function prepareAgent(input: {
  conversationId: string
  messageId: string
  goal: string
  kind: AgentKind
  url?: string
}): Promise<AgentPrepared | { error: string }> {
  const settings = getStore().settings
  for (const existing of prepared.values()) {
    if (existing.conversationId === input.conversationId && existing.messageId === input.messageId) {
      return {
        id: existing.id,
        preview: existing.dataUrl ?? null,
        width: existing.width,
        height: existing.height,
        providerLabel: existing.providerLabel,
        needsScreenshot: existing.needsScreenshot
      }
    }
  }
  const matchedApp =
    input.kind === 'app' || input.kind === 'settings' ? matchAgentApp(input.goal) : null
  const simpleLaunch = !APP_EXTRA_ACTION.test(input.goal)
  const app = matchedApp && simpleLaunch ? matchedApp : null
  let launch: string | null = null
  if (!app && input.kind === 'app' && simpleLaunch) {
    const candidate = extractLaunchName(input.goal)
    if (candidate && (await isAppAvailable(candidate))) launch = candidate
  }
  const needsVision = input.kind !== 'browse' && !app && !launch
  const provider = needsVision ? providerForAgent() : null
  if (needsVision) {
    if (!provider) return { error: 'no_vision' }
    if (!isProviderReady(provider)) return { error: provider.kind === 'local' ? 'local_down' : 'no_key' }
  }
  let shot: { dataUrl: string; width: number; height: number } | null = null
  if (needsVision) {
    shot = await captureForAgent()
    if (!shot) return { error: 'capture_failed' }
  }
  if (prepared.size >= 6) prepared.delete(prepared.keys().next().value as string)
  const id = crypto.randomUUID()
  const providerLabel = app || launch ? 'Chelp AI' : label(provider ?? settings.providers[0] ?? null)
  prepared.set(id, {
    id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    kind: input.kind,
    goal: input.goal.slice(0, 1500),
    url: input.url,
    app: app ?? undefined,
    launch: launch ?? undefined,
    provider,
    providerLabel,
    needsScreenshot: needsVision,
    dataUrl: shot?.dataUrl,
    width: shot?.width ?? 0,
    height: shot?.height ?? 0
  })
  return {
    id,
    preview: shot?.dataUrl ?? null,
    width: shot?.width ?? 0,
    height: shot?.height ?? 0,
    providerLabel,
    needsScreenshot: needsVision
  }
}

export async function buildAgentPlan(
  id: string,
  lang: Lang
): Promise<AgentPlan | { error: string }> {
  const pending = prepared.get(id)
  if (!pending) return { error: 'expired' }
  if (pending.plan) return pending.plan

  if (pending.kind === 'browse' && pending.url) {
    const actions: AgentAction[] = [
      { kind: 'open_url', url: pending.url, note: lang === 'ru' ? 'Открываю сайт' : 'Opening the site' },
      { kind: 'finish' }
    ]
    const plan: AgentPlan = {
      id,
      goal: pending.goal,
      kind: pending.kind,
      risk: 'low',
      steps: buildSteps(actions),
      providerLabel: pending.providerLabel
    }
    pending.plan = plan
    return plan
  }

  if ((pending.kind === 'app' || pending.kind === 'settings') && pending.app) {
    const entry = appEntry(pending.app)
    if (entry) {
      const actions: AgentAction[] = [
        {
          kind: 'open_app',
          app: pending.app,
          note: lang === 'ru' ? `Запускаю: ${entry.ru}` : `Launching ${entry.en}`
        },
        { kind: 'finish' }
      ]
      const plan: AgentPlan = {
        id,
        goal: pending.goal,
        kind: pending.kind,
        risk: 'low',
        steps: buildSteps(actions),
        providerLabel: pending.providerLabel
      }
      pending.plan = plan
      return plan
    }
  }

  if (pending.kind === 'app' && pending.launch) {
    const actions: AgentAction[] = [
      {
        kind: 'open_app',
        app: pending.launch,
        note: lang === 'ru' ? `Запускаю: ${pending.launch}` : `Launching ${pending.launch}`
      },
      { kind: 'finish' }
    ]
    const plan: AgentPlan = {
      id,
      goal: pending.goal,
      kind: pending.kind,
      risk: 'low',
      steps: buildSteps(actions),
      providerLabel: pending.providerLabel
    }
    pending.plan = plan
    return plan
  }

  const provider = pending.provider
  if (!provider || !pending.dataUrl) return { error: 'no_vision' }
  const store = getStore()
  const conversation = store.getConversation(pending.conversationId)
  const advice =
    conversation?.messages
      .filter((message) => message.role === 'assistant')
      .slice(-1)[0]?.content?.slice(0, 3000) ?? ''
  const file = detectFileInGoal(`${pending.goal}\n${advice}`)
  let fileContext = ''
  if (file) {
    try {
      const content = fs.readFileSync(file, 'utf-8').slice(0, 60000)
      fileContext = `\n\nA file was provided by the user. Path: ${file}\nCurrent content:\n<<<\n${content}\n>>>`
    } catch {
      fileContext = `\n\nThe user mentioned this file, but it could not be read: ${file}`
    }
  }
  const language = lang === 'ru' ? 'Russian' : 'English'
  const prompt = `User request:\n${pending.goal}\n\nChelp's written answer (for context):\n${advice || '(none)'}${fileContext}\n\nWrite all step notes in ${language}. Return only the JSON plan.`
  let lastError = 'plan_failed'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const input =
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour previous reply was rejected. Reply with a single valid JSON object only, using the allowed actions and coordinates. Never open PowerShell, Command Prompt or Terminal and never type shell commands to start a program: Chelp launches programs directly with one open_app step and the program name, for example {"kind":"open_app","app":"Telegram"}.`
      const raw = await requestPlanText(provider, pending.dataUrl, input)
      const parsed = parseJsonPlan(raw)
      const actions = stripUnrequestedShells(sanitizeSteps(parsed), pending.goal)
      if (!actions.some((action) => action.kind !== 'finish' && action.kind !== 'wait')) {
        throw new Error('empty_plan')
      }
      const riskRaw = (parsed as { risk?: unknown }).risk
      const risk = riskRaw === 'medium' ? 'medium' : riskFor(actions)
      const plan: AgentPlan = {
        id,
        goal: pending.goal,
        kind: pending.kind,
        risk,
        steps: buildSteps(actions),
        providerLabel: pending.providerLabel
      }
      pending.plan = plan
      return plan
    } catch (error) {
      const message = error instanceof Error ? error.message : 'plan_failed'
      lastError = /json|unexpected token/i.test(message) ? 'bad_plan' : message
      if (lastError !== 'bad_plan' && lastError !== 'empty_plan') break
    }
  }
  return { error: lastError }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function psBinary(): string {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function runInput(payload: Record<string, unknown>, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    let encoded = ''
    try {
      encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
    } catch {
      reject(new Error('encode_failed'))
      return
    }
    let child: ChildProcess
    try {
      child = spawn(
        psBinary(),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', inputScriptPath(), '-Encoded', encoded],
        { windowsHide: true }
      )
    } catch {
      reject(new Error('spawn_failed'))
      return
    }
    if (activeRun) activeRun.child = child
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      reject(new Error('input_timeout'))
    }, timeoutMs)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', () => {
      clearTimeout(timer)
      reject(new Error('spawn_failed'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (activeRun && activeRun.child === child) activeRun.child = null
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `input_exit_${code}`))
    })
  })
}

function absolutePoint(x: number, y: number): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const sx = Math.round((display.bounds.x + x * display.bounds.width) * display.scaleFactor)
  const sy = Math.round((display.bounds.y + y * display.bounds.height) * display.scaleFactor)
  return { x: sx, y: sy }
}

async function executeAction(action: AgentAction, lang: Lang): Promise<void> {
  if (activeRun?.cancelled) throw new Error('cancelled')
  switch (action.kind) {
    case 'finish':
      return
    case 'wait':
      await sleep(action.amount ?? 800)
      return
    case 'open_url': {
      if (!action.url || !/^(https?:\/\/|ms-settings:)/i.test(action.url)) throw new Error('blocked_url')
      await shell.openExternal(action.url)
      await sleep(900)
      return
    }
    case 'open_app': {
      const entry = appEntry(action.app)
      if (entry) {
        if (entry.target.endsWith(':')) {
          await shell.openExternal(entry.target)
        } else {
          try {
            await launchDetached(entry.target, entry.args)
          } catch {
            if (entry.target === 'wt.exe') await launchDetached('cmd.exe', ['/K'])
            else throw new Error('spawn_failed')
          }
        }
      } else if (action.app) {
        await launchApp(action.app)
      } else {
        throw new Error('blocked_app')
      }
      await sleep(1200)
      return
    }
    case 'edit_file': {
      if (!action.path || !action.find) throw new Error('blocked_file')
      const file = allowedFilePath(action.path)
      if (!file) throw new Error('blocked_file')
      const before = fs.readFileSync(file, 'utf-8')
      const hits = before.split(action.find).length - 1
      if (hits === 0) throw new Error('find_not_found')
      const ru = lang === 'ru'
      const answer = await dialog.showMessageBox({
        type: 'warning',
        buttons: [ru ? 'Изменить файл' : 'Edit file', ru ? 'Отмена' : 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: ru ? 'Chelp AI · изменение файла' : 'Chelp AI · file edit',
        message: file,
        detail: ru
          ? `Будет заменено вхождений: ${hits}. Рядом создаётся резервная копия.\n\nБыло:\n${action.find.slice(0, 300)}\n\nСтанет:\n${action.replace?.slice(0, 300) ?? ''}`
          : `Matches to replace: ${hits}. A backup copy will be created next to the file.\n\nBefore:\n${action.find.slice(0, 300)}\n\nAfter:\n${action.replace?.slice(0, 300) ?? ''}`
      })
      if (answer.response !== 0) throw new Error('cancelled')
      const backup = `${file}.chelp-backup-${Date.now()}`
      fs.copyFileSync(file, backup)
      const after = before.split(action.find).join(action.replace ?? '')
      fs.writeFileSync(file, after, 'utf-8')
      return
    }
    case 'move': {
      const point = absolutePoint(action.x ?? 0.5, action.y ?? 0.5)
      await runInput({ action: 'move', x: point.x, y: point.y })
      return
    }
    case 'click':
    case 'double_click':
    case 'right_click': {
      const point = absolutePoint(action.x ?? 0.5, action.y ?? 0.5)
      await runInput({
        action: 'click',
        x: point.x,
        y: point.y,
        button: action.kind === 'right_click' ? 'right' : 'left',
        double: action.kind === 'double_click'
      })
      return
    }
    case 'scroll': {
      await runInput({ action: 'scroll', amount: action.amount ?? -2 })
      return
    }
    case 'type': {
      const text = action.text ?? ''
      if (!text.trim() || text.length > MAX_TEXT) throw new Error('blocked_text')
      if (isBlockedTyping(text)) throw new Error('blocked_text')
      await runInput({ action: 'type', text }, 30000)
      return
    }
    case 'press': {
      const codes = isAllowedKeyCombo(action.keys ?? '')
      if (!codes) throw new Error('blocked_keys')
      await runInput({ action: 'keys', codes })
      return
    }
    default:
      throw new Error('bad_action')
  }
}

let runToken = 0

export async function runAgent(id: string, lang: Lang): Promise<{ ok: boolean; error?: string }> {
  const pending = prepared.get(id)
  if (!pending?.plan) return { ok: false, error: 'no_plan' }
  if (activeRun) return { ok: false, error: 'busy' }
  const plan = pending.plan
  const run: RunState = { id, cancelled: false, child: null }
  activeRun = run
  const token = ++runToken
  const main = getMainWindow()
  const float = getFloatWindow()
  const floatWasVisible = Boolean(float?.isVisible())
  const mainWasVisible = Boolean(main && !main.isDestroyed() && main.isVisible())
  let totalExecuted = 0
  let failure = ''

  try {
    escRegistered = globalShortcut.register('Escape', () => {
      run.cancelled = true
      try {
        run.child?.kill()
      } catch {
        /* ignore */
      }
    })
  } catch {
    escRegistered = false
  }
  if (escRegistered) {
    if (float && floatWasVisible) float.hide()
    if (main && mainWasVisible && !main.isDestroyed()) main.minimize()
  }
  const ru = lang === 'ru'
  if (Notification.isSupported()) {
    new Notification({
      title: ru ? 'Chelp AI выполняет план' : 'Chelp AI is running the plan',
      body: ru ? 'Esc — остановить. Не двигайте мышью.' : 'Press Esc to stop. Do not move the mouse.'
    }).show()
  }

  broadcast('agent:run', {
    id,
    status: 'running',
    step: 0,
    total: plan.steps.length
  })

  try {
    for (const step of plan.steps) {
      if (run.cancelled) break
      if (step.action.kind === 'finish') {
        step.status = 'done'
        broadcast('agent:step', { id, step: { ...step }, total: plan.steps.length })
        continue
      }
      step.status = 'running'
      broadcast('agent:step', { id, step: { ...step }, total: plan.steps.length })
      try {
        await executeAction(step.action, lang)
        if (run.cancelled) {
          step.status = 'skipped'
          step.detail = 'cancelled'
        } else {
          step.status = 'done'
          totalExecuted += 1
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'step_failed'
        if (message === 'cancelled' || run.cancelled) {
          step.status = 'skipped'
          step.detail = 'cancelled'
        } else {
          step.status = 'failed'
          step.detail = message
          failure = message
        }
      }
      broadcast('agent:step', { id, step: { ...step }, total: plan.steps.length })
      if (failure) break
      await sleep(450)
    }
  } finally {
    if (escRegistered) {
      globalShortcut.unregister('Escape')
      escRegistered = false
    }
    if (float && floatWasVisible && !float.isDestroyed()) float.showInactive()
    if (main && mainWasVisible && !main.isDestroyed()) {
      main.restore()
      main.show()
      main.focus()
    }
    activeRun = null
  }

  const cancelled = run.cancelled
  const status = cancelled ? 'cancelled' : failure ? 'error' : 'done'
  broadcast('agent:run', {
    id,
    status,
    step: totalExecuted,
    total: plan.steps.length,
    message: failure || undefined
  })

  await appendResultMessage(pending, plan, lang, status, failure, token)

  prepared.delete(id)
  return status === 'error' ? { ok: false, error: failure } : { ok: true }
}

async function appendResultMessage(
  pending: Prepared,
  plan: AgentPlan,
  lang: Lang,
  status: 'done' | 'cancelled' | 'error',
  failure: string,
  token: number
): Promise<void> {
  const ru = lang === 'ru'
  let content = ''
  if (status === 'done') {
    content = ru
      ? 'План выполнен. Проверьте результат — если что-то пошло не так, напишите, и я скорректирую шаги.'
      : 'The plan is complete. Check the result — if something looks off, tell me and I will adjust the steps.'
  } else if (status === 'cancelled') {
    content = ru
      ? 'Остановлено. Оставшиеся шаги не выполнялись.'
      : 'Stopped. The remaining steps were not performed.'
  } else {
    content = ru
      ? `План остановлен на шаге «${failure}». Ничего дальше не выполнялось.`
      : `The plan stopped (${failure}). No further steps were performed.`
  }
  if (token !== runToken) return
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: Date.now(),
    providerLabel: plan.providerLabel
  }
  const conversation = getStore().addMessage(pending.conversationId, message)
  if (conversation) {
    broadcast('chat:done', {
      conversationId: pending.conversationId,
      messageId: message.id,
      conversation
    })
  }
}

export async function cancelAgent(): Promise<void> {
  if (!activeRun) return
  activeRun.cancelled = true
  try {
    activeRun.child?.kill()
  } catch {
    /* ignore */
  }
}