import { useEffect, useId, useRef, useState } from 'react'
import { Button, Panel, tabularClass } from '../../ui'
import styles from './ClearControls.module.css'

type ClearControlsProps = {
  pinnedCount: number
  onClearAllocation: () => void
  onClearEverything: () => void
}

type Flow = { kind: 'idle' } | { kind: 'confirming'; action: 'allocation' | 'everything' }

/** KB-5: every number that updates gets the tabular-figure class, or it jitters as you type. */
function Num({ value }: { value: number }) {
  return <span className={tabularClass}>{value}</span>
}

/** The pinned guests survive a plain "clear allocation". Grammar forks on the count: zero
 * drops the sentence, one reads as a word rather than "1 pinned guests", two or more keep the
 * figure. */
function allocationBody(pinnedCount: number) {
  if (pinnedCount === 0) {
    return <>This returns the guests Auto-allocate seated to the unseated list. This cannot be undone.</>
  }
  if (pinnedCount === 1) {
    return (
      <>
        This returns the guests Auto-allocate seated to the unseated list. Your pinned guest stays
        where they are. This cannot be undone.
      </>
    )
  }
  return (
    <>
      This returns the guests Auto-allocate seated to the unseated list. Your{' '}
      <Num value={pinnedCount} /> pinned guests stay where they are. This cannot be undone.
    </>
  )
}

/** "Clear allocation and pins" releases every pin. Same grammar fork as `allocationBody`. */
function everythingBody(pinnedCount: number) {
  if (pinnedCount === 0) {
    return <>This returns every seated guest to the unseated list. This cannot be undone.</>
  }
  if (pinnedCount === 1) {
    return (
      <>
        This returns every seated guest to the unseated list and releases the pin. This cannot be
        undone.
      </>
    )
  }
  return (
    <>
      This returns every seated guest to the unseated list and releases all{' '}
      <Num value={pinnedCount} /> pins. This cannot be undone.
    </>
  )
}

/**
 * TT-37, KB-6 "Plan". Two non-primary triggers — Clear allocation, Clear allocation and pins —
 * each behind its own confirm prompt. Owns its confirm flow and focus the way `ScenarioPicker`
 * owns its own (view state, hands a completed decision up); no store access here, `PlanScreen`
 * still holds every write. Neither trigger nor either confirm button is filled: Auto-allocate
 * stays the one primary action on this screen, including while a prompt is open (KB-5, TT-37 AC5)
 * — this diverges from `ScenarioPicker`'s confirm, whose Load button *is* Setup's primary.
 */
export function ClearControls({ pinnedCount, onClearAllocation, onClearEverything }: ClearControlsProps) {
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' })
  const triggerRefs = useRef<Partial<Record<'allocation' | 'everything', HTMLButtonElement | null>>>({})
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const descriptionId = useId()

  function handleConfirm(action: 'allocation' | 'everything') {
    if (action === 'allocation') {
      onClearAllocation()
    } else {
      onClearEverything()
    }
    setFlow({ kind: 'idle' })
    triggerRefs.current[action]?.focus()
  }

  function handleCancel(action: 'allocation' | 'everything') {
    setFlow({ kind: 'idle' })
    triggerRefs.current[action]?.focus()
  }

  // Focus moves to the confirm button once the prompt opens — the trigger is never unmounted,
  // so no flushSync is needed: focusing after the confirm/cancel handler runs (above) is enough,
  // because the trigger stays mounted the whole time (ScenarioPicker.handleCancel's pattern).
  useEffect(() => {
    if (flow.kind === 'confirming') {
      confirmButtonRef.current?.focus()
    }
  }, [flow])

  // Escape cancels the open prompt. Registered on the capture phase and stopped there so it
  // runs, and can stop the key going any further, before it ever reaches PlanScreen's own
  // document-level Escape handler, which clears a selected rail guest instead.
  useEffect(() => {
    if (flow.kind !== 'confirming') return
    const action = flow.action

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      handleCancel(action)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [flow])

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <Button
          variant="secondary"
          ref={(el) => {
            triggerRefs.current.allocation = el
          }}
          onClick={() => {
            setFlow({ kind: 'confirming', action: 'allocation' })
          }}
        >
          Clear allocation
        </Button>
        <Button
          variant="secondary"
          ref={(el) => {
            triggerRefs.current.everything = el
          }}
          onClick={() => {
            setFlow({ kind: 'confirming', action: 'everything' })
          }}
        >
          Clear allocation and pins
        </Button>
      </div>

      {flow.kind === 'confirming' && flow.action === 'allocation' && (
        <Panel className={styles.confirm}>
          <p className={styles.confirmTitle}>Clear the allocation?</p>
          <p id={descriptionId} className={styles.confirmBody}>
            {allocationBody(pinnedCount)}
          </p>
          <div className={styles.confirmActions}>
            <Button
              variant="secondary"
              ref={confirmButtonRef}
              aria-describedby={descriptionId}
              onClick={() => {
                handleConfirm('allocation')
              }}
            >
              Clear allocation
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                handleCancel('allocation')
              }}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {flow.kind === 'confirming' && flow.action === 'everything' && (
        <Panel className={styles.confirm}>
          <p className={styles.confirmTitle}>Clear the allocation and the pins?</p>
          <p id={descriptionId} className={styles.confirmBody}>
            {everythingBody(pinnedCount)}
          </p>
          <div className={styles.confirmActions}>
            <Button
              variant="secondary"
              ref={confirmButtonRef}
              aria-describedby={descriptionId}
              onClick={() => {
                handleConfirm('everything')
              }}
            >
              Clear allocation and pins
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                handleCancel('everything')
              }}
            >
              Cancel
            </Button>
          </div>
        </Panel>
      )}
    </div>
  )
}
