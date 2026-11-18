import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Redo2, RotateCcw } from 'lucide-react'
import { useT } from '../hooks'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function Redactor({
  src,
  enabled,
  onChange
}: {
  src: string
  enabled: boolean
  onChange: (dataUrl: string) => void
}) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [rects, setRects] = useState<Rect[]>([])
  const [draft, setDraft] = useState<Rect | null>(null)
  const [loaded, setLoaded] = useState(false)

  const paint = (list: Rect[], active: Rect | null): void => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image) return
    const context = canvas.getContext('2d')
    if (!context) return
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    context.fillStyle = '#050508'
    for (const rect of list) {
      context.fillRect(rect.x, rect.y, rect.width, rect.height)
    }
    if (active) {
      context.strokeStyle = 'rgba(139, 108, 255, 0.9)'
      context.lineWidth = Math.max(2, canvas.width / 800)
      context.setLineDash([10, 6])
      context.strokeRect(active.x, active.y, active.width, active.height)
      context.setLineDash([])
    }
  }

  useEffect(() => {
    setLoaded(false)
    setRects([])
    setDraft(null)
    const image = new Image()
    image.onload = () => {
      imageRef.current = image
      setLoaded(true)
      paint([], null)
    }
    image.src = src
    return () => {
      imageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const emit = (list: Rect[]): void => {
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
    setRects(list)
  }

  const toCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const bounds = canvas.getBoundingClientRect()
    const scaleX = canvas.width / bounds.width
    const scaleY = canvas.height / bounds.height
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * scaleY))
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!enabled || !loaded) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = toCanvasPoint(event)
    startRef.current = point
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!enabled || !startRef.current) return
    const point = toCanvasPoint(event)
    const draftRect: Rect = {
      x: Math.min(startRef.current.x, point.x),
      y: Math.min(startRef.current.y, point.y),
      width: Math.abs(point.x - startRef.current.x),
      height: Math.abs(point.y - startRef.current.y)
    }
    setDraft(draftRect)
    paint(rects, draftRect)
  }

  const onPointerUp = (): void => {
    if (!startRef.current) return
    startRef.current = null
    if (draft && draft.width > 6 && draft.height > 6) {
      const next = [...rects, draft]
      paint(next, null)
      setDraft(null)
      emit(next)
    } else {
      setDraft(null)
      paint(rects, null)
    }
  }

  const undo = (): void => {
    const next = rects.slice(0, -1)
    paint(next, null)
    emit(next)
  }

  const reset = (): void => {
    paint([], null)
    emit([])
  }

  return (
    <div className={`redactor ${enabled ? 'is-editing' : ''}`}>
      <div className="redactor-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="redactor-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {enabled && rects.length === 0 && !draft ? (
          <div className="redactor-hint">{t('screen.redactHint')}</div>
        ) : null}
      </div>
      {rects.length > 0 ? (
        <div className="redactor-bar">
          <span className="redactor-badge">{t('screen.redacted')}</span>
          <div className="redactor-actions">
            <button type="button" onClick={undo}>
              <RotateCcw size={12} />
              {t('common.undo')}
            </button>
            <button type="button" onClick={reset}>
              <Redo2 size={12} />
              {t('screen.reset')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
