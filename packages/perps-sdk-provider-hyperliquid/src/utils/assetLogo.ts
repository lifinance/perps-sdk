import type { Asset } from '@lifi/perps-types'

const HL_COIN_CDN = 'https://app.hyperliquid.xyz/coins'

const HYPE_LOGO_URI =
  'https://static.debank.com/image/hyper_token/logo_url/hyper/0b3e288cfe418e9ce69eef4c96374583.png'

/**
 * Per-symbol logo overrides applied on top of the derived HL CDN URL, keyed by
 * `Asset.displaySymbol`. Each entry notes why the default URL is wrong.
 */
const BASE_ASSET_LOGO_OVERRIDES: Readonly<Record<string, string>> = {
  // coins/HYPE.svg is low quality; the debank hyper_token PNG is the canonical icon.
  HYPE: HYPE_LOGO_URI,
  // coins/USDC_spot.svg doesn't exist — HL's app 200s with its SPA shell HTML
  // instead of a 404, so the collateral asset needs the non-suffixed path.
  USDC: `${HL_COIN_CDN}/USDC.svg`,
  // Neither coins/USDT0.svg nor coins/USDT0_spot.svg serves an image (both 200
  // with the SPA shell); USDT0 is HL's USDT deployment, so reuse USDT's icon.
  USDT0: `${HL_COIN_CDN}/USDT.svg`,
}

/**
 * Underlying spot symbol for each Unit-bridged token (`fullName` starts with
 * "Unit"), keyed by the token `name`. Hand-verified that `coins/<symbol>.svg`
 * serves a real image; the Unit-suffixed `NAME_spot.svg` path 200s with HTML
 * instead. Unit tokens absent here have no working HL icon and intentionally
 * resolve to '' (client letter avatar).
 */
const UNIT_UNDERLYING_SYMBOL: Readonly<Record<string, string>> = {
  UBTC: 'BTC',
  UETH: 'ETH',
  USOL: 'SOL',
  UFART: 'FARTCOIN',
  UPUMP: 'PUMP',
  UUUSPX: 'SPX',
  UVIRT: 'VIRTUAL',
  UBONK: 'BONK',
  UDOGE: 'DOGE',
  UZEC: 'ZEC',
  UMON: 'MON',
  UWLD: 'WLD',
  UENA: 'ENA',
  UXPL: 'XPL',
  UAVAX: 'AVAX',
  UMEGA: 'MEGA',
  UANSEM: 'ANSEM',
}

/** Token `name`s of the Unit-bridged HL spot assets. */
export const UNIT_TOKEN_NAMES: ReadonlySet<string> = new Set(
  Object.keys(UNIT_UNDERLYING_SYMBOL)
)

/** Logo URI for a Unit-bridged spot token; '' when the underlying is unmapped. */
const unitSpotLogoURI = (name: string): string => {
  const underlying = UNIT_UNDERLYING_SYMBOL[name]
  return underlying === undefined ? '' : `${HL_COIN_CDN}/${underlying}.svg`
}

/** Return `asset` with its `logoURI` replaced when a display-symbol override exists. */
export const applyLogoOverride = (asset: Asset): Asset => {
  const override = BASE_ASSET_LOGO_OVERRIDES[asset.displaySymbol]
  return override === undefined ? asset : { ...asset, logoURI: override }
}

/**
 * Override-aware logo URI for a Hyperliquid spot token. Base rule is
 * `coins/${name}_spot.svg`; a Unit-bridged token (`fullName` starts with
 * "Unit") resolves to its underlying's icon instead; the override table wins
 * over both.
 *
 * When `fullName` is absent — spot *balances* (`HlSpotBalance`) carry no
 * `fullName` and this issue deliberately does not fetch `spotMeta` on the
 * account path — the derivation degrades to the symbol-keyed override + base
 * `_spot` rule, so a Unit-bridged balance uses the base rule rather than its
 * underlying's icon. The registry path (which has `fullName`) keeps full Unit
 * resolution.
 */
export const spotLogoURI = (name: string, fullName?: string | null): string => {
  const base = fullName?.startsWith('Unit')
    ? unitSpotLogoURI(name)
    : `${HL_COIN_CDN}/${name}_spot.svg`
  return BASE_ASSET_LOGO_OVERRIDES[name] ?? base
}
