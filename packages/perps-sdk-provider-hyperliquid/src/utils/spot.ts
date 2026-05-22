import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import { assetIsSpot } from './assetId.js'
import { type InfoRequestOptions, infoRequest } from './infoClient.js'

export interface HlSpotToken {
  name: string
  index: number
  tokenId: string
  szDecimals: number
}

export interface HlSpotUniverseEntry {
  name: string
  tokens: [number, number]
  index: number
  isCanonical: boolean
}

export interface HlSpotMeta {
  tokens: HlSpotToken[]
  universe: HlSpotUniverseEntry[]
}

export interface SpotPairInfo {
  assetId: number
  pairIndex: number
  baseName: string
  quoteName: string
  szDecimals: number
}

export interface HlSpotAssetCtx {
  coin: string
  prevDayPx: string
  dayNtlVlm: string
  markPx: string
  midPx: string | null
}

export type HlSpotMetaAndAssetCtxs = [HlSpotMeta, HlSpotAssetCtx[]]

/** Spot pair index → asset ID used on the /markets endpoint. */
export const spotPairAssetId = (pairIndex: number): number => 10000 + pairIndex

/**
 * Hyperliquid uses "PURR/USDC" instead of the "@0" wire identifier for the
 * first spot pair in request payloads. All other spot pair queries pass the
 * symbol through unchanged.
 */
export const purrSpotOverride = (symbol: string): string =>
  symbol === '@0' ? 'PURR/USDC' : symbol

export const fetchSpotMeta = (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<HlSpotMeta> =>
  infoRequest<HlSpotMeta>(apiUrl, { type: 'spotMeta' }, options)

export const fetchSpotMetaAndAssetCtxs = (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<HlSpotMetaAndAssetCtxs> =>
  infoRequest<HlSpotMetaAndAssetCtxs>(
    apiUrl,
    { type: 'spotMetaAndAssetCtxs' },
    options
  )

/** Build a Map of spot token index → token name (e.g. `0 → "USDC"`). */
export const buildSpotTokenByIndex = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<number, string>> => {
  const meta = await fetchSpotMeta(apiUrl, options)
  return new Map(meta.tokens.map((t) => [t.index, t.name]))
}

/** Build a Map of spot token name → tokenId address. */
export const buildSpotTokenIdLookup = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, string>> => {
  const meta = await fetchSpotMeta(apiUrl, options)
  return new Map(meta.tokens.map((t) => [t.name, t.tokenId]))
}

/** Build a Map of `@N` pair-index → base token name (e.g. `@5 → "PURR"`). */
export const buildSpotTokenLookup = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, string>> => {
  const meta = await fetchSpotMeta(apiUrl, options)
  const tokenByIndex = new Map(meta.tokens.map((t) => [t.index, t.name]))
  const lookup = new Map<string, string>()
  for (const pair of meta.universe) {
    const baseName = tokenByIndex.get(pair.tokens[0])
    if (baseName !== undefined) {
      lookup.set(`@${pair.index}`, baseName)
    }
  }
  return lookup
}

/** Build a Map of `@N` pair-index → full pair name (e.g. `@150 → "USDE/USDC"`). */
export const buildSpotPairNameLookup = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, string>> => {
  const meta = await fetchSpotMeta(apiUrl, options)
  const tokenByIndex = new Map(meta.tokens.map((t) => [t.index, t.name]))
  const lookup = new Map<string, string>()
  for (const pair of meta.universe) {
    const baseName = tokenByIndex.get(pair.tokens[0])
    const quoteName = tokenByIndex.get(pair.tokens[1])
    if (baseName !== undefined && quoteName !== undefined) {
      lookup.set(`@${pair.index}`, `${baseName}/${quoteName}`)
    }
  }
  return lookup
}

const buildSpotPairLookup = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, SpotPairInfo>> => {
  const meta = await fetchSpotMeta(apiUrl, options)
  const lookup = new Map<string, SpotPairInfo>()
  for (const pair of meta.universe) {
    const base = meta.tokens[pair.tokens[0]]
    const quote = meta.tokens[pair.tokens[1]]
    if (base === undefined || quote === undefined) {
      continue
    }
    const info: SpotPairInfo = {
      assetId: spotPairAssetId(pair.index),
      pairIndex: pair.index,
      baseName: base.name,
      quoteName: quote.name,
      szDecimals: base.szDecimals,
    }
    lookup.set(`${base.name}/${quote.name}`, info)
    lookup.set(`@${pair.index}`, info)
    if (!lookup.has(base.name)) {
      lookup.set(base.name, info)
    }
  }
  return lookup
}

/** Resolve a spot pair by full pair name (`USDE/USDC`) or bare base symbol (`USDE`). */
export const resolveSpotPair = async (
  apiUrl: string,
  nameOrSymbol: string,
  options?: InfoRequestOptions
): Promise<SpotPairInfo> => {
  const lookup = await buildSpotPairLookup(apiUrl, options)
  const info = lookup.get(nameOrSymbol)
  if (info === undefined) {
    const err = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `Spot pair not found: ${nameOrSymbol}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }
  return info
}

export const getSpotPairs = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<SpotPairInfo[]> => {
  const lookup = await buildSpotPairLookup(apiUrl, options)
  return [...lookup.values()].filter(
    (v, i, arr) => arr.findIndex((x) => x.pairIndex === v.pairIndex) === i
  )
}

/**
 * Fetch `spotMetaAndAssetCtxs` and key the asset-ctx entries by their
 * Hyperliquid coin identifier (e.g. `PURR/USDC`, `@1`).
 */
export const getSpotAssetCtxs = async (
  apiUrl: string,
  options?: InfoRequestOptions
): Promise<Map<string, HlSpotAssetCtx>> => {
  const [, ctxs] = await fetchSpotMetaAndAssetCtxs(apiUrl, options)
  return new Map(ctxs.map((ctx) => [ctx.coin, ctx]))
}

export { assetIsSpot }
