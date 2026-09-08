import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cx } from './cx'
import fieldStyles from './field.module.css'

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Keeps the accessible name while removing the visible label — the search field's use. */
  labelHidden?: boolean
  hint?: string
}

/**
 * No `error` prop: TT-7 draws no error state. Validation and its display belong to TT-5,
 * which owns the guest form this field is built for.
 */
export function TextField({
  label,
  labelHidden = false,
  hint,
  id,
  className,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: TextFieldProps) {
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
      <input
        id={fieldId}
        className={cx(fieldStyles.field, className)}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className={fieldStyles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
