/**
 * TT-16. The third column holds exactly one of these, never a `selectedTableId` alongside a
 * `breakdownOpen` boolean — a union makes "only one at a time" a property of the type rather
 * than something two handlers have to keep agreeing on. Pure: no React, no store.
 *
 * No `ThirdColumn.tsx` beside this file — this filesystem is case-insensitive, and the two
 * would resolve to the same module with the import silently arriving as `undefined`.
 */
export type ThirdColumn =
  | { kind: 'violations' }
  | { kind: 'table'; tableId: string }
  | { kind: 'breakdown' }
  | { kind: 'pinned' }

export type StatPanelKind = 'breakdown' | 'pinned'

export const VIOLATIONS: ThirdColumn = { kind: 'violations' }

/** Selecting the table already shown dismisses it (TT-15's own toggle); any other id replaces
 *  whatever the column held, including a stat panel. */
export function toggleTable(current: ThirdColumn, tableId: string): ThirdColumn {
  if (current.kind === 'table' && current.tableId === tableId) {
    return VIOLATIONS
  }
  return { kind: 'table', tableId }
}

/** One function for both stat toggles: opening the same panel again closes it, opening the
 *  other one replaces whatever was open, including a selected table. */
export function toggleStat(current: ThirdColumn, kind: StatPanelKind): ThirdColumn {
  if (current.kind === kind) {
    return VIOLATIONS
  }
  return { kind }
}

/** `null` for every column that is not a table, so `FloorplanGrid`'s existing `string | null`
 *  contract needs no change. */
export function selectedTableId(column: ThirdColumn): string | null {
  return column.kind === 'table' ? column.tableId : null
}
