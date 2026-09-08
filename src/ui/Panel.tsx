import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Panel.module.css'

export type PanelProps = {
  title?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Surface against paper, no shadow: depth comes from the colour contrast alone (KB-5). */
export function Panel({ title, actions, children, className }: PanelProps) {
  return (
    <div className={cx(styles.panel, className)}>
      {title ? (
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}
