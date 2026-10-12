import {
  decimalStringToScaledInteger,
  isDecimalStringGreaterThan,
  PerpsError,
} from '@lifi/perps-sdk'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { LT_ROUTE_PERP, LT_ROUTE_SPOT } from '../types/action.js'
import { assetMarginModeInt } from '../utils/assetCollateral.js'
import {
  callLighterWasm,
  type LighterWasmExports,
  type LighterWasmL1Body,
  type LighterWasmMemo,
  type LighterWasmPending,
  type LighterWasmTx,
  loadLighterWasm,
} from './wasmLoader.js'

/**
 * Credentials needed to initialize the Lighter WASM client for one account
 * and API-key slot. The private key is Lighter-native signing material; the
 * account and slot indexes select the registered L2 key.
 *
 * @internal
 */
export interface LighterSignerContext {
  /** Lighter-native private key (`0x` hex), NOT an Ethereum key. */
  apiKeyPrivateKey: string
  /** API key slot registered on-chain (0-255). */
  apiKeyIndex: number
  /** Lighter account index — looked up from the user's L1 Ethereum address. */
  accountIndex: number
}

/**
 * Deployment facts {@link LighterSigner} signs against: the venue's zkLighter
 * L2 signing chain id, and the L2 asset index its withdrawals and transfers
 * settle in.
 *
 * @internal
 */
export interface LighterSignerConfig {
  signerChainId: number
  collateralAssetIndex: number
}

/**
 * Signed Lighter transaction blob. `txType`, `txInfo`, and `txHash` are passed
 * to the venue's transaction submission endpoint; `txInfo` is an encoded
 * transaction payload.
 *
 * @internal
 */
export interface LighterSignedBlob {
  txType: number
  txInfo: string
  txHash: string
}

/**
 * New Lighter API keypair (`0x` hex), plus the ChangePubKey L1 message the
 * user's wallet must sign to register it.
 *
 * @internal
 */
export interface CreatedApiKey {
  publicKey: string
  privateKey: string
  messageToSign: string
}

/**
 * Actions whose signed tx carries an `L1Sig` from the user's Ethereum wallet.
 *
 * @internal
 */
export type LighterL1CountersignedAction =
  | ActionType.APPROVE_INTEGRATOR
  | ActionType.TRANSFER

// lighter-go `types/txtypes/constants.go`.
const TX_TYPE_BY_ACTION: Partial<Record<ActionType, number>> = {
  [ActionType.REGISTER_API_KEY]: 8,
  [ActionType.TRANSFER]: 12,
  [ActionType.SEND_ASSET]: 12,
  [ActionType.WITHDRAWAL]: 13,
  [ActionType.PLACE_ORDER]: 14,
  [ActionType.PLACE_TRIGGER_ORDER]: 14,
  [ActionType.PLACE_TWAP_ORDER]: 14,
  [ActionType.CANCEL_ORDER]: 15,
  [ActionType.CANCEL_TWAP_ORDER]: 15,
  [ActionType.CANCEL_ALL_ORDERS]: 16,
  [ActionType.MODIFY_ORDER]: 17,
  [ActionType.UPDATE_LEVERAGE]: 20,
  [ActionType.UPDATE_POSITION_MARGIN]: 29,
  [ActionType.ACCOUNT_MODE]: 41,
  [ActionType.UPDATE_ASSET_COLLATERAL]: 42,
  [ActionType.APPROVE_INTEGRATOR]: 45,
  [ActionType.REVOKE_INTEGRATOR]: 45,
}

// Nil sentinels from lighter-go `types/txtypes/constants.go`: the Go side
// leaves the matching `L2TxAttributes` entry unset.
const NIL_INTEGRATOR_INDEX = 0
const NIL_INTEGRATOR_TAKER_FEE = 0
const NIL_INTEGRATOR_MAKER_FEE = 0
const NIL_MARKET_INDEX = 255
const SEND_ASSET_NO_FEE = 0
const ZERO_MEMO: LighterWasmMemo = new Array(32).fill(0)
// The Go side reads "" as "0x" and leaves `L1Sig` empty.
type LighterWasmCall<T> = (wasm: LighterWasmExports) => LighterWasmPending<T>

const NO_L1_SIGNATURE = ''
// Only the ChangePubKey body uses the creation nonce, and the signer discards it.
const CLIENT_CREATION_NONCE = 0
const SIGNER_SEED_BYTES = 32
const INT64_MIN = -(2n ** 63n)
const INT64_MAX = 2n ** 63n - 1n
// Wire encoding the widget/backend emit for `SendAssetParams.sourceDex` /
// `destinationDex`, mapped onto Lighter's asset route types.
const LIGHTER_ROUTE_BY_DEX: Record<string, number> = {
  perps: LT_ROUTE_PERP,
  spot: LT_ROUTE_SPOT,
}

/**
 * Per Go runtime: the client the runtime holds for each account index, and the
 * tail of the queue that serializes client changes and signatures.
 */
interface WasmRuntimeState {
  clientByAccount: Map<number, string>
  queue: Promise<unknown>
}

const runtimeStates = new WeakMap<LighterWasmExports, WasmRuntimeState>()

function runtimeStateOf(wasm: LighterWasmExports): WasmRuntimeState {
  let state = runtimeStates.get(wasm)
  if (!state) {
    state = { clientByAccount: new Map(), queue: Promise.resolve() }
    runtimeStates.set(wasm, state)
  }
  return state
}

/**
 * Create a random seed for a new Lighter API key: 32 bytes from
 * `globalThis.crypto.getRandomValues`, as `0x` hex.
 *
 * @internal
 */
export function createSignerSeed(): string {
  const bytes = globalThis.crypto.getRandomValues(
    new Uint8Array(SIGNER_SEED_BYTES)
  )
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

/**
 * WASM-backed signer for Lighter API-key transactions and L1-countersigned
 * flows. The Go runtime holds one client per account index, shared by every
 * signer instance; each call makes sure the runtime holds the client for its
 * context before it signs.
 *
 * @internal
 */
export class LighterSigner {
  private readonly chainId: number
  private readonly collateralAssetIndex: number
  private wasm: LighterWasmExports | undefined

  constructor(config: LighterSignerConfig) {
    this.chainId = config.signerChainId
    this.collateralAssetIndex = config.collateralAssetIndex
  }

  /**
   * Load and cache the Go WASM signer exports. Most signing methods initialize
   * lazily, so callers only need this method when they want an explicit warm-up.
   */
  async initialize(): Promise<void> {
    if (!this.wasm) {
      this.wasm = await loadLighterWasm()
    }
  }

  /**
   * Create a new API key for the slot from a random seed. The seed is not
   * kept. `skipNonce` applies to the ChangePubKey that registers the key.
   */
  async createApiKey(
    slot: { accountIndex: number; apiKeyIndex: number },
    nonce: number,
    skipNonce: boolean
  ): Promise<CreatedApiKey> {
    const wasm = await this.ensureLoaded()
    return this.exclusive(wasm, async () => {
      const client = await callLighterWasm(
        'createClient',
        wasm._createClient(
          createSignerSeed(),
          this.chainId,
          slot.accountIndex,
          nonce,
          slot.apiKeyIndex,
          skipNonce
        )
      )
      const privateKey = `0x${client.prv}`
      runtimeStateOf(wasm).clientByAccount.set(
        slot.accountIndex,
        this.clientKey({ ...slot, apiKeyPrivateKey: privateKey }, skipNonce)
      )
      return {
        publicKey: `0x${client.pk}`,
        privateKey,
        messageToSign: l1BodyOf('createClient', client),
      }
    })
  }

  /**
   * Sign the ChangePubKey that registers `context`'s key, with the user's
   * wallet signature of {@link CreatedApiKey.messageToSign}.
   */
  async signChangePubKey(
    context: LighterSignerContext,
    nonce: number,
    skipNonce: boolean,
    l1Signature: string
  ): Promise<LighterSignedBlob> {
    return this.signWith(
      ActionType.REGISTER_API_KEY,
      context,
      skipNonce,
      (wasm) =>
        wasm._signChangePubKey(
          context.accountIndex,
          l1Signature,
          nonce,
          context.apiKeyIndex
        )
    )
  }

  /**
   * Get the L1 message the user's Ethereum wallet must sign for an
   * APPROVE_INTEGRATOR or TRANSFER action.
   */
  async getL1Message(
    action: LighterL1CountersignedAction,
    p: Record<string, unknown>,
    context: LighterSignerContext
  ): Promise<string> {
    const nonce = numberField(p, 'nonce')
    let label: string
    let call: LighterWasmCall<LighterWasmL1Body>
    if (action === ActionType.TRANSFER) {
      const args = this.transferArgs(p)
      label = 'getTransferTransaction'
      call = (wasm) =>
        wasm._getTransferTransaction(
          context.accountIndex,
          nonce,
          context.apiKeyIndex,
          ...args
        )
    } else {
      const args = approveIntegratorArgs(p)
      label = 'getApproveIntegratorTransaction'
      call = (wasm) =>
        wasm._getApproveIntegratorTransaction(
          context.accountIndex,
          nonce,
          context.apiKeyIndex,
          ...args
        )
    }
    const wasm = await this.ensureLoaded()
    return this.exclusive(wasm, async () => {
      await this.ensureClient(wasm, context, false)
      return l1BodyOf(label, await callLighterWasm(label, call(wasm)))
    })
  }

  /**
   * Sign an APPROVE_INTEGRATOR or TRANSFER action with the user's wallet
   * signature of the {@link getL1Message} message.
   */
  async signL1Countersigned(
    action: LighterL1CountersignedAction,
    p: Record<string, unknown>,
    context: LighterSignerContext,
    l1Signature: string
  ): Promise<LighterSignedBlob> {
    const nonce = numberField(p, 'nonce')
    if (action === ActionType.TRANSFER) {
      const args = this.transferArgs(p)
      return this.signWith(action, context, false, (wasm) =>
        wasm._signTransfer(
          context.accountIndex,
          l1Signature,
          nonce,
          context.apiKeyIndex,
          ...args
        )
      )
    }
    const args = approveIntegratorArgs(p)
    return this.signWith(action, context, false, (wasm) =>
      wasm._signApproveIntegrator(
        context.accountIndex,
        l1Signature,
        nonce,
        context.apiKeyIndex,
        ...args
      )
    )
  }

  /**
   * Sign an action blob with the stored API key. `wasmSignParams` comes
   * straight from the backend's `WasmBlobActionStep`. REGISTER_API_KEY,
   * APPROVE_INTEGRATOR and TRANSFER need the user's wallet: use
   * {@link signChangePubKey} and {@link signL1Countersigned}.
   */
  async sign(
    action: ActionType,
    wasmSignParams: Record<string, unknown>,
    context: LighterSignerContext
  ): Promise<LighterSignedBlob> {
    if (
      action === ActionType.REGISTER_API_KEY ||
      action === ActionType.APPROVE_INTEGRATOR ||
      action === ActionType.TRANSFER
    ) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `Lighter ${action} needs the user's L1 signature — sign() does not ` +
          'collect it.'
      )
    }
    return this.signWith(
      action,
      context,
      false,
      this.dispatch(action, wasmSignParams, context)
    )
  }

  /**
   * Create an auth token for authenticated reads and token-authenticated
   * mutations. The Go side sets the deadline to one hour from its clock.
   */
  async createAuthToken(context: LighterSignerContext): Promise<string> {
    const wasm = await this.ensureLoaded()
    return this.exclusive(wasm, async () => {
      await this.ensureClient(wasm, context, false)
      const result = await callLighterWasm(
        'createAuthToken',
        wasm._createAuthToken(context.accountIndex, context.apiKeyIndex)
      )
      return result.token
    })
  }

  private async ensureLoaded(): Promise<LighterWasmExports> {
    if (!this.wasm) {
      this.wasm = await loadLighterWasm()
    }
    return this.wasm
  }

  // A call to a Go export reads the account's client when the export runs and
  // again when its goroutine signs, so a client change must not run between.
  private exclusive<T>(
    wasm: LighterWasmExports,
    task: () => Promise<T>
  ): Promise<T> {
    const state = runtimeStateOf(wasm)
    const result = state.queue.then(task)
    state.queue = result.catch(() => undefined)
    return result
  }

  private async signWith(
    action: ActionType,
    context: LighterSignerContext,
    skipNonce: boolean,
    call: LighterWasmCall<LighterWasmTx>
  ): Promise<LighterSignedBlob> {
    const txType = TX_TYPE_BY_ACTION[action]
    if (txType === undefined) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `Lighter WASM signer does not support action: ${action}`
      )
    }
    const wasm = await this.ensureLoaded()
    return this.exclusive(wasm, async () => {
      await this.ensureClient(wasm, context, skipNonce)
      const { txInfo, txHash } = await callLighterWasm(
        `sign(${action})`,
        call(wasm)
      )
      return { txType, txInfo, txHash }
    })
  }

  private clientKey(context: LighterSignerContext, skipNonce: boolean): string {
    return `${this.chainId}:${context.apiKeyIndex}:${skipNonce}:${context.apiKeyPrivateKey.toLowerCase()}`
  }

  private async ensureClient(
    wasm: LighterWasmExports,
    context: LighterSignerContext,
    skipNonce: boolean
  ): Promise<void> {
    const clientByAccount = runtimeStateOf(wasm).clientByAccount
    const key = this.clientKey(context, skipNonce)
    if (clientByAccount.get(context.accountIndex) === key) {
      return
    }
    await callLighterWasm(
      'createClientByPrv',
      wasm._createClientByPrv(
        context.apiKeyPrivateKey,
        this.chainId,
        context.accountIndex,
        CLIENT_CREATION_NONCE,
        context.apiKeyIndex,
        skipNonce
      )
    )
    clientByAccount.set(context.accountIndex, key)
  }

  private transferArgs(
    p: Record<string, unknown>
  ): [number, number, number, number, number, number, LighterWasmMemo] {
    return [
      numberField(p, 'to_account'),
      this.collateralAssetIndex,
      LT_ROUTE_PERP,
      LT_ROUTE_PERP,
      numberField(p, 'usdc_amount'),
      numberField(p, 'fee'),
      memoField(p, 'memo'),
    ]
  }

  private dispatch(
    action: ActionType,
    p: Record<string, unknown>,
    ctx: LighterSignerContext
  ): LighterWasmCall<LighterWasmTx> {
    const nonce = numberField(p, 'nonce')
    switch (action) {
      case ActionType.PLACE_ORDER:
      case ActionType.PLACE_TRIGGER_ORDER:
      case ActionType.PLACE_TWAP_ORDER: {
        const args: Parameters<LighterWasmExports['_signCreateOrder']> = [
          ctx.accountIndex,
          numberField(p, 'market_index'),
          numberField(p, 'client_order_index'),
          int64StringField(p, 'base_amount'),
          int64StringField(p, 'price'),
          numberField(p, 'is_ask'),
          numberField(p, 'order_type'),
          numberField(p, 'time_in_force'),
          numberField(p, 'reduce_only'),
          int64StringField(p, 'trigger_price'),
          numberField(p, 'order_expiry'),
          nonce,
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
        ]
        return (wasm) => wasm._signCreateOrder(...args)
      }
      case ActionType.CANCEL_ORDER:
      case ActionType.CANCEL_TWAP_ORDER: {
        const args: Parameters<LighterWasmExports['_signCancelOrder']> = [
          ctx.accountIndex,
          numberField(p, 'market_index'),
          int64StringField(p, 'order_index'),
          nonce,
        ]
        return (wasm) => wasm._signCancelOrder(...args)
      }
      case ActionType.CANCEL_ALL_ORDERS: {
        const args: Parameters<LighterWasmExports['_signCancelAllOrders']> = [
          ctx.accountIndex,
          numberField(p, 'time_in_force'),
          numberField(p, 'timestamp_ms'),
          nonce,
          NIL_MARKET_INDEX,
        ]
        return (wasm) => wasm._signCancelAllOrders(...args)
      }
      case ActionType.MODIFY_ORDER: {
        const args: Parameters<LighterWasmExports['_signModifyOrder']> = [
          ctx.accountIndex,
          numberField(p, 'market_index'),
          int64StringField(p, 'order_index'),
          numberField(p, 'base_amount'),
          numberField(p, 'price'),
          numberField(p, 'trigger_price'),
          nonce,
        ]
        return (wasm) => wasm._signModifyOrder(...args)
      }
      case ActionType.UPDATE_LEVERAGE: {
        const args: Parameters<LighterWasmExports['_signUpdateLeverage']> = [
          ctx.accountIndex,
          numberField(p, 'market_index'),
          numberField(p, 'fraction'),
          numberField(p, 'margin_mode'),
          nonce,
        ]
        return (wasm) => wasm._signUpdateLeverage(...args)
      }
      case ActionType.UPDATE_POSITION_MARGIN: {
        const args: Parameters<LighterWasmExports['_signUpdateMargin']> = [
          ctx.accountIndex,
          numberField(p, 'market_index'),
          numberField(p, 'usdc_amount'),
          numberField(p, 'direction'),
          nonce,
        ]
        return (wasm) => wasm._signUpdateMargin(...args)
      }
      case ActionType.WITHDRAWAL: {
        const routeType = numberField(p, 'route_type')
        if (routeType !== LT_ROUTE_PERP && routeType !== LT_ROUTE_SPOT) {
          throw new PerpsError(
            PerpsErrorCode.ValidationError,
            `Lighter WITHDRAWAL route_type ${routeType} is invalid: expected ` +
              `${LT_ROUTE_PERP} (perps) or ${LT_ROUTE_SPOT} (spot)`
          )
        }
        const symbol = stringField(p, 'symbol')
        const amount = stringField(p, 'amount')
        const minimum = stringField(p, 'min_withdrawal_amount')
        if (isDecimalStringGreaterThan(minimum, amount)) {
          throw new PerpsError(
            PerpsErrorCode.ValidationError,
            `Lighter WITHDRAWAL of ${amount} ${symbol} is below the venue ` +
              `minimum of ${minimum} ${symbol}`
          )
        }
        const args: Parameters<LighterWasmExports['_signWithdraw']> = [
          ctx.accountIndex,
          numberField(p, 'asset_index'),
          routeType,
          String(
            decimalStringToScaledInteger(
              amount,
              numberField(p, 'decimals'),
              'truncate'
            )
          ),
          nonce,
        ]
        return (wasm) => wasm._signWithdraw(...args)
      }
      case ActionType.SEND_ASSET: {
        // A same-account collateral move between routes: no L1 signature
        // binds it, so `L1Sig` stays empty.
        const fromRouteType = routeFromDex(stringField(p, 'sourceDex'))
        const toRouteType = routeFromDex(stringField(p, 'destinationDex'))
        if (fromRouteType === toRouteType) {
          throw new PerpsError(
            PerpsErrorCode.ValidationError,
            'Lighter SEND_ASSET requires distinct source/destination routes ' +
              '(perp↔spot); a same-route transfer is a no-op'
          )
        }
        const args: Parameters<LighterWasmExports['_signTransfer']> = [
          ctx.accountIndex,
          NO_L1_SIGNATURE,
          nonce,
          ctx.apiKeyIndex,
          ctx.accountIndex,
          this.collateralAssetIndex,
          fromRouteType,
          toRouteType,
          numberField(p, 'amount'),
          SEND_ASSET_NO_FEE,
          ZERO_MEMO,
        ]
        return (wasm) => wasm._signTransfer(...args)
      }
      case ActionType.REVOKE_INTEGRATOR: {
        const args: Parameters<LighterWasmExports['_signApproveIntegrator']> = [
          ctx.accountIndex,
          NO_L1_SIGNATURE,
          nonce,
          ctx.apiKeyIndex,
          numberField(p, 'integrator_account_index'),
          revokeIntegratorZeroField(p, 'max_perps_taker_fee'),
          revokeIntegratorZeroField(p, 'max_perps_maker_fee'),
          revokeIntegratorZeroField(p, 'max_spot_taker_fee'),
          revokeIntegratorZeroField(p, 'max_spot_maker_fee'),
          revokeIntegratorZeroField(p, 'approval_expiry'),
        ]
        return (wasm) => wasm._signApproveIntegrator(...args)
      }
      case ActionType.ACCOUNT_MODE: {
        const args: Parameters<LighterWasmExports['_signUpdateAccountConfig']> =
          [ctx.accountIndex, numberField(p, 'account_trading_mode'), nonce]
        return (wasm) => wasm._signUpdateAccountConfig(...args)
      }
      case ActionType.UPDATE_ASSET_COLLATERAL: {
        const args: Parameters<
          LighterWasmExports['_signUpdateAccountAssetConfig']
        > = [
          ctx.accountIndex,
          numberField(p, 'asset_index'),
          assetMarginModeInt(booleanField(p, 'enabled')),
          nonce,
        ]
        return (wasm) => wasm._signUpdateAccountAssetConfig(...args)
      }
      default:
        throw new PerpsError(
          PerpsErrorCode.ValidationError,
          `Lighter WASM signer does not support action: ${action}`
        )
    }
  }
}

function l1BodyOf(label: string, result: LighterWasmL1Body): string {
  if (!result.pubKeySuccess || result.body === '') {
    throw new PerpsError(
      PerpsErrorCode.SignatureInvalid,
      `Lighter ${label} returned no L1 message`
    )
  }
  return result.body
}

function approveIntegratorArgs(
  p: Record<string, unknown>
): [number, number, number, number, number, number] {
  return [
    numberField(p, 'integrator_account_index'),
    numberField(p, 'max_perps_taker_fee'),
    numberField(p, 'max_perps_maker_fee'),
    numberField(p, 'max_spot_taker_fee'),
    numberField(p, 'max_spot_maker_fee'),
    numberField(p, 'approval_expiry'),
  ]
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
  throw new PerpsError(
    PerpsErrorCode.ValidationError,
    `Lighter sign params missing numeric field '${key}' (got ${typeof v})`
  )
}

/**
 * Read an int64 field as the decimal string the Go side parses. A number is
 * accepted only while it is a safe integer, so no precision is lost before the
 * value reaches Go.
 */
function int64StringField(p: Record<string, unknown>, key: string): string {
  const v = p[key]
  if (typeof v === 'number' && Number.isSafeInteger(v)) {
    return String(v)
  }
  if (typeof v === 'string' && /^-?(0|[1-9]\d*)$/.test(v)) {
    const value = BigInt(v)
    if (value >= INT64_MIN && value <= INT64_MAX) {
      return v
    }
  }
  throw new PerpsError(
    PerpsErrorCode.ValidationError,
    `Lighter sign params field '${key}' is not an int64 decimal string or a ` +
      `safe integer (got ${typeof v === 'string' ? `'${v}'` : String(v)})`
  )
}

// The fastwithdraw memo arrives as 32 raw bytes; a hex memo is 64 hex chars
// with or without `0x`.
function memoField(p: Record<string, unknown>, key: string): LighterWasmMemo {
  const memo = stringField(p, key)
  const bytes = new TextEncoder().encode(memo)
  if (bytes.length === 32) {
    return Array.from(bytes)
  }
  const hex = memo.length === 66 ? memo.replace(/^0x/, '') : memo
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Lighter sign params field '${key}' is not 32 bytes, or 32 bytes as hex`
    )
  }
  return Array.from({ length: 32 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  )
}

function revokeIntegratorZeroField(
  p: Record<string, unknown>,
  key: string
): number {
  const value = numberField(p, key)
  if (value !== 0) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Lighter REVOKE_INTEGRATOR requires '${key}' to be zero`
    )
  }
  return value
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
  throw new PerpsError(
    PerpsErrorCode.ValidationError,
    `Lighter sign params missing boolean field '${key}' (got ${typeof v})`
  )
}

function routeFromDex(dex: string): number {
  const route = LIGHTER_ROUTE_BY_DEX[dex]
  if (route === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Lighter SEND_ASSET: unsupported dex '${dex}' (expected 'perps' or 'spot')`
    )
  }
  return route
}

function stringField(p: Record<string, unknown>, key: string): string {
  const v = p[key]
  if (v === '') {
    throw new PerpsError(
      PerpsErrorCode.ValidationError,
      `Lighter sign params string field '${key}' is empty`
    )
  }
  if (typeof v === 'string') {
    return v
  }
  throw new PerpsError(
    PerpsErrorCode.ValidationError,
    `Lighter sign params missing string field '${key}' (got ${typeof v})`
  )
}
