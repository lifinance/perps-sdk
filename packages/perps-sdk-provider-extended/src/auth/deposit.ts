import {
  type PerpsClientSigner,
  PerpsError,
  rethrowWithKnownResults,
  type SignActionsContext,
} from '@lifi/perps-sdk'
import {
  type ActionResult,
  CHECK_ACCOUNT_BEFORE_RETRY_TEXT,
  type EvmTxActionStep,
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
  WaitForTransactionReceiptTimeoutError,
} from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { commitBridgeQuote, readBridgeContract } from '../bridge/rhino.js'
import {
  EXTENDED_BRIDGE_CHAINS,
  EXTENDED_DEPOSIT_COLLATERAL,
  EXTENDED_VENUE_BRIDGE_CHAIN,
} from '../constants.js'
import type { ExtendedApiClient } from '../utils/apiClient.js'

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

/**
 * Run Extended's deposit legs from the user's wallet: `approve` USDC to the
 * Rhino.fi bridge, then `depositWithId`. Right before the deposit leg, the
 * SDK gets and commits a bridge quote with the stored API key and writes its
 * id as the commitment id, because a quote expires in about two minutes. A
 * confirmed approval is `Accepted`; a mined deposit is `Submitted`, because
 * Extended credits it later. The legs stop at the first one that fails.
 *
 * @internal
 */
export async function executeDeposit(
  client: ExtendedApiClient,
  apiKey: string,
  steps: EvmTxActionStep[],
  ctx: SignActionsContext | undefined
): Promise<ActionResult[]> {
  let wallet: PerpsClientSigner =
    ctx?.userWallet ??
    refuse(
      'Extended deposits require the user wallet. Pass `userWallet` when creating the perps client.'
    )
  const chainIn =
    EXTENDED_BRIDGE_CHAINS[EXTENDED_DEPOSIT_COLLATERAL.chainId] ??
    refuse('Extended has no bridge chain for the deposit chain.')
  const bridge = await readBridgeContract(client, apiKey, chainIn)
  validateDepositLegs(steps, bridge)

  const executed: ActionResult[] = []
  for (const [index, step] of steps.entries()) {
    const { txParams } = step
    let txHash: Hex
    try {
      let args = txParams.args
      if (txParams.functionName === 'depositWithId') {
        const amount = BigInt(String(args[1]))
        const quoteId = await commitBridgeQuote(client, apiKey, {
          chainIn,
          chainOut: EXTENDED_VENUE_BRIDGE_CHAIN,
          amount: formatUnits(amount, EXTENDED_DEPOSIT_COLLATERAL.decimals),
        })
        args = [args[0], amount, BigInt(`0x${quoteId}`)]
      }
      if (wallet.chain?.id !== txParams.chainId && ctx?.switchToChain) {
        wallet = await ctx.switchToChain(txParams.chainId)
      }
      if (wallet.chain?.id !== txParams.chainId) {
        refuse(
          `Extended deposit runs on chain ${txParams.chainId}, but the wallet is on chain ${wallet.chain?.id ?? 'unknown'}.`
        )
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
      return rethrowWithKnownResults(executed, error)
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
          ...executed,
          { action: step.action, status: UserActionStatus.Submitted, txHash },
        ],
        error
      )
    }

    let reverted: boolean
    try {
      const receipt = await waitForTransactionReceipt(wallet, { hash: txHash })
      reverted = receipt.status === 'reverted'
    } catch (error) {
      executed.push({
        action: step.action,
        status: UserActionStatus.Indeterminate,
        txHash,
        error: `The Extended deposit transaction ${txHash} was sent, but its receipt did not arrive. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`,
        errorCode:
          error instanceof WaitForTransactionReceiptTimeoutError
            ? PerpsErrorCode.TimeoutError
            : PerpsErrorCode.ServerError,
      })
      return executed
    }
    if (reverted) {
      executed.push({
        action: step.action,
        status: UserActionStatus.Failed,
        txHash,
        error: `The Extended deposit transaction ${txHash} reverted.`,
        errorCode: PerpsErrorCode.ExchangeRejected,
      })
      return executed
    }
    const isDeposit = txParams.functionName === 'depositWithId'
    executed.push({
      action: step.action,
      status: isDeposit
        ? UserActionStatus.Submitted
        : UserActionStatus.Accepted,
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
      return rethrowWithKnownResults(executed, error)
    }
  }
  return executed
}
