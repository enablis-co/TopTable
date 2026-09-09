import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

// Writes to public/scenarios/ relative to the repo root.
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'scenarios')

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BRIDE_SURNAMES = ['Shah', 'Patel', 'Desai', 'Mehta', 'Joshi', 'Kapoor', 'Nair', 'Bhatt', 'Rao', 'Chandra']
const GROOM_SURNAMES = ['Whitaker', 'Braithwaite', 'Hodgson', 'Sutcliffe', 'Ackroyd', 'Ramsden', 'Greenwood', 'Firth', 'Haigh', 'Crabtree']
const NEUTRAL_SURNAMES = ['Okonjo', 'Nowak', 'Bennett', 'Fraser', 'Adeyemi', 'Lindqvist', 'Kowalski', 'Doyle', 'Mercer', 'Nkemelu', 'Osei', 'Rahman', 'Silva', 'Novak', 'Bailey']

const M_OLD = ['Raj', 'Sanjay', 'Vikram', 'Geoffrey', 'Malcolm', 'Brian', 'Keith', 'Roger', 'Alan', 'Derek', 'Colin', 'Trevor']
const F_OLD = ['Maureen', 'Sunita', 'Anjali', 'Patricia', 'Barbara', 'Christine', 'Jean', 'Marilyn', 'Sylvia', 'Denise', 'Carol', 'Hazel']
const M_MID = ['Tom', 'Danny', 'Kev', 'Marcus', 'Arjun', 'Nathan', 'Craig', 'Dominic', 'Ravi', 'Callum', 'Josh', 'Owen', 'Liam', 'Femi', 'Piotr', 'Adam', 'Gareth', 'Rhys', 'Sam', 'Elliot']
const F_MID = ['Priya', 'Leah', 'Zoe', 'Aisha', 'Meera', 'Hannah', 'Fiona', 'Nisha', 'Chloe', 'Bethan', 'Rachel', 'Amara', 'Kasia', 'Jodie', 'Sian', 'Ellie', 'Tara', 'Naomi', 'Gemma', 'Ffion']
const KIDS = ['Rosie', 'Arun', 'Milo', 'Esme', 'Kai', 'Nia', 'Isaac', 'Anya', 'Freddie', 'Sofia', 'Jonah', 'Iris']

const TAG_POOL = ['uni', 'footie', 'work', 'school', 'neighbours', 'cricket', 'book club', 'choir', 'running club', 'travelling']
const ALLERGIES = ['nuts', 'shellfish', 'sesame', 'dairy']
const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'halal', 'gluten free']
const ACCESS = ['step-free access', 'away from the speakers', 'near an exit']
const SOCIAL = ['livewire', 'sociable', 'quiet']

// The shipped Guest.age type is a band, not a number (src/domain/types.ts) — but every draw,
// comparison and derivation inside build() below stays on the numeric age. g.age >= 70 on
// line ~68 short-circuits a chance() call, so changing when an age crosses a threshold would
// shift every r() call after it and silently rewrite the rest of the file. These boundaries
// duplicate src/domain/types.ts's AGE_BANDS/AgeBand/AGE_BAND_UPPER_BOUND — this is .mjs and
// cannot import a .ts file (verified: no tsx/ts-node/register hook, Node pinned at 22.14.0,
// no strip-types flag) — and src/domain/scenarioAges.test.ts imports this function directly
// (Vitest, unlike plain Node, can load a .mjs module from a .ts test) and checks it against
// the domain's boundaries at every edge, so the two cannot drift apart silently. Exported for
// that import; importing this file runs no other side effect — see isMain below.
export const AGE_BANDS = ['baby', 'child', 'teen', 'adult']
export function ageBand(years) {
  if (years < 4) return 'baby'
  if (years < 10) return 'child'
  if (years < 18) return 'teen'
  return 'adult'
}

const TOP_TABLE = [
  ['chief bridesmaid', 'F'], ['father of the groom', 'M'], ['mother of the bride', 'F'],
  ['groom', 'M'], ['bride', 'F'], ['father of the bride', 'M'],
  ['mother of the groom', 'F'], ['best man', 'M']
]

function build(name, total, roundTables, seatsEach, topSeats, conflictPairs, seed) {
  const r = rng(seed)
  const pick = a => a[Math.floor(r() * a.length)]
  const chance = p => r() < p

  const guests = []
  let n = 0
  const id = () => `g-${String(++n).padStart(3, '0')}`

  const used = new Set()
  const uniqueName = (pool, surname) => {
    for (let i = 0; i < 60; i++) {
      const full = `${pick(pool)} ${surname}`
      if (!used.has(full)) { used.add(full); return full }
    }
    const full = `${pick(pool)} ${surname} ${used.size}`
    used.add(full); return full
  }

  const make = (o) => {
    const g = {
      id: id(), name: o.name, side: o.side, role: o.role ?? 'guest',
      age: o.age, household: o.household, partnerOf: null,
      conflictsWith: [], tags: o.tags ?? [], allergies: [],
      dietaryPreferences: [], accessibility: [], socialType: pick(SOCIAL)
    }
    if (chance(0.06)) g.allergies = [pick(ALLERGIES)]
    if (chance(0.20)) g.dietaryPreferences = [pick(DIETS)]
    if (g.age >= 70 && chance(0.45)) g.accessibility = [pick(ACCESS)]
    else if (chance(0.02)) g.accessibility = [pick(ACCESS)]
    guests.push(g)
    return g
  }

  const partner = (a, b) => { a.partnerOf = b.id; b.partnerOf = a.id }
  const conflict = (a, b) => {
    if (a.id === b.id) return false
    if (a.conflictsWith.includes(b.id)) return false
    a.conflictsWith.push(b.id); b.conflictsWith.push(a.id); return true
  }

  const bride = make({ name: 'Priya Shah', side: 'both', role: 'bride', age: 33, household: 'couple', tags: ['uni'] })
  const groom = make({ name: 'Tom Whitaker', side: 'both', role: 'groom', age: 35, household: 'couple', tags: ['uni'] })
  partner(bride, groom)

  make({ name: 'Maureen Shah', side: 'bride', role: 'mother of the bride', age: 64, household: 'shah-parents', tags: ['family'] })
  make({ name: 'Sanjay Shah', side: 'bride', role: 'father of the bride', age: 67, household: 'shah-parents', tags: ['family'] })
  const bm = guests[guests.length - 1], bmo = guests[guests.length - 2]
  partner(bmo, bm)

  make({ name: 'Barbara Whitaker', side: 'groom', role: 'mother of the groom', age: 62, household: 'whitaker-parents', tags: ['family'] })
  make({ name: 'Geoffrey Whitaker', side: 'groom', role: 'father of the groom', age: 66, household: 'whitaker-parents', tags: ['family'] })
  const gf = guests[guests.length - 1], gm = guests[guests.length - 2]
  partner(gm, gf)

  make({ name: 'Danny Whitaker', side: 'groom', role: 'best man', age: 34, household: 'd-whitaker', tags: ['uni', 'footie'] })
  make({ name: 'Leah Okonjo', side: 'bride', role: 'chief bridesmaid', age: 32, household: 'l-okonjo', tags: ['uni'] })

  const partyExtra = Math.min(Math.floor(total / 18), 6)
  for (let i = 0; i < partyExtra; i++) {
    const bridesmaid = i % 2 === 0
    make({
      name: uniqueName(bridesmaid ? F_MID : M_MID, pick(NEUTRAL_SURNAMES)),
      side: bridesmaid ? 'bride' : 'groom',
      role: bridesmaid ? 'bridesmaid' : 'groomsman',
      age: 26 + Math.floor(r() * 12),
      household: `party-${i}`, tags: ['uni']
    })
  }

  let h = 0
  const friendRatio = total <= 45 ? 0.30 : total <= 80 ? 0.45 : 0.55
  while (guests.length < total) {
    const remaining = total - guests.length
    const isFriend = chance(friendRatio)
    const side = chance(0.5) ? 'bride' : 'groom'
    const surname = isFriend ? pick(NEUTRAL_SURNAMES) : pick(side === 'bride' ? BRIDE_SURNAMES : GROOM_SURNAMES)
    const household = `h-${++h}`
    const tags = isFriend ? [pick(TAG_POOL), ...(chance(0.35) ? [pick(TAG_POOL)] : [])] : ['family']
    const uniqTags = [...new Set(tags)]

    const shape = remaining >= 4 ? (chance(0.35) ? 'family' : chance(0.6) ? 'couple' : 'single')
      : remaining >= 2 ? (chance(0.6) ? 'couple' : 'single') : 'single'

    if (shape === 'single') {
      const older = chance(0.25)
      make({
        name: uniqueName(chance(0.5) ? (older ? M_OLD : M_MID) : (older ? F_OLD : F_MID), surname),
        side, age: older ? 66 + Math.floor(r() * 18) : 24 + Math.floor(r() * 30),
        household, tags: uniqTags
      })
    } else {
      const older = chance(0.3)
      const a = make({ name: uniqueName(older ? M_OLD : M_MID, surname), side, age: older ? 63 + Math.floor(r() * 20) : 28 + Math.floor(r() * 26), household, tags: uniqTags })
      const b = make({ name: uniqueName(older ? F_OLD : F_MID, surname), side, age: a.age - 1 - Math.floor(r() * 5), household, tags: uniqTags })
      partner(a, b)
      if (shape === 'family' && total - guests.length >= 2 && chance(0.75)) {
        const kids = 1 + Math.floor(r() * 2)
        for (let k = 0; k < kids && guests.length < total; k++) {
          make({ name: uniqueName(KIDS, surname), side, age: 3 + Math.floor(r() * 13), household, tags: uniqTags })
        }
      }
    }
  }

  const minAllergies = Math.max(2, Math.round(total * 0.04))
  const adults = guests.filter(g => g.age >= 18)
  let ai = 0
  while (guests.filter(g => g.allergies.length).length < minAllergies && ai < adults.length * 3) {
    const g = adults[Math.floor(r() * adults.length)]
    if (!g.allergies.length) g.allergies = [pick(ALLERGIES)]
    ai++
  }

  const eligible = guests.filter(g => !['bride', 'groom', 'best man', 'chief bridesmaid'].includes(g.role) && g.age >= 21)
  let made = 0, guard = 0
  while (made < conflictPairs && guard++ < 500) {
    const a = pick(eligible), b = pick(eligible)
    if (a.household === b.household) continue
    if (a.partnerOf === b.id) continue
    if (conflict(a, b)) made++
  }

  return {
    meta: {
      scenario: name,
      guests: guests.length,
      tables: { roundTables, seatsEach, topTableSeats: topSeats },
      seats: roundTables * seatsEach + topSeats,
      spare: roundTables * seatsEach + topSeats - guests.length
    },
    guests
  }
}

// Node's ESM equivalent of `require.main === module`: true when this file is run directly
// (`npm run generate:scenarios`), false when it is imported for its exports — as
// src/domain/scenarioAges.test.ts does for `ageBand`/`AGE_BANDS`. Guarded so that import can
// never write a file, touch the console, or spend the time building three scenarios.
const isMain = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const scenarios = [
    build('Small and cosy', 40, 4, 8, 8, 1, 20260922),
    build('Adding up', 70, 9, 8, 6, 3, 20260929),
    build('Celebrity scale', 200, 26, 8, 8, 9, 20261014)
  ]

  // Convert at serialisation only, after every numeric draw in build() is already made. `meta`
  // is untouched — it is computed from constants and guests.length, neither of which the band
  // conversion changes.
  const banded = scenarios.map((s) => ({
    ...s,
    guests: s.guests.map((g) => ({ ...g, age: ageBand(g.age) })),
  }))

  mkdirSync(OUT, { recursive: true })
  const slugs = ['small-and-cosy', 'adding-up', 'celebrity-scale']
  banded.forEach((s, i) => {
    writeFileSync(join(OUT, `${slugs[i]}.json`), JSON.stringify(s, null, 2))
  })

  // Validates the banded payload actually being shipped, not the internal numeric one, so a
  // bug in ageBand() itself would be caught here too.
  for (const s of banded) {
    const ids = new Set(s.guests.map(g => g.id))
    const errs = []
    for (const g of s.guests) {
      if (g.partnerOf) {
        if (!ids.has(g.partnerOf)) errs.push(`${g.id} partner missing`)
        else if (s.guests.find(x => x.id === g.partnerOf).partnerOf !== g.id) errs.push(`${g.id} partner not reciprocal`)
      }
      for (const c of g.conflictsWith) {
        if (!ids.has(c)) errs.push(`${g.id} conflict missing`)
        else if (!s.guests.find(x => x.id === c).conflictsWith.includes(g.id)) errs.push(`${g.id} conflict not reciprocal`)
        if (c === g.id) errs.push(`${g.id} self conflict`)
      }
      if (!g.name || !g.side || !AGE_BANDS.includes(g.age)) errs.push(`${g.id} missing core field`)
    }
    const roles = TOP_TABLE.map(t => t[0])
    for (const role of roles) {
      const c = s.guests.filter(g => g.role === role).length
      if (c !== 1) errs.push(`role ${role} count ${c}`)
    }
    const m = s.meta
    console.log(`${m.scenario}: ${m.guests} guests, ${m.tables.roundTables}x${m.tables.seatsEach}+${m.tables.topTableSeats}=${m.seats} seats, ${m.spare} spare`)
    console.log(`  households ${new Set(s.guests.map(g => g.household)).size} · couples ${s.guests.filter(g => g.partnerOf).length / 2} · conflicts ${s.guests.reduce((a, g) => a + g.conflictsWith.length, 0) / 2} · under 18 ${s.guests.filter(g => ['baby', 'child', 'teen'].includes(g.age)).length}`)
    console.log(`  allergies ${s.guests.filter(g => g.allergies.length).length} · diets ${s.guests.filter(g => g.dietaryPreferences.length).length} · access ${s.guests.filter(g => g.accessibility.length).length} · tags ${new Set(s.guests.flatMap(g => g.tags)).size}`)
    console.log(errs.length ? `  FAIL ${errs.slice(0, 6).join('; ')}` : '  validation passed')
  }
}
