import type { ButtonHTMLAttributes, Ref } from 'react'
import { cx } from './cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

/**
 * `ref` is listed explicitly (TT-4) rather than left to `ButtonHTMLAttributes`, which does
 * not carry one. React 19 forwards `ref` to a function component as an ordinary prop, but
 * the JSX checker only allows it through when the component's own prop type declares it —
 * without this, TT-4's "Change scenario" control cannot move focus to itself once an
 * import completes (KB-6, C33), because `<Button ref={...} />` does not typecheck. No
 * runtime change: `rest` below already spread onto the native `<button>`, which has always
 * accepted a ref.
 */
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  ref?: Ref<HTMLButtonElement>
}

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: styles.primary,
  secondary: styles.secondary,
  quiet: styles.quiet,
}

/**
 * One primary button per view (KB-5). `variant` defaults to secondary rather than
 * primary so that reaching for the loud option takes a deliberate choice.
 */
export function Button({ variant = 'secondary', type = 'button', className, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, VARIANT_CLASS[variant], className)}
      {...rest}
    />
  )
}
