import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
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
