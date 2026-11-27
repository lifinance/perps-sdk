import type { Hex } from '@lifi/perps-types'
import { pedersen } from '@scure/starknet'
import type {
  ExtendedStarkOrderFields,
  ExtendedStarkTransferFields,
  ExtendedStarkWithdrawalFields,
} from '../types/starkMessage.js'
import { toDecimal, toStarkHex } from './starkFelt.js'
import { loadStarkWasm } from './starkWasm.js'

/** SNIP-12 domain of the Extended Starknet contracts. @public */
export interface StarkDomain {
  name: string
  version: string
  chainId: string
  revision: string
}

/** @public */
export const EXTENDED_MAINNET_STARK_DOMAIN: StarkDomain = {
  name: 'Perpetuals',
  version: 'v0',
  chainId: 'SN_MAIN',
  revision: '1',
}

const domainArgs = ({ name, version, chainId, revision }: StarkDomain) =>
  [name, version, chainId, revision] as const

/** Calculate the SNIP-12 hash that the account signs to place an order. @public */
export async function calculateStarkOrderHash(
  fields: ExtendedStarkOrderFields,
  domain: StarkDomain,
  publicKey: Hex
): Promise<Hex> {
  const wasm = await loadStarkWasm()
  return toStarkHex(
    wasm.get_order_msg(
      toDecimal(fields.positionId),
      toStarkHex(fields.baseAssetId),
      toDecimal(fields.baseAmount),
      toStarkHex(fields.quoteAssetId),
      toDecimal(fields.quoteAmount),
      toStarkHex(fields.feeAssetId),
      toDecimal(fields.feeAmount),
      toDecimal(fields.expiration),
      toDecimal(fields.salt),
      toStarkHex(publicKey),
      ...domainArgs(domain)
    )
  )
}

/** Calculate the SNIP-12 hash that the sender signs for a transfer. @public */
export async function calculateStarkTransferHash(
  fields: ExtendedStarkTransferFields,
  domain: StarkDomain,
  publicKey: Hex
): Promise<Hex> {
  const wasm = await loadStarkWasm()
  return toStarkHex(
    wasm.get_transfer_msg(
      toDecimal(fields.recipientPositionId),
      toDecimal(fields.senderPositionId),
      toStarkHex(fields.collateralId),
      toDecimal(fields.amount),
      toDecimal(fields.expiration),
      toDecimal(fields.salt),
      toStarkHex(publicKey),
      ...domainArgs(domain)
    )
  )
}

/** Calculate the SNIP-12 hash that the account signs for a withdrawal. @public */
export async function calculateStarkWithdrawalHash(
  fields: ExtendedStarkWithdrawalFields,
  domain: StarkDomain,
  publicKey: Hex
): Promise<Hex> {
  const wasm = await loadStarkWasm()
  return toStarkHex(
    wasm.get_withdraw_msg(
      toStarkHex(fields.recipient),
      toDecimal(fields.positionId),
      toStarkHex(fields.collateralId),
      toDecimal(fields.amount),
      toDecimal(fields.expiration),
      toDecimal(fields.salt),
      toStarkHex(publicKey),
      ...domainArgs(domain)
    )
  )
}

/**
 * Calculate the Pedersen hash of the wallet and the Stark public key that the
 * Stark key signs at account registration.
 *
 * @public
 */
export function calculateStarkRegistrationHash(
  walletAddress: Hex,
  publicKey: Hex
): Hex {
  return toStarkHex(pedersen(walletAddress, publicKey))
}
