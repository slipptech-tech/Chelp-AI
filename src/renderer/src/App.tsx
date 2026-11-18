import { useEffect } from 'react'
import { useApp, wireEvents } from './store'
import { useT } from './hooks'
import { Logo } from './components/Logo'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { Spinner } from './components/ui'
import { DashboardPage } from './pages/Dashboard'
import { AssistantPage } from './pages/Assistant'
import { ScreenPage } from './pages/Screen'
import { HistoryPage } from './pages/History'
import { SavedPage } from './pages/Saved'
import { SettingsPage } from './pages/Settings'
import { AiPage } from './pages/AI'

export function App() {
  const t = useT()
  const ready = useApp((state) => state.ready)
  const page = useApp((state) => state.page)
  const language = useApp((state) => state.settings.language)
  const accent = useApp((state) => state.settings.accent)

  useEffect(() => {
    const disposeEvents = wireEvents()
    const store = useApp.getState()
    void store.init().catch(() => store.toast(t('errors.unknown'), 'error'))

    const disposeCommands = window.chelp.commands.on((command) => {
      const current = useApp.getState()
      switch (command) {
        case 'new-chat':
          void current.newChat('chat')
          break
        case 'analyze-screen':
          current.navigate('screen')
          break
        case 'open-settings':
          current.navigate('settings')
          break
        case 'open-ai':
          current.navigate('ai')
          break
        case 'open-history':
          current.navigate('history')
          break
        case 'open-assistant':
          current.navigate('assistant')
          break
        case 'open-dashboard':
          current.navigate('dashboard')
          break
      }
    })

    const disposeOpen = window.chelp.commands.onOpenConversation((id) => {
      void useApp.getState().openConversation(id)
    })

    return () => {
      disposeEvents()
      disposeCommands()
      disposeOpen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.dataset.accent = accent
    document.documentElement.lang = language
  }, [accent, language])

  if (!ready) {
    return (
      <div className="splash">
        <div className="splash-glow" />
        <Logo size={58} />
        <strong>Chelp AI</strong>
        <span>{t('app.tagline')}</span>
        <div className="splash-loader">
          <Spinner size={14} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          {page === 'dashboard' ? <DashboardPage /> : null}
          {page === 'assistant' ? <AssistantPage /> : null}
          {page === 'screen' ? <ScreenPage /> : null}
          {page === 'history' ? <HistoryPage /> : null}
          {page === 'saved' ? <SavedPage /> : null}
          {page === 'settings' ? <SettingsPage /> : null}
          {page === 'ai' ? <AiPage /> : null}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
