import { useEffect, useRef, useState, type RefObject } from 'react'

export type ElementSize = {
  width: number
  height: number
}

const ZERO_SIZE: ElementSize = { width: 0, height: 0 }

/**
 * TT-38. Measures the ref'd element's content box via `ResizeObserver`.
 *
 * jsdom defines no `ResizeObserver`, so this returns `{ width: 0, height: 0 }` and observes
 * nothing there — `fitFloorplan`'s own zero-size branch is what keeps the rest of the suite
 * exercising today's layout, not a stub added to `src/test/setup.ts`.
 */
export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, ElementSize] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<ElementSize>(ZERO_SIZE)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      // Without this guard a size-driven re-render can itself change layout enough to fire the
      // observer again, looping.
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }))
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
