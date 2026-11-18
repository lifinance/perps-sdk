import type {
  Hex,
  StarkOrderFields,
  StarkTransferFields,
  StarkWithdrawalFields,
} from '@lifi/perps-types'
import { keccak, pedersen, poseidonHashMany } from '@scure/starknet'
import { type StarkFeltInput, toFelt, toStarkHex } from './starkFelt.js'

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

const SHARED_TYPES =
  '"PositionId"("value":"u32")"AssetId"("value":"felt")"Timestamp"("seconds":"u64")'
const ORDER_TYPE = `"Order"("position_id":"felt","base_asset_id":"AssetId","base_amount":"i64","quote_asset_id":"AssetId","quote_amount":"i64","fee_asset_id":"AssetId","fee_amount":"u64","expiration":"Timestamp","salt":"felt")${SHARED_TYPES}`
const TRANSFER_TYPE = `"TransferArgs"("recipient":"PositionId","position_id":"PositionId","collateral_id":"AssetId","amount":"u64","expiration":"Timestamp","salt":"felt")${SHARED_TYPES}`
const WITHDRAWAL_TYPE = `"WithdrawArgs"("recipient":"ContractAddress","position_id":"PositionId","collateral_id":"AssetId","amount":"u64","expiration":"Timestamp","salt":"felt")${SHARED_TYPES}`
const DOMAIN_TYPE =
  '"StarknetDomain"("name":"shortstring","version":"shortstring","chainId":"shortstring","revision":"shortstring")'

const textEncoder = new TextEncoder()

const toTypeSelector = (type: string): bigint =>
  keccak(textEncoder.encode(type))

const toShortString = (text: string): bigint =>
  textEncoder
    .encode(text)
    .reduce((value, byte) => (value << 8n) | BigInt(byte), 0n)

const hashFelts = (values: StarkFeltInput[]): bigint =>
  poseidonHashMany(values.map(toFelt))

function calculateMessageHash(
  domain: StarkDomain,
  publicKey: Hex,
  type: string,
  fields: StarkFeltInput[]
): Hex {
  const domainHash = hashFelts([
    toTypeSelector(DOMAIN_TYPE),
    toShortString(domain.name),
    toShortString(domain.version),
    toShortString(domain.chainId),
    domain.revision,
  ])
  const structHash = hashFelts([toTypeSelector(type), ...fields])
  return toStarkHex(
    hashFelts([
      toShortString('StarkNet Message'),
      domainHash,
      publicKey,
      structHash,
    ])
  )
}

/** Calculate the SNIP-12 hash that the account signs to place an order. @public */
export function calculateStarkOrderHash(
  fields: StarkOrderFields,
  domain: StarkDomain,
  publicKey: Hex
): Hex {
  return calculateMessageHash(domain, publicKey, ORDER_TYPE, [
    fields.positionId,
    fields.baseAssetId,
    fields.baseAmount,
    fields.quoteAssetId,
    fields.quoteAmount,
    fields.feeAssetId,
    fields.feeAmount,
    fields.expiration,
    fields.salt,
  ])
}

/** Calculate the SNIP-12 hash that the sender signs for a transfer. @public */
export function calculateStarkTransferHash(
  fields: StarkTransferFields,
  domain: StarkDomain,
  publicKey: Hex
): Hex {
  return calculateMessageHash(domain, publicKey, TRANSFER_TYPE, [
    fields.recipientPositionId,
    fields.senderPositionId,
    fields.collateralId,
    fields.amount,
    fields.expiration,
    fields.salt,
  ])
}

/** Calculate the SNIP-12 hash that the account signs for a withdrawal. @public */
export function calculateStarkWithdrawalHash(
  fields: StarkWithdrawalFields,
  domain: StarkDomain,
  publicKey: Hex
): Hex {
  return calculateMessageHash(domain, publicKey, WITHDRAWAL_TYPE, [
    fields.recipient,
    fields.positionId,
    fields.collateralId,
    fields.amount,
    fields.expiration,
    fields.salt,
  ])
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
