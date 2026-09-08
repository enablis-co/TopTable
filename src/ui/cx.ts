/**
 * Joins class names, dropping anything falsy. The one place a class string is assembled,
 * so no component builds one with a template literal.
 *
 * The explicit type predicate is required: `noUncheckedIndexedAccess` types every CSS
 * Module lookup (`styles.button`) as `string | undefined`, because the ambient
 * `*.module.css` declaration is a bare index signature. `@typescript-eslint/
 * restrict-template-expressions` (on via `recommendedTypeChecked`) then rejects that
 * value inside a template literal, which is exactly the mistake this function exists to
 * make impossible.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ')
}
