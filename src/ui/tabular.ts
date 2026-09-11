/**
 * The opt-in figure-stability class defined in `base.css`: IBM Plex Mono
 * (`font-family: var(--font-mono)`) plus `font-variant-numeric: tabular-nums`, the fallback that
 * holds the same guarantee if the mono face fails to load. Import this rather than typing the
 * bare string 'tt-num' from memory — every element that renders a number that can change
 * between renders (capacity, seat counts, totals) needs it, or the value jitters as it changes.
 * Never put it on an element that also carries a component style setting the `font` shorthand —
 * the shorthand resets font-family and font-variant-numeric back to the sans/proportional
 * defaults.
 */
export const tabularClass = 'tt-num'
