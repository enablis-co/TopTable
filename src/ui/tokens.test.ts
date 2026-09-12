import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// This file lives at src/ui/tokens.test.ts, so src/ is two directories up.
const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)))

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

function toSrcRelative(path: string): string {
  return relative(SRC_DIR, path).split('\\').join('/')
}

function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/.test(path)
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/**
 * Comments are prose, not code. Without this, a comment explaining why a rule
 * uses `var(--table-size)` reads as a real, fallback-less reference and fails
 * the guard below — which is exactly the trap brand.test.ts's own /green|success/
 * grep carries, reproduced here. Block comments only: they are valid in both CSS
 * and TSX, and a `//` strip risks eating a `://` inside a string.
 * TT-38 is where this bit.
 */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '')
}

const ALL_FILES = walk(SRC_DIR)
const CSS_FILES = ALL_FILES.filter((file) => file.endsWith('.css'))
// Test files are excluded for the same reason brand.test.ts excludes them: they
// exercise a component rather than ship with it, so harness scaffolding isn't
// held to the token discipline the app itself is.
const TSX_FILES = ALL_FILES.filter((file) => file.endsWith('.tsx') && !isTestFile(file))
const STYLE_AND_MARKUP_FILES = [...CSS_FILES, ...TSX_FILES]

const BASE_PATH = join(SRC_DIR, 'ui', 'base.css')

// Every var(--name) occurrence in `content`, wherever it sits, including nested
// inside another var()'s own fallback. Depth-tracked rather than regex-matched
// in one shot, because that is what tells `var(--x, var(--y, 8px))` apart from
// a bare, fallback-less reference to --x: a comma only belongs to the outer
// var() if it appears before that var()'s own closing paren.
function findVarReferences(content: string): { name: string; hasFallback: boolean }[] {
  const refs: { name: string; hasFallback: boolean }[] = []
  for (const match of content.matchAll(/var\(/g)) {
    const start = (match.index ?? 0) + (match[0]?.length ?? 0)
    let depth = 1
    let commaIndex = -1
    let i = start
    while (i < content.length && depth > 0) {
      const char = content[i]
      if (char === '(') depth++
      else if (char === ')') {
        depth--
        if (depth === 0) break
      } else if (char === ',' && depth === 1 && commaIndex === -1) {
        commaIndex = i
      }
      i++
    }
    const nameText = content.slice(start, commaIndex === -1 ? i : commaIndex).trim()
    if (/^--[A-Za-z0-9-]+$/.test(nameText)) {
      refs.push({ name: nameText, hasFallback: commaIndex !== -1 })
    }
  }
  return refs
}

// Every `--name:` declaration in `content`. A declaration is the name directly
// followed, whitespace aside, by a colon; the same name inside var(--name) is
// followed by `)` or `,` instead, so the two patterns never collide.
function findDeclaredNames(content: string): string[] {
  const names: string[] = []
  for (const match of content.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) {
    const name = match[1]
    if (name) names.push(name)
  }
  return names
}

// The declaration-block bodies of every top-level rule whose selector text
// contains `selectorSubstring`. Not a real CSS parser — it assumes rule bodies
// don't themselves contain braces — but every stylesheet this runs against is
// flat, so a single brace-pair scan is enough.
function extractRuleBodiesForSelector(css: string, selectorSubstring: string): string[] {
  const bodies: string[] = []
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1] ?? ''
    const body = match[2] ?? ''
    if (selector.includes(selectorSubstring)) bodies.push(body)
  }
  return bodies
}

// The raw text of every `className=` value in a .tsx file, both the
// quoted-string form and the brace-delimited expression form. Brace depth is
// tracked so an expression like `cx(styles.a, isOn && styles.b)` is captured
// whole rather than cut at its own inner parens.
function extractClassNameExpressions(content: string): string[] {
  const expressions: string[] = []
  for (const match of content.matchAll(/className\s*=\s*/g)) {
    const start = (match.index ?? 0) + (match[0]?.length ?? 0)
    const opening = content[start]
    if (opening === '"' || opening === "'") {
      const end = content.indexOf(opening, start + 1)
      if (end !== -1) expressions.push(content.slice(start + 1, end))
    } else if (opening === '{') {
      let depth = 1
      let i = start + 1
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++
        else if (content[i] === '}') {
          depth--
          if (depth === 0) break
        }
        i++
      }
      expressions.push(content.slice(start + 1, i))
    }
  }
  return expressions
}

describe('token guards', () => {
  // TT-35 AC2 ("Tokens are taken from the canvas and defined once... None is
  // left on the old ones"): a 287-reference rename across 35 stylesheets is
  // only safe if a renamed-and-missed reference is loud. Every other style
  // test in this suite string-matches CSS source and none resolves a custom
  // property, so on its own the app would render wrong — a spacing or type
  // rule silently falling back to nothing — under a fully green gate. This is
  // what makes that failure mode visible.
  it('resolves every var(--x) reference under src/ to a declaration under src/', () => {
    const declared = new Set<string>()
    for (const file of CSS_FILES) {
      for (const name of findDeclaredNames(stripComments(read(file)))) declared.add(name)
    }

    const offenders = new Set<string>()
    for (const file of STYLE_AND_MARKUP_FILES) {
      for (const ref of findVarReferences(stripComments(read(file)))) {
        if (ref.hasFallback) continue
        if (!declared.has(ref.name)) {
          offenders.add(`${toSrcRelative(file)}: ${ref.name}`)
        }
      }
    }
    expect([...offenders]).toEqual([])
  })

  // TT-35 AC2 ("None is left on the old ones"). Kept as its own case rather
  // than folded into the guard above so a failure reads "still on the old
  // scale" instead of "undefined token" — the fix for one is a rename at the
  // call site, the fix for the other is a missing declaration, and pointing at
  // the wrong one wastes a debugging pass.
  it('has no reference to the retired --space- or --text- token scale', () => {
    const offenders: string[] = []
    for (const file of STYLE_AND_MARKUP_FILES) {
      const content = stripComments(read(file))
      if (/--space-/.test(content) || /--text-/.test(content)) {
        offenders.push(toSrcRelative(file))
      }
    }
    expect(offenders).toEqual([])
  })

  // TT-35 AC5 ("Tabular figures survive on every number that updates... must
  // not jitter as you type"). Plex Mono is already fixed-width, so on its own
  // this guard would have nothing to catch — it exists for the fallback chain,
  // which ends at ui-monospace. tabular-nums is what keeps a figure's width
  // steady if that fallback is what actually loads, so both declarations have
  // to be present, not just one of them.
  it('defines .tt-num with both the mono family and tabular-nums figures', () => {
    expect(existsSync(BASE_PATH), 'expected src/ui/base.css to exist').toBe(true)
    const bodies = extractRuleBodiesForSelector(read(BASE_PATH), '.tt-num')
    expect(bodies.length, 'expected base.css to define a .tt-num rule').toBeGreaterThan(0)
    const combined = bodies.join('\n')
    expect(combined).toMatch(/font-family\s*:\s*var\(--font-mono\)/)
    expect(combined).toMatch(/font-variant-numeric\s*:\s*tabular-nums/)
  })

  // TT-35 AC5's silent failure mode. The `font:` shorthand resets font-family
  // (and font-variant-numeric) wherever it lands. That's harmless on an
  // ancestor of a tt-num element, because a rule on the element itself wins
  // over inheritance — but not on the element that carries tt-num directly:
  // there the shorthand quietly drops the mono family back to sans and the
  // figure starts jittering again, with every other test in the suite still
  // green because none of them resolve a custom property or a cascade.
  //
  // This is a static approximation, not a cascade evaluator, and the gap is
  // worth being explicit about rather than implying a stronger check exists:
  //  - it only looks at literal `className="..."` / `className={...}` text —
  //    a class name assembled in a variable above and referenced by that
  //    variable's name is invisible to it;
  //  - it only recognises the `styles.foo` access pattern — a differently
  //    named import alias, or bracket access, is not found;
  //  - it does not resolve specificity, ordering or state — a `.foo:hover {
  //    font: … }` rule is flagged exactly like an unconditional one.
  // Every gap here fails toward a false positive (a combination worth a human
  // glance that turns out to be fine), never toward a silent miss.
  it('never combines tt-num with a class whose rule sets the font shorthand', () => {
    const offenders = new Set<string>()
    for (const file of TSX_FILES) {
      const content = read(file)
      const modulePath = file.replace(/\.tsx$/, '.module.css')
      let moduleCss: string | null = null

      for (const expression of extractClassNameExpressions(content)) {
        const carriesTabular = /\btabularClass\b/.test(expression) || /\btt-num\b/.test(expression)
        if (!carriesTabular) continue

        const moduleClasses = [...expression.matchAll(/\bstyles\.([A-Za-z0-9_]+)/g)]
          .map((match) => match[1])
          .filter((name): name is string => Boolean(name))
        if (moduleClasses.length === 0) continue

        if (moduleCss === null) {
          moduleCss = existsSync(modulePath) ? read(modulePath) : ''
        }
        for (const className of moduleClasses) {
          const bodies = extractRuleBodiesForSelector(moduleCss, `.${className}`)
          if (bodies.some((body) => /\bfont\s*:/.test(body))) {
            offenders.add(`${toSrcRelative(file)}: .${className}`)
          }
        }
      }
    }
    expect([...offenders]).toEqual([])
  })
})
