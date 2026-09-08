import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './SlideOver.module.css'

export type SlideOverProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * A modal right-hand panel (KB-6: "roughly 55% width", page dimmed behind). Not built on
 * native `<dialog>`/`showModal()` — the trap below has to be fully observable in jsdom,
 * where a native dialog's focus and inert behaviour cannot be relied on.
 */
export function SlideOver({ open, title, onClose, children, footer }: SlideOverProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Move focus in on open, and give it back to whatever opened the panel on close.
  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus()
    }
  }, [open])

  // Escape closes; Tab and Shift+Tab wrap within the panel's own focusable elements.
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) {
        event.preventDefault()
        return
      }

      // Focus can land outside the panel entirely — clicking the scrim moves it to
      // <body> — and Tab from there must re-enter the trap rather than reach the
      // page behind the dim.
      const focusInPanel = panel.contains(document.activeElement)

      if (event.shiftKey) {
        if (!focusInPanel || document.activeElement === first || document.activeElement === panel) {
          event.preventDefault()
          last.focus()
        }
      } else if (!focusInPanel || document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    // Closing on a scrim click is deliberately not wired up: TT-5 puts a thirteen-field
    // form in here, and a stray click outside it must not discard it. Close is × or Escape.
    <div className={styles.scrim}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={styles.panel}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" aria-label="Close" className={styles.close} onClick={onClose}>
            <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" focusable="false">
              <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  )
}
