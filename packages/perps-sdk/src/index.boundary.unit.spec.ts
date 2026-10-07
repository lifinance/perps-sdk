import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import * as perpsTypes from '@lifi/perps-types'
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
const ENTRY_PATH = join(TYPES_ROOT, 'index.d.ts')

interface ExportedName {
  /** Name as the public entry point spells it. */
  exported: string
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
      names.push({ exported: exported ?? local, from })
    }
  }
  return names
}

/** Comments go first, so a `Big` named in prose never counts as a token. */
const stripComments = (declaration: string): string =>
  declaration.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** A relative `from '…'` of an import or re-export, or an inline `import('…')` type. */
const RELATIVE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g

type DeclarationReader = (path: string) => string | undefined

interface DeclarationWalk {
  /** Comment-stripped text per declaration file reached. */
  reached: Map<string, string>
  /** Paths a reached file names that have no declaration file. */
  missing: string[]
}

/**
 * Every declaration file the entry point reaches through relative imports,
 * re-exports and inline `import()` types: the whole public type surface.
 */
function walkDeclarations(
  entry: string,
  read: DeclarationReader
): DeclarationWalk {
  const reached = new Map<string, string>()
  const missing: string[] = []
  const queue = [entry]
  while (queue.length > 0) {
    const path = queue.shift() as string
    if (reached.has(path) || missing.includes(path)) {
      continue
    }
    const text = read(path)
    if (text === undefined) {
      missing.push(path)
      continue
    }
    const code = stripComments(text)
    reached.set(path, code)
    for (const [, specifier] of code.matchAll(RELATIVE_SPECIFIER)) {
      queue.push(join(dirname(path), specifier.replace(/\.js$/, '.d.ts')))
    }
  }
  return { reached, missing }
}

/** The `'big.js'` specifier itself, so an aliased local name still gets caught. */
const BIG_MODULE_SPECIFIER = /(?:\bfrom\s*|\bimport\(\s*)['"]big\.js['"]/
const mentionsBig = (text: string): boolean =>
  /\bBig\b/.test(text) || BIG_MODULE_SPECIFIER.test(text)

const bigDeclarations = ({ reached }: DeclarationWalk): string[] =>
  [...reached].filter(([, code]) => mentionsBig(code)).map(([path]) => path)

let entryExports: ExportedName[] = []
let publicDeclarations: DeclarationWalk = { reached: new Map(), missing: [] }

beforeAll(() => {
  execFileSync(
    join(PACKAGE_ROOT, 'node_modules', '.bin', 'tsc'),
    ['--build', 'tsconfig.build.json'],
    { cwd: PACKAGE_ROOT, stdio: 'pipe' }
  )
  entryExports = parseEntryExports(readFileSync(ENTRY_PATH, 'utf8'))
  publicDeclarations = walkDeclarations(ENTRY_PATH, (path) =>
    existsSync(path) ? readFileSync(path, 'utf8') : undefined
  )
})

describe('Big never crosses the public API boundary', () => {
  it('reaches the declaration of every re-exported module', () => {
    expect(entryExports.length).toBeGreaterThan(0)
    expect(publicDeclarations.missing).toEqual([])
    const unreached = entryExports
      .map(({ from }) => join(TYPES_ROOT, from.replace(/\.js$/, '.d.ts')))
      .filter((path) => !publicDeclarations.reached.has(path))
    expect(unreached).toEqual([])
  })

  it('names Big in no declaration the entry point reaches', () => {
    expect(bigDeclarations(publicDeclarations)).toEqual([])
  })

  it.each(NEVER_EXPORTED)('does not export %s', (name) => {
    expect(entryExports.map((e) => e.exported)).not.toContain(name)
    expect(Object.keys(sdk)).not.toContain(name)
  })
})

/**
 * An emit in the shape `tsc` produces: the entry re-exports a function whose
 * parameter type comes from an `import type` and whose return type is an
 * inline `import()` that carries a `Big`, and star-re-exports a module. One
 * module names `Big` in prose only, and one internal module that holds a `Big`
 * is never named.
 */
const WALK_EMIT: Record<string, string> = {
  '/emit/index.d.ts': `
export { walkBook } from './order.js';
export type { Grid } from './grid.js';
export * from './math.js';
`,
  '/emit/math.d.ts': `
export declare function calculateSpread(bid: number, ask: number): number;
`,
  '/emit/order.d.ts': `
import type { Level } from './level.js';
export declare function walkBook(levels: Level[]): import("./walk.js").BookWalk;
`,
  '/emit/level.d.ts': `
export interface Level {
    price: string;
}
`,
  '/emit/walk.d.ts': `
import type Big from 'big.js';
export interface BookWalk {
    vwap: Big;
}
`,
  '/emit/grid.d.ts': `
/** Snaps a size, never a Big, onto the grid. */
export interface Grid {
    tick: string;
}
`,
  '/emit/internal.d.ts': `
import type Big from 'big.js';
export declare function parseLevel(level: string): Big;
`,
}

describe('the declaration walk', () => {
  const walk = walkDeclarations('/emit/index.d.ts', (path) => WALK_EMIT[path])

  it('follows re-exports, type imports and inline import() types only', () => {
    expect([...walk.reached.keys()].sort()).toEqual([
      '/emit/grid.d.ts',
      '/emit/index.d.ts',
      '/emit/level.d.ts',
      '/emit/math.d.ts',
      '/emit/order.d.ts',
      '/emit/walk.d.ts',
    ])
    expect(walk.missing).toEqual([])
  })

  it('flags the Big behind an inline import() and ignores prose', () => {
    expect(bigDeclarations(walk)).toEqual(['/emit/walk.d.ts'])
  })

  it('flags a big.js import whose local name hides the Big token', () => {
    const ALIASED_EMIT: Record<string, string> = {
      '/alias/index.d.ts': `
export type { Quote } from './quote.js';
`,
      '/alias/quote.d.ts': `
import type BigNumber from 'big.js';
export interface Quote {
    vwap: BigNumber;
}
`,
    }
    const aliased = walkDeclarations(
      '/alias/index.d.ts',
      (path) => ALIASED_EMIT[path]
    )
    expect(bigDeclarations(aliased)).toEqual(['/alias/quote.d.ts'])
  })

  it('reports a specifier with no declaration file', () => {
    const broken = walkDeclarations('/emit/index.d.ts', (path) =>
      path === '/emit/grid.d.ts' ? undefined : WALK_EMIT[path]
    )
    expect(broken.missing).toEqual(['/emit/grid.d.ts'])
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
  estimateLiquidationPrice: [LIQUIDATION_INPUT],
  estimateLiquidationPriceAtMarketRate: [
    { ...MARKET, maintenanceMarginRate: 0.01 },
    { entryPrice: 100, leverage: 10, isLong: true },
  ],
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

  it('gives back a finite number for each sample call', () => {
    for (const [name, args] of Object.entries(MATH_SAMPLES)) {
      const result = callExport(name, args)
      const fields = NUMERIC_FIELDS[name]
      if (fields) {
        for (const field of fields) {
          expect(
            Number.isFinite(Object(result)[field]),
            `${name}.${field}`
          ).toBe(true)
        }
        continue
      }
      expect(Number.isFinite(result), name).toBe(true)
    }
  })
})

const EN_US = 'en-US'
const EN_US_GROUP = new Intl.NumberFormat(EN_US)
  .formatToParts(1_000_000)
  .find(({ type }) => type === 'group')?.value
const GROUPED = new RegExp(`\\d[${EN_US_GROUP}]\\d{3}`)

/**
 * One sample call per human formatter at an input of 1000 or more, with the
 * marker that proves the output is for a screen. The grouping separator comes
 * from the locale, not a literal. `formatSignedPercent` never groups and
 * `formatCompactUsd` gives a magnitude suffix in place of grouping.
 */
const FORMAT_SAMPLES: Record<
  string,
  { args: readonly unknown[]; marker: RegExp }
> = {
  formatCompactUsd: {
    args: [1234567.5, { locale: EN_US }],
    marker: /\d[KMB]$/,
  },
  formatNumber: { args: [1234567.5, { locale: EN_US }], marker: GROUPED },
  formatPrice: { args: [1234567.5, { locale: EN_US }], marker: GROUPED },
  formatSignedPercent: { args: [1234567.5, { locale: EN_US }], marker: /\d%$/ },
  formatSignedUsd: { args: [1234567.5, { locale: EN_US }], marker: GROUPED },
  formatUsd: { args: [1234567.5, { locale: EN_US }], marker: GROUPED },
}

describe('format gives human strings', () => {
  it('reads a grouping separator for the sample locale', () => {
    expect(EN_US_GROUP).toBeTruthy()
  })

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
})

const functionExportsFrom = (from: (specifier: string) => boolean): string[] =>
  entryExports
    .filter((entry) => from(entry.from))
    .map(({ exported }) => exported)
    .filter((name) => typeof sdkExports[name] === 'function')
    .sort()

describe('compare gives booleans', () => {
  it('exports isDecimalStringGreaterThan from decimal/compare.ts', () => {
    expect(
      functionExportsFrom((from) => from === './decimal/compare.js')
    ).toEqual(['isDecimalStringGreaterThan'])
  })

  it('gives a boolean, never a Big', () => {
    expect(sdk.isDecimalStringGreaterThan('1.0000000000000001', '1')).toBe(true)
  })
})

/** One sample call per `decimal/convert.ts` function. */
const CONVERT_SAMPLES: Record<string, readonly unknown[]> = {
  baseUnitsToDecimal: ['1234500000', 6],
  decimalToBaseUnits: ['0.29', 2, 'truncate'],
  numberToDecimalString: [1e-8],
  truncateDecimal: ['1000.999', 2],
}

const WIRE_MARKET = venueMarket({ szDecimals: 4 })
const WIRE_CLIENT = venueClient()

/**
 * One sample call per `wire/` function: the order-entry and account surface
 * the widget calls. Every one gives `DecimalString`s only, so no caller needs
 * a `number` hop or a `Big`.
 */
const WIRE_SAMPLES: Record<string, readonly unknown[]> = {
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
  calculateRefuelAmount: [
    {
      recommendedAmount: '2000000000000000',
      recommendedUsd: '5',
      nativeBalance: '0',
      priceUsd: '3',
      decimals: 6,
    },
  ],
  calculateTransferable: ['12', '10'],
  calculateWithdrawMax: [
    { available: '10', withdrawalFee: '0.5', isFeeDeducted: false },
  ],
  snapOrderPrice: [WIRE_CLIENT, WIRE_MARKET, '1234.5678'],
  snapOrderSize: [WIRE_CLIENT, WIRE_MARKET, '0.123456'],
}

/** The result itself when it is a scalar, else its field values. */
const resultValues = (result: unknown): unknown[] =>
  typeof result === 'object' && result !== null
    ? Object.values(result)
    : [result]

describe('convert and wire give DecimalStrings', () => {
  it('samples every decimal/convert.ts function', () => {
    expect(
      functionExportsFrom((from) => from === './decimal/convert.js')
    ).toEqual(Object.keys(CONVERT_SAMPLES).sort())
  })

  it('samples every wire/ function', () => {
    expect(functionExportsFrom((from) => from.startsWith('./wire/'))).toEqual(
      Object.keys(WIRE_SAMPLES).sort()
    )
  })

  it('gives a DecimalString for every string a convert function returns', () => {
    const strings = Object.entries(CONVERT_SAMPLES).flatMap(([name, args]) =>
      resultValues(callExport(name, args))
        .filter((value) => typeof value === 'string')
        .map((value) => [name, value] as const)
    )
    expect(strings.length).toBeGreaterThan(0)
    for (const [name, value] of strings) {
      expect(sdk.isDecimalString(value), `${name} -> ${String(value)}`).toBe(
        true
      )
    }
  })

  it('gives only DecimalStrings from every wire function', () => {
    for (const [name, args] of Object.entries(WIRE_SAMPLES)) {
      const values = resultValues(callExport(name, args))
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

/** `<a>To<B>` converts between representations only, so both operands come from this closed set. */
const REPRESENTATIONS = ['baseUnits', 'decimal', 'decimalString', 'number']
const capitalise = (token: string): string =>
  token.charAt(0).toUpperCase() + token.slice(1)
const VOCABULARY = new RegExp(
  '^(?:(?:parse|format|snap|calculate|estimate|resolve|validate|is|would|has|build|aggregate)(?:[A-Z]|$)' +
    `|(?:${REPRESENTATIONS.join('|')})To(?:${REPRESENTATIONS.map(capitalise).join('|')})$)`
)
const BANNED_VERB = /^(derive|predict|convert)/

describe('the vocabulary pattern', () => {
  it.each([
    'baseUnitsToDecimal',
    'decimalToBaseUnits',
    'numberToDecimalString',
  ])('admits the representation conversion %s', (name) => {
    expect(VOCABULARY.test(name)).toBe(true)
  })

  it.each([
    'walkOrderbookToDepth',
    'stringToFloat',
    'convertAmount',
    'baseUnitsToDecimalOrZero',
    'isolateMargin',
    'hashX',
    'builderX',
    'snapshotX',
  ])('rejects %s', (name) => {
    expect(VOCABULARY.test(name)).toBe(false)
  })
})

/** Tier functions outside the vocabulary, each with the reason it keeps its name. */
const NAMING_EXCEPTIONS: Record<string, string> = {
  applySlippage: 'display-tier formula; consumers call it by this name',
  classifyFill: 'fill taxonomy, deprecated in favour of Fill.classification',
  classifyFillFromPosition: 'fill taxonomy the providers call',
  findMatchingPosition: 'structure lookup with no arithmetic',
  positionSupportsMarginAdjustment:
    'is-class predicate; a rename is a second breaking change, parked for a human decision',
  positionSupportsMarginRemoval:
    'is-class predicate; a rename is a second breaking change, parked for a human decision',
  truncateDecimal: 'the tracker vocabulary lists it under snap<X>',
  walkOrderbook: 'book traversal that buildQuote composes',
}

const TIER_MODULE = /^\.\/(decimal|math|wire)\//

describe('decimal/, math/ and wire/ names follow the vocabulary', () => {
  const tierFunctions = (): string[] =>
    functionExportsFrom((from) => TIER_MODULE.test(from))

  it('names every tier function with a vocabulary verb', () => {
    const offenders = tierFunctions().filter(
      (name) => !(VOCABULARY.test(name) || name in NAMING_EXCEPTIONS)
    )
    expect(offenders).toEqual([])
  })

  it('names no tier function with a banned verb', () => {
    expect(tierFunctions().filter((name) => BANNED_VERB.test(name))).toEqual([])
  })

  it('keeps no stale naming exception', () => {
    const names = tierFunctions()
    const stale = Object.keys(NAMING_EXCEPTIONS).filter(
      (name) => !names.includes(name) || VOCABULARY.test(name)
    )
    expect(stale).toEqual([])
  })
})

describe('calculateOrderAmounts at the public entry point', () => {
  const input = {
    sdk: WIRE_CLIENT,
    market: WIRE_MARKET,
    amount: '123.456789',
    leverage: 3,
    price: '0.07',
  }

  it.each([
    'margin',
    'size',
    'notional',
  ] as const)('gives a DecimalString in every field for a held %s', (held) => {
    const amounts = sdk.calculateOrderAmounts({ ...input, held })
    if (amounts === null) {
      expect.unreachable('the sample input is a valid order')
    }

    for (const [field, value] of Object.entries(amounts)) {
      expect(sdk.isDecimalString(value), `${held}.${field} -> ${value}`).toBe(
        true
      )
    }
  })

  it('takes no quote precision', () => {
    const withQuoteDecimals: sdk.OrderAmountsInput = {
      ...input,
      held: 'margin',
      // @ts-expect-error `calculateOrderAmounts` applies no quote grid.
      quoteDecimals: 2,
    }

    expect(sdk.calculateOrderAmounts(withQuoteDecimals)?.margin).toBe(
      '123.456789'
    )
  })
})

describe('runtime helpers that perps-types does not own', () => {
  it('exports them from @lifi/perps-sdk', () => {
    expect(typeof sdk.isDecimalString).toBe('function')
    expect(typeof sdk.validateDecimalString).toBe('function')
    expect(typeof sdk.positionSupportsMarginAdjustment).toBe('function')
    expect(typeof sdk.positionSupportsMarginRemoval).toBe('function')
  })

  it('leaves @lifi/perps-types with no function export', () => {
    const functions = Object.entries(perpsTypes)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
    expect(functions).toEqual([])
  })
})
