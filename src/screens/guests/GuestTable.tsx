import type { Guest } from '../../domain/types'
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

function needsText(guest: Guest): string {
  const items = [...guest.allergies, ...guest.accessibility]
  return items.length === 0 ? '—' : items.map(capitalizeFirst).join(', ')
}

/**
 * TT-6, C19-C22, C28, C29, C32. Markup and column structure lifted from
 * `docs/style-guide.html` line 248, "Guest row" (KB-5 says its markup can be lifted); the
 * `<thead>`/`<tbody>` the style guide's own snippet omits are added here. A sixth,
 * visually-hidden "Actions" header holds the row menu, so the table stays a valid,
 * fully-labelled grid without adding a sixth *visible* column — KB-6's diagram draws five
 * (C19, C32: age is not one of them).
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
            <th>
              <span className="tt-visually-hidden">Actions</span>
            </th>
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
