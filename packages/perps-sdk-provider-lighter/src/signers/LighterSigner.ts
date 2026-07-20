import { ActionType } from '@lifi/perps-types'
import { DEFAULT_LIGHTER_REST_URL } from '../constants.js'
import {
  LT_ASSET_ID_USDC,
  LT_ROUTE_PERP,
  LT_ROUTE_SPOT,
} from '../types/action.js'
import { assetMarginModeInt } from '../utils/assetCollateral.js'
import {
  type LighterWasmExports,
  type LoadLighterWasmOptions,
  loadLighterWasm,
  type SignResult,
} from './wasmLoader.js'

// Every Sign* call needs the Go signer initialized with the API private key
// for a given (apiKeyIndex, accountIndex) pair via CreateClient. The context
// is process-global inside the Go runtime; we track which keys are already
// initialized so CreateClient runs once per keypair.

/** @public */
export interface LighterSignerContext {
  /** Lighter-native private key (from GenerateAPIKey, NOT an Ethereum key). */
  apiKeyPrivateKey: string
  /** API key slot registered on-chain (0-255). */
  apiKeyIndex: number
  /** Lighter account index — looked up from the user's L1 Ethereum address. */
  accountIndex: number
}

/** @public */
export interface LighterSignerConfig extends LoadLighterWasmOptions {
  /** Lighter REST API base URL. */
  apiUrl?: string
  /** Lighter chain ID (304 = mainnet). */
  chainId?: number
}

/** @public */
export interface LighterSignedBlob {
  txType: number
  txInfo: string
  txHash: string
}

/** @public */
export interface ChangePubKeyResult extends LighterSignedBlob {
  /** EIP-191 message the L1 Ethereum wallet must sign to authorize the key rotation. */
  messageToSign: string
}

/** @public */
export interface ApproveIntegratorResult extends LighterSignedBlob {
  /** EIP-191 `L2ApproveIntegrator` L1 body the user's wallet must countersign to authorize the integrator approval. */
  messageToSign: string
}

/** @public */
export interface ApiKeyPair {
  publicKey: string
  privateKey: string
}

const DEFAULT_CHAIN_ID = 304

// Signing "unset" sentinels mirror lighter-go `types/txtypes/constants.go`.
// Passing them yields an empty `L2TxAttributes` — no integrator fees, default
// self-trade rules.
const NIL_INTEGRATOR_INDEX = 0
const NIL_INTEGRATOR_TAKER_FEE = 0
const NIL_INTEGRATOR_MAKER_FEE = 0
const SELF_TRADE_BEHAVIOR_EXPIRE_MAKER = 0
const SELF_TRADE_EQUALITY_ACCOUNT_INDEX = 0
const SKIP_NONCE_DISABLED = 0
// CancelAll across every market (lighter-go `NilMarketIndex`); a real index
// scopes the cancel to a single market.
const NIL_MARKET_INDEX = 255
// Withdrawals/transfers are USDC on the perps route (lighter-go `USDCAssetIndex`
// / `AssetRouteType_Perps`). The signer rejects an asset index < 1.
const USDC_ASSET_INDEX = 3
const ASSET_ROUTE_TYPE_PERPS = 0

// SEND_ASSET is a same-account route→route USDC move (spot↔perp): no counterparty
// fee, and no memo. `SignTransfer` requires a 32-byte memo, so we pass 32 zero
// bytes in the `0x`-prefixed 64-hex form the WASM signer decodes.
const SEND_ASSET_NO_FEE = 0
const SEND_ASSET_ZERO_MEMO = `0x${'0'.repeat(64)}`
// Wire encoding the widget/backend emit for `SendAssetParams.sourceDex` /
// `destinationDex`, mapped onto Lighter's asset route types. `'perps'`/`'spot'`
// are Lighter's own route vocabulary (transfer-history `from_route`/`to_route`).
const LIGHTER_ROUTE_BY_DEX: Record<string, number> = {
  perps: LT_ROUTE_PERP,
  spot: LT_ROUTE_SPOT,
}

/** @public */
export class LighterSigner {
  private readonly apiUrl: string
  private readonly chainId: number
  private readonly loaderOptions: LoadLighterWasmOptions
  private wasm: LighterWasmExports | undefined
  private readonly registeredClients = new Set<string>()

  constructor(config: LighterSignerConfig = {}) {
    this.apiUrl = config.apiUrl ?? DEFAULT_LIGHTER_REST_URL
    this.chainId = config.chainId ?? DEFAULT_CHAIN_ID
    this.loaderOptions = {
      wasmBinaryUrl: config.wasmBinaryUrl,
      wasmExecJsUrl: config.wasmExecJsUrl,
      wasmExecJsSource: config.wasmExecJsSource,
    }
  }

  async initialize(): Promise<void> {
    if (!this.wasm) {
      this.wasm = await loadLighterWasm(this.loaderOptions)
    }
  }

  /**
   * Generate a fresh random Lighter API keypair. The signer binary samples a
   * random scalar; seeded/deterministic generation is not available.
   */
  async generateAPIKey(): Promise<ApiKeyPair> {
    const wasm = await this.ensureLoaded()
    const result = wasm.GenerateAPIKey()
    if (result.error) {
      throw new Error(`Lighter GenerateAPIKey failed: ${result.error}`)
    }
    if (!result.publicKey || !result.privateKey) {
      throw new Error('Lighter GenerateAPIKey returned an incomplete result')
    }
    return { publicKey: result.publicKey, privateKey: result.privateKey }
  }

  /**
   * Sign an action blob with the provided (apiKeyPrivateKey, apiKeyIndex,
   * accountIndex) context. `wasmSignParams` comes straight from the backend's
   * `WasmBlobActionStep`. Returns the signed `{ txType, txInfo, txHash }`
   * triple the backend forwards to Lighter's `sendTx` endpoint.
   *
   * For REGISTER_API_KEY use `signChangePubKey` instead — it returns an
   * additional `messageToSign` the L1 wallet must countersign.
   */
  async sign(
    action: ActionType,
    wasmSignParams: Record<string, unknown>,
    context: LighterSignerContext
  ): Promise<LighterSignedBlob> {
    if (action === ActionType.REGISTER_API_KEY) {
      throw new Error(
        'Use signChangePubKey() for REGISTER_API_KEY — the L1 eth_sign hop ' +
          'must be coordinated by the caller.'
      )
    }
    const wasm = await this.ensureLoaded()
    await this.ensureClient(context)
    const result = this.dispatch(wasm, action, wasmSignParams, context)
    return unwrap(result, action)
  }

  /**
   * Step 1 of the REGISTER_API_KEY flow. Generates the WASM blob for a
   * ChangePubKey tx with `L1Sig` left empty, plus the canonical EIP-191
   * message the L1 Ethereum wallet must sign next.
   *
   * Requires the freshly-generated `privateKey` (returned by
   * {@link generateAPIKey}) — the Go WASM signer registers a per-slot client
   * keyed on `(apiKeyIndex, accountIndex)` before it'll sign anything for
   * that slot, including the ChangePubKey that's about to register the key
   * on-chain. This is purely client-side bookkeeping; it does not touch the
   * Lighter API.
   */
  async signChangePubKey(
    pubKeyHex: string,
    privateKey: string,
    nonce: number,
    apiKeyIndex: number,
    accountIndex: number,
    skipNonce: 0 | 1 = 0
  ): Promise<ChangePubKeyResult> {
    const wasm = await this.ensureLoaded()
    await this.ensureClient({
      apiKeyPrivateKey: privateKey,
      apiKeyIndex,
      accountIndex,
    })
    // 5-arg call (matches lighter-python's signer wrapper). `skipNonce`:
    //   0 — embed the supplied nonce and have Lighter enforce it on submit.
    //   1 — embed the nonce but let Lighter pick / not enforce; used for
    //       ChangePubKey to sidestep `/nextNonce` vs `/sendTx` disagreement
    //       on slot re-claims.
    const result = wasm.SignChangePubKey(
      pubKeyHex,
      skipNonce,
      nonce,
      apiKeyIndex,
      accountIndex
    )
    if (result.error) {
      throw new Error(`Lighter SignChangePubKey failed: ${result.error}`)
    }
    if (
      result.txType === undefined ||
      result.txInfo === undefined ||
      result.txHash === undefined ||
      !result.messageToSign
    ) {
      throw new Error('Lighter SignChangePubKey returned incomplete result')
    }
    return {
      txType: result.txType,
      txInfo: result.txInfo,
      txHash: result.txHash,
      messageToSign: result.messageToSign,
    }
  }

  /**
   * Sign an APPROVE_INTEGRATOR action with the stored API key and return the
   * signed blob alongside the EIP-191 `L2ApproveIntegrator` L1 message the
   * user's Ethereum wallet must countersign. Unlike {@link sign}, this exposes
   * `messageToSign`: Lighter requires `L1Sig` (injected via
   * {@link embedL1Signature} before submission) when the integrator account
   * belongs to a different L1 address with non-zero fee caps.
   */
  async signApproveIntegrator(
    wasmSignParams: Record<string, unknown>,
    context: LighterSignerContext
  ): Promise<ApproveIntegratorResult> {
    const wasm = await this.ensureLoaded()
    await this.ensureClient(context)
    const result = this.dispatch(
      wasm,
      ActionType.APPROVE_INTEGRATOR,
      wasmSignParams,
      context
    )
    if (result.error) {
      throw new Error(`Lighter SignApproveIntegrator failed: ${result.error}`)
    }
    if (
      result.txType === undefined ||
      result.txInfo === undefined ||
      result.txHash === undefined ||
      !result.messageToSign
    ) {
      throw new Error(
        'Lighter SignApproveIntegrator returned an incomplete result'
      )
    }
    return {
      txType: result.txType,
      txInfo: result.txInfo,
      txHash: result.txHash,
      messageToSign: result.messageToSign,
    }
  }

  /**
   * Inject the L1 signature produced by the user's Ethereum wallet into a
   * signed txInfo JSON. `L1Sig` is the only field that depends on the L1
   * signature; txHash does NOT include it (so we do not recompute it). Shared
   * by the REGISTER_API_KEY (ChangePubKey) and APPROVE_INTEGRATOR flows.
   */
  embedL1Signature(txInfo: string, l1Signature: string): string {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(txInfo) as Record<string, unknown>
    } catch (err) {
      throw new Error(
        `Failed to parse signed txInfo as JSON: ${(err as Error).message}`
      )
    }
    parsed.L1Sig = l1Signature
    return JSON.stringify(parsed)
  }

  /**
   * Create an auth token for authenticated WebSocket subscriptions.
   * `deadline` is a Unix timestamp in seconds — tokens have an 8h hard cap.
   */
  async createAuthToken(
    deadline: number,
    context: LighterSignerContext
  ): Promise<string> {
    const wasm = await this.ensureLoaded()
    await this.ensureClient(context)
    const result = wasm.CreateAuthToken(
      deadline,
      context.apiKeyIndex,
      context.accountIndex
    )
    if (result.error) {
      throw new Error(`Lighter CreateAuthToken failed: ${result.error}`)
    }
    if (!result.authToken) {
      throw new Error('Lighter CreateAuthToken returned no token')
    }
    return result.authToken
  }

  private async ensureLoaded(): Promise<LighterWasmExports> {
    if (!this.wasm) {
      await this.initialize()
    }
    return this.wasm as LighterWasmExports
  }

  private async ensureClient(context: LighterSignerContext): Promise<void> {
    const key = `${context.apiKeyIndex}:${context.accountIndex}:${context.apiKeyPrivateKey}`
    if (this.registeredClients.has(key)) {
      return
    }
    const wasm = await this.ensureLoaded()
    const result = wasm.CreateClient(
      this.apiUrl,
      context.apiKeyPrivateKey,
      this.chainId,
      context.apiKeyIndex,
      context.accountIndex
    )
    if (result.error) {
      throw new Error(`Lighter CreateClient failed: ${result.error}`)
    }
    this.registeredClients.add(key)
  }

  /**
   * Map an ActionType + backend-provided params object to the positional-arg
   * WASM call. The Go signer exports take primitives in order, not an object
   * — so we pick fields in the exact order the Go side expects. Integrator
   * fee fields pass through when present, falling back to the nil sentinels
   * when absent; unrecognised fields are ignored.
   */
  private dispatch(
    wasm: LighterWasmExports,
    action: ActionType,
    p: Record<string, unknown>,
    ctx: LighterSignerContext
  ): SignResult & { messageToSign?: string } {
    const nonce = numberField(p, 'nonce')
    switch (action) {
      case ActionType.PLACE_ORDER:
      case ActionType.PLACE_TRIGGER_ORDER:
        return wasm.SignCreateOrder(
          numberField(p, 'market_index'),
          numberField(p, 'client_order_index'),
          numberField(p, 'base_amount'),
          numberField(p, 'price'),
          numberField(p, 'is_ask'),
          numberField(p, 'order_type'),
          numberField(p, 'time_in_force'),
          // WASM's error message lists "reduceOnly" as bool-like, but Go
          // actually calls Value.Int() on every arg — passing an actual bool
          // panics. Coerce to 0/1.
          numberField(p, 'reduce_only'),
          numberField(p, 'trigger_price'),
          numberField(p, 'order_expiry'),
          optionalNumberField(
            p,
            'integrator_account_index',
            NIL_INTEGRATOR_INDEX
          ),
          optionalNumberField(
            p,
            'integrator_taker_fee',
            NIL_INTEGRATOR_TAKER_FEE
          ),
          optionalNumberField(
            p,
            'integrator_maker_fee',
            NIL_INTEGRATOR_MAKER_FEE
          ),
          SELF_TRADE_BEHAVIOR_EXPIRE_MAKER,
          SELF_TRADE_EQUALITY_ACCOUNT_INDEX,
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.CANCEL_ORDER:
        return wasm.SignCancelOrder(
          numberField(p, 'market_index'),
          numberField(p, 'order_index'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.CANCEL_ALL_ORDERS:
        return wasm.SignCancelAllOrders(
          numberField(p, 'time_in_force'),
          numberField(p, 'timestamp_ms'),
          NIL_MARKET_INDEX,
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.MODIFY_ORDER:
        return wasm.SignModifyOrder(
          numberField(p, 'market_index'),
          numberField(p, 'order_index'),
          numberField(p, 'base_amount'),
          numberField(p, 'price'),
          numberField(p, 'trigger_price'),
          optionalNumberField(
            p,
            'integrator_account_index',
            NIL_INTEGRATOR_INDEX
          ),
          optionalNumberField(
            p,
            'integrator_taker_fee',
            NIL_INTEGRATOR_TAKER_FEE
          ),
          optionalNumberField(
            p,
            'integrator_maker_fee',
            NIL_INTEGRATOR_MAKER_FEE
          ),
          SELF_TRADE_BEHAVIOR_EXPIRE_MAKER,
          SELF_TRADE_EQUALITY_ACCOUNT_INDEX,
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.UPDATE_LEVERAGE:
        return wasm.SignUpdateLeverage(
          numberField(p, 'market_index'),
          numberField(p, 'fraction'),
          numberField(p, 'margin_mode'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.UPDATE_POSITION_MARGIN:
        return wasm.SignUpdateMargin(
          numberField(p, 'market_index'),
          numberField(p, 'usdc_amount'),
          numberField(p, 'direction'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.WITHDRAWAL:
        return wasm.SignWithdraw(
          USDC_ASSET_INDEX,
          ASSET_ROUTE_TYPE_PERPS,
          numberField(p, 'amount'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.TRANSFER:
        // SignTransfer's positional args follow the Go binding order:
        // `toAccountIndex, assetIndex, fromRouteType, toRouteType, amount,
        // usdcFee, memo, skipNonce, nonce, apiKeyIndex, accountIndex`. `memo`
        // is copied directly into a `[32]byte`, so the backend MUST send a JS
        // string whose UTF-8 byte length is exactly 32 (in practice: 32 ASCII
        // characters) — anything else fails with "memo expected to be 32 bytes
        // long".
        return wasm.SignTransfer(
          numberField(p, 'to_account'),
          USDC_ASSET_INDEX,
          ASSET_ROUTE_TYPE_PERPS,
          ASSET_ROUTE_TYPE_PERPS,
          numberField(p, 'usdc_amount'),
          numberField(p, 'fee'),
          stringField(p, 'memo'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.SEND_ASSET: {
        // Same-account USDC self-transfer between the perp and spot routes.
        // `toAccountIndex` is the signer's own account; the routes come from
        // the backend-passed `sourceDex`/`destinationDex` wire strings.
        const fromRouteType = routeFromDex(stringField(p, 'sourceDex'))
        const toRouteType = routeFromDex(stringField(p, 'destinationDex'))
        if (fromRouteType === toRouteType) {
          throw new Error(
            'Lighter SEND_ASSET requires distinct source/destination routes ' +
              '(perp↔spot); a same-route transfer is a no-op'
          )
        }
        return wasm.SignTransfer(
          ctx.accountIndex,
          LT_ASSET_ID_USDC,
          fromRouteType,
          toRouteType,
          numberField(p, 'amount'),
          SEND_ASSET_NO_FEE,
          SEND_ASSET_ZERO_MEMO,
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      }
      case ActionType.APPROVE_INTEGRATOR:
        return wasm.SignApproveIntegrator(
          numberField(p, 'integrator_account_index'),
          numberField(p, 'max_perps_taker_fee'),
          numberField(p, 'max_perps_maker_fee'),
          numberField(p, 'max_spot_taker_fee'),
          numberField(p, 'max_spot_maker_fee'),
          numberField(p, 'approval_expiry'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.ACCOUNT_MODE:
        return wasm.SignUpdateAccountConfig(
          numberField(p, 'account_trading_mode'),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      case ActionType.UPDATE_ASSET_COLLATERAL:
        return wasm.SignUpdateAccountAssetConfig(
          numberField(p, 'asset_index'),
          assetMarginModeInt(booleanField(p, 'enabled')),
          SKIP_NONCE_DISABLED,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex
        )
      default:
        throw new Error(
          `Lighter WASM signer does not support action: ${action}`
        )
    }
  }
}

function unwrap(result: SignResult, action: ActionType): LighterSignedBlob {
  if (result.error) {
    throw new Error(`Lighter sign(${action}) failed: ${result.error}`)
  }
  if (
    result.txType === undefined ||
    result.txInfo === undefined ||
    result.txHash === undefined
  ) {
    throw new Error(
      `Lighter sign(${action}) returned an incomplete signed blob`
    )
  }
  return {
    txType: result.txType,
    txInfo: result.txInfo,
    txHash: result.txHash,
  }
}

function numberField(p: Record<string, unknown>, key: string): number {
  const v = p[key]
  if (typeof v === 'number') {
    return v
  }
  if (typeof v === 'boolean') {
    return v ? 1 : 0
  }
  if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) {
    return Number(v)
  }
  throw new Error(
    `Lighter sign params missing numeric field '${key}' (got ${typeof v})`
  )
}

function optionalNumberField(
  p: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const v = p[key]
  if (v === undefined || v === null) {
    return fallback
  }
  return numberField(p, key)
}

function booleanField(p: Record<string, unknown>, key: string): boolean {
  const v = p[key]
  if (typeof v === 'boolean') {
    return v
  }
  throw new Error(
    `Lighter sign params missing boolean field '${key}' (got ${typeof v})`
  )
}

function routeFromDex(dex: string): number {
  const route = LIGHTER_ROUTE_BY_DEX[dex]
  if (route === undefined) {
    throw new Error(
      `Lighter SEND_ASSET: unsupported dex '${dex}' (expected 'perps' or 'spot')`
    )
  }
  return route
}

function stringField(p: Record<string, unknown>, key: string): string {
  const v = p[key]
  if (typeof v === 'string' && v !== '') {
    return v
  }
  throw new Error(
    `Lighter sign params missing string field '${key}' (got ${typeof v})`
  )
}
