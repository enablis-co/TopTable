import type { Guest } from '../../domain/types'
import { hasNeeds } from '../../domain/guests'
import { Tag } from '../../ui'
import { GuestRowMenu } from './GuestRowMenu'
import styles from './GuestTable.module.css'

type GuestTableProps = {
  guests: Guest[]
  /** TT-5, C12. Optional so TT-6 can leave it unset — no row ever highlights until the panel exists. */
  highlightId?: string | null
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Calls `hasNeeds` rather than re-deriving "has an allergy or an accessibility need" here —
 *  the same predicate GuestSummary uses for its "with needs" count, so the two can never
 *  silently drift apart (C27). */
function needsText(guest: Guest): string {
  if (!hasNeeds(guest)) return '—'
  return [...guest.allergies, ...guest.accessibility].map(capitalizeFirst).join(', ')
}

/**
 * TT-6, C19-C22, C28, C29, C32. Markup and column structure lifted from
 * `docs/style-guide.html` line 248, "Guest row" (KB-5 says its markup can be lifted) — five
 * `<th>`s, exactly, verified against the style guide's own snippet; the `<thead>`/`<tbody>`
 * it omits are added here.
 *
 * The row menu sits in its own trailing `<td>` with no `<th>` of its own at all — not even a
 * hidden one. C19 counts exactly five *header* cells (Name, Side, Role, Tags, Needs), and the
 * Needs cell has to hold nothing but the needs value: the "with needs" count in the summary is
 * read off that cell's own text (C27), so anything else sharing the cell — a menu button's own
 * accessible name included — would make every row read as "has a need". The menu button's own
 * name ("Actions for Danny Whitaker") already carries the row's context without a column
 * header labelling it.
 *
 * `side` and `role` render the full domain value, first letter capitalised (A5): "Mother of
 * the bride", not KB-6's ASCII-truncated "Mother of bird". Needs shows allergies and
 * accessibility only (C20) — dietary preferences are never consulted here — and renders an em
 * dash when neither is present (C21).
 */
export function GuestTable({ guests, highlightId, onEdit, onRemove }: GuestTableProps) {
  return (
    <div className={styles.surface}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Side</th>
            <th>Role</th>
            <th>Tags</th>
            <th>Needs</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((guest) => (
            <tr key={guest.id} className={guest.id === highlightId ? styles.highlight : undefined}>
              <td>{guest.name}</td>
              <td>{capitalizeFirst(guest.side)}</td>
              <td>{capitalizeFirst(guest.role)}</td>
              <td>
                <div className={styles.tags}>
                  {guest.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
              </td>
              <td>{needsText(guest)}</td>
              <td className={styles.actions}>
                <GuestRowMenu
                  guestName={guest.name}
                  onEdit={() => {
                    onEdit(guest.id)
                  }}
                  onRemove={() => {
                    onRemove(guest.id)
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
