import { Menu, Tray, app, nativeImage } from 'electron'
import { getStore } from './store'
import { focusMain, setQuitting, toggleFloatWindow } from './windows'
import { resourcePath } from './paths'

let tray: Tray | null = null

function labels(ru: boolean): Record<string, string> {
  return ru
    ? {
        open: 'Открыть Chelp AI',
        newChat: 'Новый диалог',
        capture: 'Анализ экрана',
        float: 'Плавающий помощник',
        settings: 'Настройки',
        ai: 'Настройка AI',
        quit: 'Выход'
      }
    : {
        open: 'Open Chelp AI',
        newChat: 'New conversation',
        capture: 'Analyze screen',
        float: 'Floating assistant',
        settings: 'Settings',
        ai: 'AI configuration',
        quit: 'Quit'
      }
}

export function buildTrayMenu(): void {
  if (!tray) return
  const settings = getStore().settings
  const t = labels(settings.language === 'ru')
  const menu = Menu.buildFromTemplate([
    { label: t.open, click: () => focusMain() },
    { type: 'separator' },
    { label: t.newChat, click: () => focusMain('new-chat') },
    { label: t.capture, click: () => focusMain('analyze-screen') },
    { label: t.float, click: () => toggleFloatWindow() },
    { type: 'separator' },
    { label: t.settings, click: () => focusMain('open-settings') },
    { label: t.ai, click: () => focusMain('open-ai') },
    { type: 'separator' },
    {
      label: t.quit,
      click: () => {
        setQuitting(true)
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

export function createTray(): Tray {
  const image = nativeImage.createFromPath(resourcePath('icon.png'))
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }))
  tray.setToolTip('Chelp AI')
  tray.on('click', () => focusMain())
  tray.on('double-click', () => focusMain())
  buildTrayMenu()
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
