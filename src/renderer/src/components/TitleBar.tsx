import { useEffect, useState } from 'react'
import { Camera, Copy, Minus, Square, X } from 'lucide-react'
import { useApp } from '../store'
import { useT } from '../hooks'
import { formatKey } from '../lib/format'
import { Wordmark } from './Logo'
import { Kbd } from './ui'

export function TitleBar() {
  const t = useT()
  const navigate = useApp((state) => state.navigate)
  const captureHotkey = useApp((state) => state.settings.hotkeys.capture)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.chelp.window.isMaximized().then(setMaximized)
    return window.chelp.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) window.chelp.window.toggleMaximize()
      }}
    >
      <div className="titlebar-left">
        <Wordmark size={21} />
      </div>
      <div className="titlebar-drag" />
      <div className="titlebar-actions">
        <button type="button" className="titlebar-capture" onClick={() => navigate('screen')}>
          <Camera size={14} />
          <span>{t('titlebar.capture')}</span>
          {captureHotkey ? <Kbd>{formatKey(captureHotkey)}</Kbd> : null}
        </button>
        <div className="titlebar-sep" />
        <button
          type="button"
          className="window-btn"
          onClick={() => window.chelp.window.minimize()}
          aria-label={t('titlebar.minimize')}
          title={t('titlebar.minimize')}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-btn"
          onClick={() => window.chelp.window.toggleMaximize()}
          aria-label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
          title={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className="window-btn window-btn-close"
          onClick={() => window.chelp.window.close()}
          aria-label={t('titlebar.close')}
          title={t('titlebar.close')}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  )
}
