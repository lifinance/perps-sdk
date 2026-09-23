import {
  createWarnOnce,
  ExplorerChainId,
  explorerTxUrl,
  PerpsError,
} from '@lifi/perps-sdk'
import type { Order, OrderBase } from '@lifi/perps-types'
import { isHex } from 'viem'
import { HYPERLIQUID_EXPLORER_RPC_URL, PROVIDER_KEY } from '../constants.js'
import { type HlExplorerTx, isHlExplorerTx } from '../types/explorer.js'
import { hlPostJson, type InfoRequestOptions } from './infoClient.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Read the address's recent HyperCore transactions from the explorer RPC.
 *
 * The surface is undocumented, so it is read defensively: an address the
 * explorer has never indexed answers `200` with no `txs` array, and each entry
 * is checked on its own so one drifted entry cannot drop the rest.
 *
 * @throws {PerpsError} On a non-2xx status or a transport failure.
 * @public
 */
export const fetchUserTransactions = async (
  address: string,
  options?: InfoRequestOptions
): Promise<HlExplorerTx[]> => {
  const body = await hlPostJson<{ txs?: unknown } | null>(
    HYPERLIQUID_EXPLORER_RPC_URL,
    'explorer userDetails',
    { type: 'userDetails', user: address },
    options
  )
  const txs = body?.txs
  return Array.isArray(txs) ? txs.filter(isHlExplorerTx) : []
}

/**
 * Every client order id an action names: `orders[].c` on a placement, `order.c`
 * on a single modify, and `modifies[].order.c` on a batch modify. A batched
 * placement names one id per leg, so every id is returned, not just the first.
 *
 * @public
 */
export const getClientOrderIds = (
  action: Record<string, unknown>
): string[] => {
  const wires: unknown[] = [
    ...(Array.isArray(action.orders) ? action.orders : []),
    ...(Array.isArray(action.modifies)
      ? action.modifies.map((modify) =>
          isRecord(modify) ? modify.order : undefined
        )
      : []),
    action.order,
  ]
  const ids: string[] = []
  for (const wire of wires) {
    if (!isRecord(wire)) {
      continue
    }
    const cloid = wire.c
    if (
      typeof cloid === 'string' &&
      cloid !== '0x' &&
      isHex(cloid, { strict: true })
    ) {
      ids.push(cloid)
    }
  }
  return ids
}

/**
 * The hash of the transaction whose action names the order's client order id.
 *
 * @returns The transaction hash, or `undefined` when the order carries no
 *   client order id or no transaction in the window names it.
 * @public
 */
export const matchOrderActionHash = (
  txs: HlExplorerTx[],
  order: Pick<OrderBase, 'clientOrderId'>
): string | undefined => {
  const { clientOrderId } = order
  if (clientOrderId === undefined) {
    return undefined
  }
  // A client order id is hex, so the venue may echo a case the placer did not send.
  const wanted = clientOrderId.toLowerCase()
  const match = txs.find(
    (tx) =>
      isRecord(tx.action) &&
      getClientOrderIds(tx.action).some((id) => id.toLowerCase() === wanted)
  )
  return match?.hash
}

const warn = createWarnOnce()

/**
 * Set `explorerLink` on each order whose placement transaction the explorer
 * window still holds. One explorer read serves every order, and it is skipped
 * when no order carries a client order id to match on. The link is
 * supplementary, so an explorer failure warns and leaves the orders unlinked
 * instead of failing the order read. A caller cancellation still rejects.
 */
export const withExplorerLinks = async (
  orders: Order[],
  address: string,
  options: InfoRequestOptions
): Promise<Order[]> => {
  if (!orders.some((order) => order.clientOrderId !== undefined)) {
    return orders
  }
  let txs: HlExplorerTx[]
  try {
    txs = await fetchUserTransactions(address, options)
  } catch (error) {
    // `hlPostJson` wraps a signal timeout as a `ServerError`, so the signal,
    // not the error type, tells a caller cancellation from an explorer failure.
    if (!(error instanceof PerpsError) || options.signal?.aborted) {
      throw error
    }
    // The message stays out of the key: a transport failure names hosts and
    // ports, so keying on it would let the dedupe set grow without bound.
    warn(
      'explorer link lookup failed',
      `[${PROVIDER_KEY}] explorer link lookup failed: ${error.message}`
    )
    return orders
  }
  return orders.map((order) => {
    const explorerLink = explorerTxUrl(
      ExplorerChainId.HYPERLIQUID,
      matchOrderActionHash(txs, order)
    )
    return explorerLink === undefined ? order : { ...order, explorerLink }
  })
}
