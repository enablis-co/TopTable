import { useId, useState } from 'react'
import type { Guest, Role, Side, SocialType } from '../../domain/types'
import {
  AGE_BAND_UPPER_BOUND,
  AGE_BANDS,
  KNOWN_ACCESSIBILITY_NEEDS,
  KNOWN_ALLERGIES,
  KNOWN_DIETARY_PREFERENCES,
  OTHER_ROLES,
  PROTOCOL_ROLES,
} from '../../domain/types'
import type { AgeBand } from '../../domain/types'
import { availablePartners, tagsInUse } from '../../domain/guests'
import { Button, PillInput, Select, SlideOver, TextField, capitalizeFirst } from '../../ui'
import { ConflictPicker } from './ConflictPicker'
import { draftFromGuest, emptyDraft, guestFromDraft, validateDraft } from './guestDraft'
import type { GuestDraft } from './guestDraft'
import styles from './GuestPanel.module.css'

type GuestPanelProps = {
  open: boolean
  guests: Guest[]
  /** null for add; the guest being edited otherwise (C1: one component serves both). */
  guest: Guest | null
  onClose: () => void
  onSave: (guest: Guest) => void
}

const SIDES: Side[] = ['bride', 'groom', 'both']
const ROLES: Role[] = [...OTHER_ROLES, ...PROTOCOL_ROLES]
const SOCIAL_TYPES: SocialType[] = ['livewire', 'sociable', 'quiet']

/**
 * A19: the boundaries only exist in the answer to B1 — the option label is the only place a
 * user can see them. Follow-up to TT-5 (human decision, 2026-09-09): derived from
 * `AGE_BAND_UPPER_BOUND` (src/domain/types.ts) rather than a third hand-typed copy of 4/10/18
 * — that file's own comment on `AGE_BAND_UPPER_BOUND` names this edit as still owed, and
 * nothing before this caught the two drifting apart. `adult` has no upper bound of its own
 * (it is the open-ended top band), so its label reuses `teen`'s upper bound as the "and over"
 * figure — the same boundary read from the other side, not a fourth number.
 */
const AGE_BAND_LABELS: Record<AgeBand, string> = {
  baby: `Baby (under ${AGE_BAND_UPPER_BOUND.baby})`,
  child: `Child (under ${AGE_BAND_UPPER_BOUND.child})`,
  teen: `Teen (under ${AGE_BAND_UPPER_BOUND.teen})`,
  adult: `Adult (${AGE_BAND_UPPER_BOUND.teen} and over)`,
}

/** "a, b or c", for spelling out a closed vocabulary in a hint without hand-typing it a second
 *  time — the one copy stays `KNOWN_ALLERGIES` / `KNOWN_DIETARY_PREFERENCES` themselves. */
function joinWithOr(values: readonly string[]): string {
  const last = values[values.length - 1]
  if (last === undefined) return ''
  const init = values.slice(0, -1)
  return init.length === 0 ? last : `${init.join(', ')} or ${last}`
}

/**
 * Follow-up to TT-5, human decision 2026-09-09 — not a Tickety ticket, and deliberately beyond
 * what TT-5's own acceptance criteria asked for. `src/domain/types.ts`'s own comment on
 * `KNOWN_ALLERGIES` and `KNOWN_DIETARY_PREFERENCES` says plainly that those vocabularies "do
 * not constrain what a guest may carry". That stays true of storage — both fields are still
 * `string[]`, untouched by this change, and the vocabularies themselves are not widened — and
 * stops being true of the *input* for these two fields only. `PillInput`'s
 * `restrictToSuggestions` closes them to the known vocabulary, with "something else" as an
 * explicit, always-reachable way to record a value outside it (a celery allergy, say — not
 * offered, but still recordable) — deliberately one extra step, never a dead end. `tags` stays
 * free text ("by definition", KB-3), and nobody asked for `accessibility` to change, so neither
 * field below carries this prop.
 *
 * `KNOWN_ALLERGIES` offers four of the fourteen regulated allergens. Widening that list is
 * KB-3's owner's call, not ours, so do not read it as the complete set.
 */
const ALLERGY_HINT = `${capitalizeFirst(joinWithOr(KNOWN_ALLERGIES))} — or something else.`
const DIETARY_HINT = `${capitalizeFirst(joinWithOr(KNOWN_DIETARY_PREFERENCES))} — or something else.`

/**
 * TT-5, C1-C15. The slide-over form. No store access of its own — `guests` and the save/close
 * callbacks come from `GuestsScreen`, which owns the store the way `SetupScreen` owns it for
 * its own screen. `GuestsScreen` mounts this only while the panel is meant to be open, so a
 * fresh mount (and therefore a fresh draft) happens every time it appears — including a
 * second "Add guest" straight after cancelling the first.
 *
 * Four KB-6 group headings, not five (R11 — KB-6's own diagram draws four; TT-5's wording and
 * KB-6's prose both say five, but no fifth is named anywhere, so C2 follows the diagram).
 *
 * Only `side` is a placeholder (A12). `age` and `socialType` are visibly preselected (A21,
 * A23) — the user sees what will be stored and is one click from changing it, rather than a
 * blank that silently resolves to a value nobody chose.
 */
export function GuestPanel({ open, guests, guest, onClose, onSave }: GuestPanelProps) {
  const [draft, setDraft] = useState<GuestDraft>(() => (guest ? draftFromGuest(guest) : emptyDraft()))
  const [errors, setErrors] = useState<{ name?: string; side?: string }>({})
  const baseId = useId()
  const nameErrorId = `${baseId}-name-error`
  const sideErrorId = `${baseId}-side-error`

  function patch(next: Partial<GuestDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function handleSave() {
    const validationErrors = validateDraft(draft)
    setErrors(validationErrors)
    if (validationErrors.name !== undefined || validationErrors.side !== undefined) return

    const id = guest?.id ?? crypto.randomUUID()
    onSave(guestFromDraft(draft, id))
  }

  const partnerOptions = availablePartners(guests, guest?.id ?? null)
  const tagSuggestions = tagsInUse(guests)

  return (
    <SlideOver
      open={open}
      title={guest ? 'Edit guest' : 'Add guest'}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save guest
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <section className={styles.group}>
          <h3 className={styles.heading}>Who they are</h3>
          <TextField
            label="Name"
            value={draft.name}
            aria-describedby={errors.name ? nameErrorId : undefined}
            onChange={(e) => {
              patch({ name: e.target.value })
              if (errors.name) setErrors((current) => ({ ...current, name: undefined }))
            }}
          />
          {errors.name ? (
            <p id={nameErrorId} className={styles.error}>
              {errors.name}
            </p>
          ) : null}

          <div className={styles.row}>
            <Select
              label="Side"
              value={draft.side}
              aria-describedby={errors.side ? sideErrorId : undefined}
              onChange={(e) => {
                patch({ side: e.target.value as Side | '' })
                if (errors.side) setErrors((current) => ({ ...current, side: undefined }))
              }}
            >
              <option value="">Choose a side</option>
              {SIDES.map((side) => (
                <option key={side} value={side}>
                  {capitalizeFirst(side)}
                </option>
              ))}
            </Select>
            <Select
              label="Role"
              value={draft.role}
              onChange={(e) => {
                patch({ role: e.target.value as Role })
              }}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {capitalizeFirst(role)}
                </option>
              ))}
            </Select>
            <Select
              label="Age"
              value={draft.age}
              onChange={(e) => {
                patch({ age: e.target.value as AgeBand })
              }}
            >
              {AGE_BANDS.map((band) => (
                <option key={band} value={band}>
                  {AGE_BAND_LABELS[band]}
                </option>
              ))}
            </Select>
          </div>
          {errors.side ? (
            <p id={sideErrorId} className={styles.error}>
              {errors.side}
            </p>
          ) : null}
        </section>

        <section className={styles.group}>
          <h3 className={styles.heading}>Who they are with</h3>
          <div className={styles.row}>
            <TextField
              label="Household"
              value={draft.household}
              onChange={(e) => {
                patch({ household: e.target.value })
              }}
            />
            <Select
              label="Partner"
              value={draft.partnerOf ?? ''}
              onChange={(e) => {
                patch({ partnerOf: e.target.value === '' ? null : e.target.value })
              }}
            >
              <option value="">No partner</option>
              {partnerOptions.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </Select>
          </div>
          <PillInput
            label="Tags"
            value={draft.tags}
            suggestions={tagSuggestions}
            onChange={(next) => {
              patch({ tags: next })
            }}
          />
        </section>

        <section className={styles.group}>
          <h3 className={styles.heading}>Keep apart from</h3>
          <ConflictPicker
            label="Search guests"
            guests={guests}
            editingId={guest?.id ?? null}
            value={draft.conflictsWith}
            onChange={(next) => {
              patch({ conflictsWith: next })
            }}
          />
        </section>

        <section className={styles.group}>
          <h3 className={styles.heading}>Needs and seating</h3>
          <div className={styles.row}>
            <PillInput
              label="Allergies"
              value={draft.allergies}
              suggestions={KNOWN_ALLERGIES}
              restrictToSuggestions
              hint={ALLERGY_HINT}
              onChange={(next) => {
                patch({ allergies: next })
              }}
            />
            <PillInput
              label="Dietary preferences"
              value={draft.dietaryPreferences}
              suggestions={KNOWN_DIETARY_PREFERENCES}
              restrictToSuggestions
              hint={DIETARY_HINT}
              onChange={(next) => {
                patch({ dietaryPreferences: next })
              }}
            />
          </div>
          <div className={styles.row}>
            <PillInput
              label="Accessibility"
              value={draft.accessibility}
              suggestions={KNOWN_ACCESSIBILITY_NEEDS}
              onChange={(next) => {
                patch({ accessibility: next })
              }}
            />
            <Select
              label="Social type"
              value={draft.socialType}
              onChange={(e) => {
                patch({ socialType: e.target.value as SocialType })
              }}
            >
              {SOCIAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {capitalizeFirst(type)}
                </option>
              ))}
            </Select>
          </div>
        </section>
      </div>
    </SlideOver>
  )
}
