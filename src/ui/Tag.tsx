import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Tag.module.css'

/**
 * Always sunken on surface, never coloured and never interactive. Tags group people, they
 * do not signal anything, and colouring them would compete with severity.
 */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.tag, className)}>{children}</span>
}
