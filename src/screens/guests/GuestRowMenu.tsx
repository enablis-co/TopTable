import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import styles from './GuestRowMenu.module.css'

type GuestRowMenuProps = {
  guestName: string
  onEdit: () => void
  onRemove: () => void
}

/**
 * TT-6, A10, C29. One `⋯` trigger per row rather than two always-visible inline buttons — KB-6
 * draws a single glyph, and two permanent tab stops per row does not hold at 200 rows (R4).
 *
 * Built on the shared `Button` (quiet variant, sized down via this file's own CSS module)
 * rather than a bare button element — `src/ui/brand.test.ts` forbids one outside `src/ui/`
 * or `src/shell/`, so every control here routes through the shared component instead.
 *
 * The trigger's accessible name comes from a visually-hidden span nested inside it ("Actions
 * for Danny Whitaker"), not from `aria-label`. R4 flags this deliberately: the preview pane's
 * accessibility tree does not compute name from content the way Chrome and jsdom do, so this
 * button can read as unnamed there while being perfectly fine — `getByRole('button', { name
 * })` passing in the suite is the real evidence (docs/engineering-standards.md, "What the
 * suite cannot see"). Do not "fix" this by switching to `aria-label` on the pane's word alone.
 *
 * Remove fires immediately with no confirm (A11) — undo is out of the MVP (KB-1).
 */
export function GuestRowMenu({ guestName, onEdit, onRemove }: GuestRowMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    editRef.current?.focus()

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={styles.wrapper} ref={rootRef}>
      <Button
        variant="quiet"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <span aria-hidden="true" className={styles.dots}>
          ⋯
        </span>
        <span className="tt-visually-hidden">Actions for {guestName}</span>
      </Button>
      {open && (
        <div className={styles.menu} role="menu">
          <Button
            variant="quiet"
            role="menuitem"
            ref={editRef}
            className={styles.item}
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            Edit
          </Button>
          <Button
            variant="quiet"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  )
}
