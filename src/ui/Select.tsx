import { useId } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { cx } from './cx'
import fieldStyles from './field.module.css'
import styles from './Select.module.css'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  labelHidden?: boolean
  hint?: string
}

/** Options are passed as children — the picker's own vocabulary supplies them. */
export function Select({
  label,
  labelHidden = false,
  hint,
  id,
  className,
  children,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: SelectProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint ? `${fieldId}-hint` : undefined
  // Merge rather than let the spread below win: a caller-supplied aria-describedby
  // (TT-5 passes error text through it) must add to the hint, not silently detach it.
  const describedBy = hintId ? (ariaDescribedBy ? `${hintId} ${ariaDescribedBy}` : hintId) : ariaDescribedBy

  return (
    <div className={fieldStyles.wrapper}>
      <label htmlFor={fieldId} className={cx(fieldStyles.label, labelHidden && 'tt-visually-hidden')}>
        {label}
      </label>
      <div className={styles.control}>
        <select
          id={fieldId}
          className={cx(fieldStyles.field, styles.select, className)}
          aria-describedby={describedBy}
          {...rest}
        >
          {children}
        </select>
        <svg className={styles.chevron} viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" focusable="false">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {hint ? (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
