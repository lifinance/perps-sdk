import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  DECIMAL_PATTERN,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  type Position,
  PositionMarginAdjustment,
  PositionSide,
  type RegularOrder,
  TimeInForce,
} from '@lifi/perps-types'
import { beforeAll, describe, expect, it } from 'vitest'
import * as sdk from './index.js'
import { venueClient, venueMarket } from './wire/venueProvider.mock.js'

/** Internals that must never reach the public entry point. */
const NEVER_EXPORTED: readonly string[] = ['DivBig', 'TruncBig', 'areFinite']

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const TYPES_ROOT = join(PACKAGE_ROOT, 'dist', 'types')

interface ExportedName {
  /** Name as the public entry point spells it. */
  exported: string
  /** Name the declaring module spells it, which an `as` rename changes. */
  local: string
  /** Declaring module specifier, relative to the entry point. */
  from: string
}

const EXPORT_BLOCK = /export\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g

function parseEntryExports(declaration: string): ExportedName[] {
  const names: ExportedName[] = []
  for (const [, block, from] of declaration.matchAll(EXPORT_BLOCK)) {
    if (!from.startsWith('.')) {
      continue
    }
    for (const raw of block.split(',')) {
      const entry = raw.trim().replace(/^type\s+/, '')
      if (!entry) {
        continue
      }
      const [local, exported] = entry.split(/\s+as\s+/)
      names.push({ exported: exported ?? local, local, from })
    }
  }
  return names
}

/** A `}` that one of these characters follows continues its statement. */
const CONTINUES_STATEMENT: Record<string, true> = {
  '&': true,
  '|': true,
  '[': true,
  ')': true,
  '>': true,
}

/**
 * Split a declaration file into top-level statements. Comments are stripped
 * first, so a `Big` named in prose never counts as a signature. A `}` ends a
 * statement only when no intersection, union or indexed access continues it.
 */
function topLevelStatements(declaration: string): string[] {
  const source = declaration
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const statements: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '{' || char === '(' || char === '[') {
      depth++
    } else if (char === '}' || char === ')' || char === ']') {
      depth--
      if (depth === 0 && char === '}') {
        let next = i + 1
        while (next < source.length && ' \t\r\n'.includes(source[next] ?? '')) {
          next++
        }
        if (!CONTINUES_STATEMENT[source[next] ?? '']) {
          statements.push(source.slice(start, i + 1).trim())
          start = i + 1
        }
      }
    } else if (char === ';' && depth === 0) {
      statements.push(source.slice(start, i).trim())
      start = i + 1
    }
  }
  return statements.filter(Boolean)
}

const DECLARED_NAME =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:function|const|let|var|class|interface|enum|type|namespace)\s+([A-Za-z_$][\w$]*)/

/** `export declare const old: typeof new` — a deprecated alias in the emit. */
const TYPEOF_ALIAS = /:\s*typeof\s+([A-Za-z_$][\w$]*)\s*$/

/**
 * Every top-level declaration per name. A name carries more than one when it
 * heads an overload set, or when a value declaration and a type declaration
 * merge under it.
 */
function declarationsByName(declaration: string): Record<string, string[]> {
  // Null prototype: an identifier such as `toString` must not resolve to
  // `Object.prototype` when a declaration names it.
  const byName: Record<string, string[]> = Object.create(null)
  for (const statement of topLevelStatements(declaration)) {
    const name = DECLARED_NAME.exec(statement)?.[1]
    if (name) {
      const declarations = byName[name] ?? []
      declarations.push(statement)
      byName[name] = declarations
    }
  }
  return byName
}

/**
 * Every declaration a name exposes, with each `typeof` alias replaced by the
 * declarations it forwards to, so a deprecated alias is checked against what
 * it forwards to. An alias whose target this module does not declare keeps its
 * own statement, so the caller can follow the target across modules.
 */
function resolveSignature(
  name: string,
  byName: Record<string, string[]>
): string[] {
  const resolved: string[] = []
  const seen = new Set<string>([name])
  const queue: string[] = [name]
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const statement of byName[current] ?? []) {
      const target = TYPEOF_ALIAS.exec(statement)?.[1]
      if (target && byName[target] && !seen.has(target)) {
        seen.add(target)
        queue.push(target)
      } else {
        resolved.push(statement)
      }
    }
  }
  return resolved
}

const IDENTIFIER = /[A-Za-z_$][\w$]*/g
const IMPORT_BLOCK = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g

/** Where a name a declaration references is declared. */
interface DeclarationSite {
  /** Declaration file holding the name. */
  path: string
  /** Name as that file spells it. */
  name: string
}

interface DeclarationModule {
  byName: Record<string, string[]>
  /** Declaration site per name the module takes from a relative module. */
  importedFrom: Record<string, DeclarationSite>
}

type ModuleLoader = (path: string) => DeclarationModule | undefined

function parseModule(declaration: string, path: string): DeclarationModule {
  const importedFrom: Record<string, DeclarationSite> = Object.create(null)
  for (const [, block, from] of declaration.matchAll(IMPORT_BLOCK)) {
    if (!from.startsWith('.')) {
      continue
    }
    const target = join(dirname(path), from.replace(/\.js$/, '.d.ts'))
    for (const raw of block.split(',')) {
      const entry = raw.trim().replace(/^type\s+/, '')
      if (!entry) {
        continue
      }
      const [name, local] = entry.split(/\s+as\s+/)
      importedFrom[local ?? name] = { path: target, name }
    }
  }
  return { byName: declarationsByName(declaration), importedFrom }
}

/**
 * The declaration text a public export exposes: every statement its name
 * carries plus every declaration those statements name, followed transitively
 * through the module's relative imports. A type a public signature names
 * belongs to the boundary even when no module exports it; a declaration no
 * public signature reaches stays internal.
 */
function signatureClosure(
  site: DeclarationSite,
  load: ModuleLoader
): string | undefined {
  const seen = new Set<string>([`${site.path}#${site.name}`])
  const queue: DeclarationSite[] = [site]
  const reached: string[] = []
  while (queue.length > 0) {
    const current = queue.shift() as DeclarationSite
    const module = load(current.path)
    if (!module) {
      continue
    }
    for (const statement of resolveSignature(current.name, module.byName)) {
      reached.push(statement)
      for (const [identifier] of statement.matchAll(IDENTIFIER)) {
        const next = module.byName[identifier]
          ? { path: current.path, name: identifier }
          : module.importedFrom[identifier]
        if (!next) {
          continue
        }
        const key = `${next.path}#${next.name}`
        if (seen.has(key)) {
          continue
        }
        seen.add(key)
        queue.push(next)
      }
    }
  }
  return reached.length > 0 ? reached.join('\n') : undefined
}

function returnTypeOf(statements: readonly string[]): string | undefined {
  for (const statement of statements) {
    const normalised = statement.replace(/\s+/g, ' ').trim()
    const returns =
      /=> ([A-Za-z_$][\w$]*)$/.exec(normalised)?.[1] ??
      /\) ?: ([A-Za-z_$][\w$]*)$/.exec(normalised)?.[1]
    if (returns) {
      return returns
    }
  }
  return undefined
}

let entryExports: ExportedName[] = []
/** Declaration text per public export name; absent for a pure value re-export. */
const signatures: Record<string, string[]> = {}
/** Signature plus every module-local declaration it names, per export name. */
const boundaryText: Record<string, string> = {}
/** Declaring module text per public export name, the conservative fallback. */
const declaringModule: Record<string, string> = {}

beforeAll(() => {
  execFileSync(
    join(PACKAGE_ROOT, 'node_modules', '.bin', 'tsc'),
    ['--build', 'tsconfig.build.json'],
    { cwd: PACKAGE_ROOT, stdio: 'pipe' }
  )
  const entry = readFileSync(join(TYPES_ROOT, 'index.d.ts'), 'utf8')
  entryExports = parseEntryExports(entry)

  const textCache: Record<string, string> = {}
  const moduleCache: Record<string, DeclarationModule> = {}
  const load: ModuleLoader = (path) => {
    if (moduleCache[path] === undefined) {
      if (!existsSync(path)) {
        return undefined
      }
      textCache[path] = readFileSync(path, 'utf8')
      moduleCache[path] = parseModule(textCache[path], path)
    }
    return moduleCache[path]
  }

  for (const { exported, local, from } of entryExports) {
    const path = join(TYPES_ROOT, from.replace(/\.js$/, '.d.ts'))
    const module = load(path)
    if (!module) {
      continue
    }
    declaringModule[exported] = textCache[path]
    const declarations = resolveSignature(local, module.byName)
    if (declarations.length > 0) {
      signatures[exported] = declarations
    }
    const closure = signatureClosure({ path, name: local }, load)
    if (closure) {
      boundaryText[exported] = closure
    }
  }
})

const mentionsBig = (text: string): boolean => /\bBig\b/.test(text)

describe('Big never crosses the public API boundary', () => {
  it('builds declarations for every re-exported module', () => {
    expect(entryExports.length).toBeGreaterThan(0)
    const unresolved = entryExports
      .filter(({ exported }) => declaringModule[exported] === undefined)
      .map(({ exported }) => exported)
    expect(unresolved).toEqual([])
  })

  it('names Big in no exported signature', () => {
    const offenders = entryExports
      .map(({ exported }) => exported)
      .filter((name) =>
        mentionsBig(boundaryText[name] ?? declaringModule[name] ?? '')
      )
    expect(offenders).toEqual([])
  })

  it.each(NEVER_EXPORTED)('does not export %s', (name) => {
    expect(entryExports.map((e) => e.exported)).not.toContain(name)
    expect(Object.keys(sdk)).not.toContain(name)
  })
})

/**
 * A two-module emit in the shape `tsc` produces: a public function returns a
 * module-local interface that carries a `Big`, another takes an interface
 * imported from a sibling module that carries one, a deprecated alias forwards
 * to the first, and an internal helper takes a `Big` no export reaches. The
 * remaining declarations hold a `Big` on an earlier overload, on the value half
 * of a merged declaration, and after the first top-level `}` of a signature.
 */
const ORDER_EMIT_PATH = '/emit/order.d.ts'
const GRID_EMIT_PATH = '/emit/grid.d.ts'

const EMIT: Record<string, string> = {
  [ORDER_EMIT_PATH]: `
import type Big from 'big.js';
import type { Grid } from './grid.js';
export declare function walkBook(levels: number[]): BookWalk;
export declare const legacyWalkBook: typeof walkBook;
export declare function snapSize(size: string, grid: Grid): string;
export declare function sumSizes(levels: number[]): number;
export declare function scale(value: Big, decimals: number): string;
export declare function scale(value: string, decimals: number): string;
export declare const Limits: {
    readonly max: Big;
};
export type Limits = (typeof Limits)[keyof typeof Limits];
export declare function splitSize(size: string): {
    base: number;
} & {
    raw: Big;
};
export declare function labelSize(size: string): {
    label: string;
} | Big;
export declare const cycleA: typeof cycleB;
export declare const cycleB: typeof cycleA;
interface BookWalk {
    vwap: number;
    vwapBig: Big;
}
declare function parseLevel(level: string): Big;
`,
  [GRID_EMIT_PATH]: `
import type Big from 'big.js';
export interface Grid {
    tick: Big;
}
`,
}

const loadEmit: ModuleLoader = (path) =>
  EMIT[path] === undefined ? undefined : parseModule(EMIT[path], path)

const emitClosure = (name: string): string =>
  signatureClosure({ path: ORDER_EMIT_PATH, name }, loadEmit) ?? ''

describe('the declaration scan follows named types to the Big they hide', () => {
  it('reaches a Big on the module-local interface a signature returns', () => {
    expect(mentionsBig(emitClosure('walkBook'))).toBe(true)
  })

  it('reaches it through a deprecated typeof alias as well', () => {
    expect(mentionsBig(emitClosure('legacyWalkBook'))).toBe(true)
  })

  it('reaches it through an interface imported from a sibling module', () => {
    expect(mentionsBig(emitClosure('snapSize'))).toBe(true)
  })

  it('leaves an internal Big no exported signature names alone', () => {
    expect(mentionsBig(emitClosure('sumSizes'))).toBe(false)
  })

  it('reaches a Big on an earlier overload of an overload set', () => {
    expect(mentionsBig(emitClosure('scale'))).toBe(true)
  })

  it('reaches a Big on the value half of a merged declaration', () => {
    expect(mentionsBig(emitClosure('Limits'))).toBe(true)
  })

  it('reaches a Big in an intersection that follows an object type', () => {
    expect(mentionsBig(emitClosure('splitSize'))).toBe(true)
  })

  it('reaches a Big in a union that follows an object type', () => {
    expect(mentionsBig(emitClosure('labelSize'))).toBe(true)
  })

  it('terminates on a cycle of typeof aliases', () => {
    expect(mentionsBig(emitClosure('cycleA'))).toBe(false)
  })
})

const sdkExports: Record<string, unknown> = { ...sdk }

function callExport(name: string, args: readonly unknown[]): unknown {
  const fn = sdkExports[name]
  if (typeof fn !== 'function') {
    throw new Error(`${name} is not an exported function`)
  }
  return Reflect.apply(fn, undefined, args)
}

const MARKET = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const LONG_POSITION: Position = {
  market: MARKET,
  side: PositionSide.LONG,
  size: '1',
  entryPrice: '100',
  markPrice: '100',
  liquidationPrice: '0',
  unrealizedPnl: '0',
  accruedFunding: '0',
  leverage: 1,
  marginUsed: '0',
  initialMarginRequirement: '0',
  marginMode: MarginMode.CROSS,
}

const SELL_LIMIT: RegularOrder = {
  orderId: 'order-1',
  market: MARKET,
  type: OrderType.LIMIT,
  side: OrderSide.SELL,
  originalSize: '1',
  remainingSize: '1',
  filledSize: '0',
  price: '150',
  reduceOnly: false,
  status: OrderStatus.OPEN,
  timeInForce: TimeInForce.GTC,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

const LIQUIDATION_INPUT = {
  entryPrice: 100,
  leverage: 10,
  isLong: true,
  maintenanceMarginRate: 0.01,
}

/** One sample call per display-tier formula, keyed by its public name. */
const MATH_SAMPLES: Record<string, readonly unknown[]> = {
  applySlippage: [100, 0.5, true],
  calculateEffectiveLeverage: [{ positionValueUsd: 10000, marginUsd: 1000 }],
  calculateExpectedPnl: [0.77, 0.7, 3, true, 10],
  calculateLiquidationDistance: [
    { liquidationPrice: 45000, currentPrice: 50000 },
  ],
  calculateNotionalValue: [0.5, 60000],
  calculatePositionSize: [1000, 10, 50000],
  calculateRealizedPnl: [
    { entryPrice: 100, closePrice: 150, closeSize: 1, isLong: true },
  ],
  calculateRealizedPnlPercent: [50, 1, 500],
  calculateRequiredMargin: [10000, 10],
  calculateRoe: [500, 1000],
  calculateSize: [1000, 10, 50000],
  calculateTriggerPercent: [0.77, 0.7, 3, true],
  calculateTriggerPrice: [30, 0.7, 3, true],
  calculateUnrealizedPnl: [50000, 55000, 1],
  estimateAverageEntryPrice: [
    { currentSize: 1, currentEntry: 100, addSize: 1, fillPrice: 200 },
  ],
  estimateFees: [10000, 0.00035],
  estimateIsolatedLiquidationPrice: [LIQUIDATION_INPUT],
  estimateLiquidationPrice: [LIQUIDATION_INPUT],
  estimateNewLeverage: [
    {
      currentNotional: 1000,
      currentMargin: 100,
      addNotional: 500,
      addMargin: 50,
    },
  ],
  estimateRealizedPnl: [SELL_LIMIT, LONG_POSITION],
  estimateUnrealizedPnl: [
    { entryPrice: 100, markPrice: 110, size: 2, isLong: true },
  ],
}

/** Formulas whose numbers sit on fields rather than on the return value. */
const NUMERIC_FIELDS: Record<string, readonly string[]> = {
  calculateExpectedPnl: ['amount', 'percent'],
}

const DISPLAY_VERB = /^(calculate|estimate|apply)/

const mathFormulaExports = (): string[] =>
  entryExports
    .filter(({ from }) => from.startsWith('./math/'))
    .map(({ exported }) => exported)
    .filter((name) => DISPLAY_VERB.test(name))
    .sort()

describe('display-tier formulas give back numbers', () => {
  it('samples every calculate/estimate/apply export under math/', () => {
    expect(mathFormulaExports()).toEqual(Object.keys(MATH_SAMPLES).sort())
  })

  it('gives back a number for each sample call', () => {
    for (const [name, args] of Object.entries(MATH_SAMPLES)) {
      const result = callExport(name, args)
      const fields = NUMERIC_FIELDS[name]
      if (fields) {
        for (const field of fields) {
          expect(typeof Object(result)[field], `${name}.${field}`).toBe(
            'number'
          )
        }
        continue
      }
      expect(typeof result, name).toBe('number')
    }
  })
})

const EN_US = { locale: 'en-US' }

/**
 * One sample call per human formatter at an input of 1000 or more, with the
 * marker that proves the output is for a screen: grouped digits, a compact
 * magnitude suffix, or the percent sign `formatSignedPercent` carries in place
 * of grouping.
 */
const FORMAT_SAMPLES: Record<
  string,
  { args: readonly unknown[]; marker: RegExp }
> = {
  formatCompactUsd: { args: [1234.5, EN_US], marker: /\d[KMB]$/ },
  formatNumber: { args: [1234.5, EN_US], marker: /\d,\d{3}/ },
  formatPrice: { args: [1234.5, EN_US], marker: /\d,\d{3}/ },
  formatSignedPercent: { args: [1234.5, EN_US], marker: /\d%$/ },
  formatSignedUsd: { args: [1234.5, EN_US], marker: /\d,\d{3}/ },
  formatUsd: { args: [1234.5, EN_US], marker: /\d,\d{3}/ },
}

/** Sample inputs for every `decimal/convert.ts` export that gives a string. */
const CONVERT_STRING_SAMPLES: Record<string, readonly unknown[]> = {
  baseUnitsToDecimal: ['1234500000', 6],
  fromBaseUnits: ['1234500000', 6],
  numberToDecimalString: [123456789.123],
  truncateDecimal: ['1000.999', 2],
}

describe('format gives human strings, convert gives DecimalStrings', () => {
  it('covers every format export', () => {
    const formatExports = entryExports
      .filter(({ from }) => from === './decimal/format.js')
      .map(({ exported }) => exported)
      .filter((name) => name.startsWith('format'))
      .sort()
    expect(formatExports).toEqual(Object.keys(FORMAT_SAMPLES).sort())
  })

  it('renders a marked, non-DecimalString result for an input of 1000 or more', () => {
    for (const [name, { args, marker }] of Object.entries(FORMAT_SAMPLES)) {
      const result = callExport(name, args)
      expect(typeof result, name).toBe('string')
      expect(String(result), name).not.toMatch(DECIMAL_PATTERN)
      expect(String(result), name).toMatch(marker)
    }
  })

  it('covers every string-returning convert export', () => {
    const stringExports = entryExports
      .filter(({ from }) => from === './decimal/convert.js')
      .filter(({ exported }) => {
        const returns = returnTypeOf(signatures[exported] ?? [])
        return returns === 'DecimalString' || returns === 'string'
      })
      .map(({ exported }) => exported)
      .sort()
    expect(stringExports).toEqual(Object.keys(CONVERT_STRING_SAMPLES).sort())
  })

  it('renders a DecimalString for every convert export', () => {
    for (const [name, args] of Object.entries(CONVERT_STRING_SAMPLES)) {
      const result = callExport(name, args)
      expect(typeof result, name).toBe('string')
      expect(String(result), name).toMatch(DECIMAL_PATTERN)
    }
  })
})

const WIRE_MARKET = venueMarket({ szDecimals: 4 })
const WIRE_CLIENT = venueClient()

/**
 * The order-entry surface the widget calls. Every one of them takes and gives
 * a `DecimalString`, so no caller needs a `number` hop or a `Big`.
 */
const DECIMAL_STRING_SAMPLES: Record<string, readonly unknown[]> = {
  calculateOrderAmounts: [
    {
      sdk: WIRE_CLIENT,
      market: WIRE_MARKET,
      held: 'margin',
      amount: '100',
      leverage: 5,
      price: '1000',
    },
  ],
  calculateRefuelAmount: [{ gasUsd: '4', priceUsd: '3', decimals: 6 }],
  calculateTransferable: ['12', '10'],
  calculateWithdrawMax: [
    { available: '10', withdrawalFee: '0.5', isFeeDeducted: false },
  ],
  numberToDecimalString: [123456789.123],
  snapOrderPrice: [WIRE_CLIENT, WIRE_MARKET, '1234.5678'],
  snapOrderSize: [WIRE_CLIENT, WIRE_MARKET, '0.123456'],
  truncateDecimal: ['1000.999', 2],
}

describe('the order-entry surface gives DecimalStrings', () => {
  it('exports every named helper', () => {
    for (const name of Object.keys(DECIMAL_STRING_SAMPLES)) {
      expect(
        entryExports.map((e) => e.exported),
        name
      ).toContain(name)
    }
  })

  it('gives a DecimalString for each sample call', () => {
    for (const [name, args] of Object.entries(DECIMAL_STRING_SAMPLES)) {
      const result = callExport(name, args)
      const values =
        typeof result === 'string' ? [result] : Object.values(Object(result))
      expect(values.length, name).toBeGreaterThan(0)
      for (const value of values) {
        expect(sdk.isDecimalString(value), `${name} -> ${String(value)}`).toBe(
          true
        )
      }
    }
  })

  it.each([
    'marginFromNotional',
    'marginFromSize',
    'maxOf',
    'minOf',
    'sizeFromMargin',
    'sizeFromNotional',
  ])('no longer exports the Big-typed helper %s', (name) => {
    expect(entryExports.map((e) => e.exported)).not.toContain(name)
    expect(Object.keys(sdk)).not.toContain(name)
  })
})

describe('runtime helpers that perps-types does not own', () => {
  it('exports them from @lifi/perps-sdk', () => {
    expect(typeof sdk.isDecimalString).toBe('function')
    expect(typeof sdk.positionSupportsMarginAdjustment).toBe('function')
    expect(typeof sdk.positionSupportsMarginRemoval).toBe('function')
  })
})
