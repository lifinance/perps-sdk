import {
  type PerpsClientSigner,
  PerpsError,
  rethrowWithKnownResults,
  type SignActionsContext,
  type SignActionsResult,
} from '@lifi/perps-sdk'
import {
  type ActionResult,
  ActionType,
  CHECK_ACCOUNT_BEFORE_RETRY_TEXT,
  type EvmTxActionStep,
  type EvmTxSignedActionStep,
  PerpsErrorCode,
  UserActionStatus,
} from '@lifi/perps-types'
import {
  type Address,
  formatUnits,
  type Hex,
  isAddress,
  isAddressEqual,
  parseAbi,
  type ReplacementReturnType,
  WaitForTransactionReceiptTimeoutError,
} from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { commitBridgeQuote, readBridgeContract } from '../bridge/rhino.js'
import {
  EXTENDED_BRIDGE_CHAINS,
  EXTENDED_DEPOSIT_COLLATERAL,
  EXTENDED_VENUE_BRIDGE_CHAIN,
} from '../constants.js'
import { type ExtendedApiClient, ExtendedApiError } from '../utils/apiClient.js'

const refuse = (message: string): never => {
  throw new PerpsError(PerpsErrorCode.SDKError, message)
}

const sameAddress = (value: unknown, expected: Address): boolean =>
  typeof value === 'string' &&
  isAddress(value) &&
  isAddressEqual(value, expected)

/**
 * Check every leg against the bridge contract that Extended names, so the
 * wallet never approves or pays an address that the step alone supplies.
 */
function validateDepositLegs(steps: EvmTxActionStep[], bridge: Address): void {
  const token = EXTENDED_DEPOSIT_COLLATERAL.address
  for (const { txParams } of steps) {
    if (txParams.chainId !== EXTENDED_DEPOSIT_COLLATERAL.chainId) {
      refuse(`Extended deposit leg targets chain ${txParams.chainId}.`)
    }
    const valid =
      txParams.functionName === 'approve'
        ? sameAddress(txParams.to, token) &&
          sameAddress(txParams.args[0], bridge)
        : txParams.functionName === 'depositWithId' &&
          sameAddress(txParams.to, bridge) &&
          sameAddress(txParams.args[0], token)
    if (!valid) {
      refuse(
        `Extended deposit leg '${txParams.functionName}' does not match the Rhino.fi bridge ${bridge}.`
      )
    }
  }
}

/** Extended answered a bridge read before the deposit leg was sent. */
const venueRefusal = (error: ExtendedApiError): ActionResult => ({
  action: ActionType.DEPOSIT,
  status: UserActionStatus.Failed,
  error: error.message,
  errorCode: error.code,
})

/** The arguments as JSON carries them to the backend: integers as decimal strings. */
const toWireArgs = (args: readonly unknown[]): unknown[] =>
  args.map((arg) => (typeof arg === 'bigint' ? arg.toString() : arg))

/**
 * Run Extended's deposit legs from the user's wallet: `approve` USDC to the
 * Rhino.fi bridge, then `depositWithId`. Right before the deposit leg, the
 * SDK gets and commits a bridge quote with the stored API key and writes its
 * id as the commitment id, because a quote expires in about two minutes.
 * Each confirmed leg is a signed step with its `txHash` for `executeAction`,
 * where the backend records it. A reverted, unconfirmed, cancelled or replaced
 * leg stops the legs and stays a local result. A repriced leg counts under its
 * replacement's hash.
 *
 * @internal
 */
export async function executeDeposit(
  client: ExtendedApiClient,
  apiKey: string,
  steps: EvmTxActionStep[],
  ctx: SignActionsContext | undefined
): Promise<SignActionsResult> {
  let wallet: PerpsClientSigner =
    ctx?.userWallet ??
    refuse(
      'Extended deposits require the user wallet. Pass `userWallet` when creating the perps client.'
    )
  const chainIn =
    EXTENDED_BRIDGE_CHAINS[EXTENDED_DEPOSIT_COLLATERAL.chainId] ??
    refuse('Extended has no bridge chain for the deposit chain.')
  let bridge: Address
  try {
    bridge = await readBridgeContract(client, apiKey, chainIn)
  } catch (error) {
    if (error instanceof ExtendedApiError) {
      return { signed: [], executed: [venueRefusal(error)] }
    }
    throw error
  }
  validateDepositLegs(steps, bridge)

  const signed: EvmTxSignedActionStep[] = []
  const confirmed = (): ActionResult[] =>
    signed.map((leg) => ({
      action: leg.action,
      status:
        leg.txParams.functionName === 'depositWithId'
          ? UserActionStatus.Submitted
          : UserActionStatus.Accepted,
      txHash: leg.txHash,
    }))
  for (const [index, step] of steps.entries()) {
    const { txParams } = step
    let args = txParams.args
    let txHash: Hex
    try {
      if (wallet.chain?.id !== txParams.chainId && ctx?.switchToChain) {
        wallet = await ctx.switchToChain(txParams.chainId)
      }
      if (wallet.chain?.id !== txParams.chainId) {
        refuse(
          `Extended deposit runs on chain ${txParams.chainId}, but the wallet is on chain ${wallet.chain?.id ?? 'unknown'}.`
        )
      }
      if (txParams.functionName === 'depositWithId') {
        const amount = BigInt(String(args[1]))
        let quoteId: string
        try {
          quoteId = await commitBridgeQuote(client, apiKey, {
            chainIn,
            chainOut: EXTENDED_VENUE_BRIDGE_CHAIN,
            amount: formatUnits(amount, EXTENDED_DEPOSIT_COLLATERAL.decimals),
          })
        } catch (error) {
          if (error instanceof ExtendedApiError) {
            return {
              signed: [],
              executed: [...confirmed(), venueRefusal(error)],
            }
          }
          throw error
        }
        args = [args[0], amount, BigInt(`0x${quoteId}`)]
      }
      txHash = await wallet.writeContract({
        address: txParams.to,
        abi: parseAbi(txParams.abi),
        functionName: txParams.functionName,
        args,
        chain: wallet.chain,
        account: wallet.account,
      })
    } catch (error) {
      return rethrowWithKnownResults(confirmed(), error)
    }
    try {
      ctx?.onProgress?.({
        index,
        total: steps.length,
        action: step.action,
        functionName: txParams.functionName,
        chainId: txParams.chainId,
        status: 'submitted',
        txHash,
      })
    } catch (error) {
      return rethrowWithKnownResults(
        [
          ...confirmed(),
          { action: step.action, status: UserActionStatus.Submitted, txHash },
        ],
        error
      )
    }

    let reverted: boolean
    let replacement: ReplacementReturnType | undefined
    try {
      const receipt = await waitForTransactionReceipt(wallet, {
        hash: txHash,
        onReplaced: (replaced) => {
          replacement = replaced
        },
      })
      reverted = receipt.status === 'reverted'
    } catch (error) {
      return {
        signed: [],
        executed: [
          ...confirmed(),
          {
            action: step.action,
            status: UserActionStatus.Indeterminate,
            txHash,
            error: `The Extended deposit transaction ${txHash} was sent, but its receipt did not arrive. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`,
            errorCode:
              error instanceof WaitForTransactionReceiptTimeoutError
                ? PerpsErrorCode.TimeoutError
                : PerpsErrorCode.ServerError,
          },
        ],
      }
    }
    if (replacement !== undefined && replacement.reason !== 'repriced') {
      return {
        signed: [],
        executed: [
          ...confirmed(),
          {
            action: step.action,
            status: UserActionStatus.Failed,
            txHash,
            error: `The Extended deposit transaction ${txHash} was ${replacement.reason} by ${replacement.transaction.hash}.`,
            errorCode: PerpsErrorCode.ExchangeRejected,
          },
        ],
      }
    }
    if (replacement !== undefined) {
      txHash = replacement.transaction.hash
    }
    if (reverted) {
      return {
        signed: [],
        executed: [
          ...confirmed(),
          {
            action: step.action,
            status: UserActionStatus.Failed,
            txHash,
            error: `The Extended deposit transaction ${txHash} reverted.`,
            errorCode: PerpsErrorCode.ExchangeRejected,
          },
        ],
      }
    }
    signed.push({
      action: step.action,
      txParams: { ...txParams, args: toWireArgs(args) },
      txHash,
    })
    try {
      ctx?.onProgress?.({
        index,
        total: steps.length,
        action: step.action,
        functionName: txParams.functionName,
        chainId: txParams.chainId,
        status: 'confirmed',
        txHash,
      })
    } catch (error) {
      return rethrowWithKnownResults(confirmed(), error)
    }
  }
  return { signed, executed: [] }
}
