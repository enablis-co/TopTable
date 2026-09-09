import type { ButtonHTMLAttributes, Ref } from 'react'
import { cx } from './cx'
import styles from './CardButton.module.css'

/**
 * `ref` is added on top of `ButtonHTMLAttributes` rather than inherited from it: React 19
 * passes `ref` to a function component as an ordinary prop, but only when the component's
 * own prop type says so (`"ref" extends keyof P` is what the JSX checker looks for).
 * Without this, `<CardButton ref={...} />` does not typecheck.
 */
export type CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>
}

/**
 * TT-4: a card-shaped clickable surface for the scenario picker. Lives in src/ui/ because
 * src/ui/brand.test.ts forbids a raw <button> outside the shared-component module or the
 * shell. Deliberately narrow — no variant, no title, no selected state (TT-4's plan, Risk
 * R2) — so what propagates to later screens that reach for it is as small as possible.
 */
export function CardButton({ type = 'button', className, ...rest }: CardButtonProps) {
  return <button type={type} className={cx(styles.card, className)} {...rest} />
}
