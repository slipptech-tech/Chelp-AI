import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '../store'
import { useT } from '../hooks'

export function Toasts() {
  const toasts = useApp((state) => state.toasts)
  const dismiss = useApp((state) => state.dismissToast)
  const t = useT()

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">
            {toast.tone === 'error' ? (
              <AlertTriangle size={15} />
            ) : toast.tone === 'success' ? (
              <CheckCircle2 size={15} />
            ) : (
              <Info size={15} />
            )}
          </span>
          <span className="toast-text">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismiss(toast.id)}
            aria-label={t('common.close')}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
