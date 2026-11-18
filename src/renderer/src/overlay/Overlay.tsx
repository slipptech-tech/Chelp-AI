import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Check, Scan, X } from 'lucide-react'
import type { Lang } from '@shared/types'
import { translate } from '../i18n'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface OverlaySource {
  image: string
  imageWidth: number
  imageHeight: number
  cssWidth: number
  cssHeight: number
  label: string
}

function normalize(start: { x: number; y: number }, end: { x: number; y: number }): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

export function Overlay() {
  const [context, setContext] = useState<OverlaySource | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [rect, setRect] = useState<Rect | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const rectRef = useRef<Rect | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [ctx, settings] = await Promise.all([
        window.chelpOverlay.context(),
        window.chelp.settings.get()
      ])
      if (!alive) return
      if (!ctx) {
        window.chelpOverlay.cancel()
        return
      }
      setContext(ctx)
      setLang(settings.language)
    })()
    return () => {
      alive = false
    }
  }, [])

  const cancel = useCallback(() => {
    window.chelpOverlay.cancel()
  }, [])

  const confirm = useCallback(() => {
    const current = rectRef.current
    const ctx = context
    if (!current || current.width < 8 || current.height < 8 || !ctx) return
    const scaleX = ctx.imageWidth / window.innerWidth
    const scaleY = ctx.imageHeight / window.innerHeight
    window.chelpOverlay.complete({
      x: current.x * scaleX,
      y: current.y * scaleY,
      width: current.width * scaleX,
      height: current.height * scaleY
    })
  }, [context])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cancel, confirm])

  const setSelection = (next: Rect | null): void => {
    rectRef.current = next
    setRect(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const point = { x: event.clientX, y: event.clientY }
    startRef.current = point
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!startRef.current) return
    setSelection(normalize(startRef.current, { x: event.clientX, y: event.clientY }))
  }

  const onPointerUp = (): void => {
    if (!startRef.current) return
    startRef.current = null
    const current = rectRef.current
    if (!current || current.width < 8 || current.height < 8) setSelection(null)
  }

  const scaleX = context ? context.imageWidth / window.innerWidth : 1
  const scaleY = context ? context.imageHeight / window.innerHeight : 1

  return (
    <div
      className="overlay-root"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(event) => {
        event.preventDefault()
        cancel()
      }}
    >
      {context ? (
        <div
          className="overlay-shot"
          style={{ backgroundImage: `url("${context.image}")` }}
        />
      ) : null}

      {!rect ? <div className="overlay-dim" /> : null}

      {rect ? (
        <div
          className="overlay-selection"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            backgroundImage: context ? `url("${context.image}")` : undefined,
            backgroundSize: context
              ? `${window.innerWidth}px ${window.innerHeight}px`
              : '100% 100%',
            backgroundPosition: `${-rect.x}px ${-rect.y}px`
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            confirm()
          }}
        >
          <span className="overlay-corner tl" />
          <span className="overlay-corner tr" />
          <span className="overlay-corner bl" />
          <span className="overlay-corner br" />
          <span className="overlay-size-label">
            {Math.round(rect.width * scaleX)} × {Math.round(rect.height * scaleY)}
          </span>
        </div>
      ) : null}

      {!rect ? (
        <div className="overlay-hint">
          <span className="overlay-hint-icon">
            <Scan size={18} />
          </span>
          <strong>{translate(lang, 'overlay.hint')}</strong>
          <span>{translate(lang, 'overlay.cancel')}</span>
        </div>
      ) : null}

      <div
        className="overlay-bar"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <div className="overlay-bar-info">
          <span className="overlay-bar-hint">
            {rect ? translate(lang, 'overlay.doubleClick') : translate(lang, 'overlay.hint')}
          </span>
          {rect ? (
            <span className="overlay-bar-size">
              {translate(lang, 'overlay.size', {
                w: Math.round(rect.width * scaleX),
                h: Math.round(rect.height * scaleY)
              })}
            </span>
          ) : null}
        </div>
        <button type="button" className="overlay-btn is-ghost" onClick={cancel}>
          <X size={14} />
          {translate(lang, 'overlay.cancel')}
        </button>
        <button
          type="button"
          className="overlay-btn is-primary"
          disabled={!rect}
          onClick={confirm}
        >
          <Check size={14} />
          {translate(lang, 'overlay.use')}
        </button>
      </div>
    </div>
  )
}
