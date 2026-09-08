import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// This file lives at src/ui/brand.test.ts, so src/ is two directories up.
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

const ALL_FILES = walk(SRC_DIR)
const CSS_FILES = ALL_FILES.filter((file) => file.endsWith('.css'))
// Test files are excluded: they exist to exercise the components, not to
// ship, and several of the sibling test files in this same plan render a
// plain <button> or an inline colour purely as harness scaffolding.
const TSX_FILES = ALL_FILES.filter((file) => file.endsWith('.tsx') && !isTestFile(file))
const STYLE_AND_MARKUP_FILES = [...CSS_FILES, ...TSX_FILES]

const TOKENS_PATH = join(SRC_DIR, 'ui', 'tokens.css')
const BASE_PATH = join(SRC_DIR, 'ui', 'base.css')

function containsColorLiteral(text: string): boolean {
  return (
    /#[0-9a-fA-F]{3,8}\b/.test(text) ||
    text.includes('rgb(') ||
    text.includes('rgba(') ||
    text.includes('hsl(')
  )
}

describe('brand guards', () => {
  it('keeps every colour literal inside src/ui/tokens.css', () => {
    const offenders = STYLE_AND_MARKUP_FILES.filter(
      (file) => file !== TOKENS_PATH && containsColorLiteral(read(file))
    )
    expect(offenders.map(toSrcRelative)).toEqual([])
  })

  it('defines the KB-5 palette tokens in tokens.css at their published values', () => {
    expect(existsSync(TOKENS_PATH), 'expected src/ui/tokens.css to exist').toBe(true)
    const tokensCss = read(TOKENS_PATH)

    // Published on KB-5 "Brand and visual language" with concrete hex values.
    // KB-5 also names further shades (a hover, a disabled-adjacent tone, and
    // so on) without publishing a value for them; those are out of scope for
    // an "exactly the published value" check and are not asserted here.
    const palette: Record<string, string> = {
      paper: '#F7F5F0',
      surface: '#FFFFFF',
      sunken: '#EFECE4',
      ink: '#1C1B18',
      'ink-muted': '#6B6862',
      rule: '#DDD8CE',
      slate: '#23303F',
      hard: '#B3261E',
      soft: '#B26A00',
    }

    for (const [name, value] of Object.entries(palette)) {
      const pattern = new RegExp(`--${name}\\s*:\\s*${value}\\b`, 'i')
      expect(tokensCss, `expected tokens.css to define --${name} as ${value}`).toMatch(pattern)
    }
  })

  it('has no green and no success colour, as a token name or a literal', () => {
    const offenders = STYLE_AND_MARKUP_FILES.filter((file) => /green|success/i.test(read(file)))
    expect(offenders.map(toSrcRelative)).toEqual([])
  })

  it('contains no box-shadow, text-shadow or drop-shadow in any stylesheet', () => {
    const offenders = CSS_FILES.filter((file) =>
      /box-shadow|text-shadow|drop-shadow/i.test(read(file))
    )
    expect(offenders.map(toSrcRelative)).toEqual([])
  })

  it('never removes an outline, and defines a focus-visible rule in base.css', () => {
    const offenders = CSS_FILES.filter((file) => /outline\s*:\s*(none|0)\b/i.test(read(file)))
    expect(offenders.map(toSrcRelative)).toEqual([])

    expect(existsSync(BASE_PATH), 'expected src/ui/base.css to exist').toBe(true)
    expect(read(BASE_PATH)).toMatch(/:focus-visible/)
  })

  it('uses only the allowed font-weight values anywhere under src/', () => {
    const allowed = new Set([
      '400',
      '500',
      'var(--weight-regular)',
      'var(--weight-medium)',
      'inherit',
      'normal',
    ])
    const violations: string[] = []

    for (const file of STYLE_AND_MARKUP_FILES) {
      const content = read(file)
      for (const match of content.matchAll(/font-weight\s*:\s*([^;}\n]+)/gi)) {
        const raw = (match[1] ?? '').trim()
        const normalised = raw.replace(/\s+/g, '').toLowerCase()
        if (!allowed.has(normalised)) {
          violations.push(`${toSrcRelative(file)}: font-weight: ${raw}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('contains no text-transform: uppercase in any stylesheet', () => {
    const offenders = CSS_FILES.filter((file) =>
      /text-transform\s*:\s*uppercase\b/i.test(read(file))
    )
    expect(offenders.map(toSrcRelative)).toEqual([])
  })

  it('renders no raw input, select or textarea outside the shared-component module', () => {
    const offenders = TSX_FILES.filter((file) => {
      if (toSrcRelative(file).startsWith('ui/')) return false
      const content = read(file)
      return /<input\b/.test(content) || /<select\b/.test(content) || /<textarea\b/.test(content)
    })
    expect(offenders.map(toSrcRelative)).toEqual([])
  })

  it('renders no raw button outside the shared-component module or the shell', () => {
    const offenders = TSX_FILES.filter((file) => {
      const rel = toSrcRelative(file)
      if (rel.startsWith('ui/') || rel.startsWith('shell/')) return false
      const content = read(file)
      return /<button\b/.test(content)
    })
    expect(offenders.map(toSrcRelative)).toEqual([])
  })
})
