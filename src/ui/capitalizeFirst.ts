/**
 * Upper-cases the first character and leaves the rest alone. Presentation only: the domain
 * stores `'bride'`, `'mother of the bride'` and `'nuts'` in lower case, and every screen that
 * shows one of those to a human capitalises it at the point of rendering rather than storing a
 * second, display-shaped copy of the value.
 *
 * It lives here with `cx` and `tabularClass` — string formatting the design system owns, not
 * domain logic — because four screens had grown their own copy of this one line and two of them
 * had drifted apart in shape while agreeing on behaviour.
 *
 * Capitalises the first *character*, not every word: "mother of the bride" becomes "Mother of
 * the bride", which is what KB-5 asks for and what `GuestTable`'s tests assert. An empty string
 * comes back empty — `charAt` returns `''` past the end rather than throwing.
 */
export function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
