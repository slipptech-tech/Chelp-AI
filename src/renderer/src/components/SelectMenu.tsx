import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  badge?: string
}

interface MenuPosition {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  width,
  mono
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  width?: number
  mono?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.value === value)

  const place = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const desiredWidth = width ?? Math.max(rect.width, 240)
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - desiredWidth - 8)
    )
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const above = spaceBelow < 200 && spaceAbove > spaceBelow
    setPosition({
      left,
      width: desiredWidth,
      maxHeight: Math.max(160, Math.min(320, above ? spaceAbove : spaceBelow)),
      ...(above
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 })
    })
  }

  const openMenu = (): void => {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)))
    place()
    setOpen(true)
  }

  const close = (refocus = false): void => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const choose = (next: string): void => {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      place()
      menuRef.current?.focus()
    })
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onScroll = (event: Event): void => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return
      }
      setOpen(false)
    }
    const onResize = (): void => place()
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + step + options.length) % options.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) choose(option.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`select select-menu-trigger ${open ? 'is-open' : ''} ${
          mono ? 'is-mono' : ''
        } ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (open) menuRef.current?.focus()
            else openMenu()
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            close()
          }
        }}
      >
        <span className="select-menu-value">{selected?.label ?? '—'}</span>
        <ChevronDown size={14} className="select-chevron" />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              className={`select-menu ${mono ? 'is-mono' : ''}`}
              role="listbox"
              aria-label={ariaLabel}
              tabIndex={-1}
              style={{
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
                top: position.top,
                bottom: position.bottom
              }}
              onKeyDown={onMenuKeyDown}
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  data-index={index}
                  className={`select-menu-option ${
                    option.value === value ? 'is-selected' : ''
                  } ${index === activeIndex ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option.value)}
                >
                  <span className="select-menu-label">{option.label}</span>
                  {option.badge ? <span className="select-menu-badge">{option.badge}</span> : null}
                  {option.value === value ? (
                    <Check size={13} className="select-menu-check" />
                  ) : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
