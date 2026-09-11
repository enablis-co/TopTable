import styles from './Mark.module.css'

/**
 * The brand mark. A wide bar with round tables beneath it — a room seen from above.
 *
 * Geometry is public/mark.svg's, unchanged. Never recoloured to carry state: the mark is
 * brand, not interface, and violations use hard/soft, never the mark's own colours.
 *
 * `zone` picks which surface the mark sits on: canvas (bar `--slate`, dots `--ink`, both
 * invisible on `--chrome`) or chrome (both `--chrome-ink`), for the dark top bar (TT-35).
 */
export type MarkSize = 16 | 22 | 24 | 40

const STROKE_WIDTH: Record<MarkSize, number> = {
  16: 2.6,
  22: 2.2,
  24: 2.2,
  40: 1.8,
}

type MarkProps = {
  size?: MarkSize
  label?: string
  zone?: 'canvas' | 'chrome'
}

export function Mark({ size = 24, label, zone = 'canvas' }: MarkProps) {
  const strokeWidth = STROKE_WIDTH[size]

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable={label ? undefined : 'false'}
      className={zone === 'chrome' ? styles.chrome : undefined}
    >
      <rect x={7} y={6} width={26} height={7} rx={3.5} className={styles.bar} />
      <circle cx={12} cy={24} r={4.6} strokeWidth={strokeWidth} className={styles.dot} />
      <circle cx={28} cy={24} r={4.6} strokeWidth={strokeWidth} className={styles.dot} />
      <circle cx={20} cy={34} r={4.6} strokeWidth={strokeWidth} className={styles.dot} />
    </svg>
  )
}
