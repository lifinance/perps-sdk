import type { Address } from 'viem'
import type { HlUserNonFundingLedgerUpdates } from '../types/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'
import { historyPage } from './historyPagination.js'

/** Read one raw ledger window and report venue truncation before any filtering. */
export const getLedgerWindow = async (
  apiUrl: string,
  params: { user: Address; startTime: number; endTime: number },
  options?: InfoRequestOptions
): Promise<{ items: HlUserNonFundingLedgerUpdates; saturated: boolean }> => {
  const items = await infoRequest<HlUserNonFundingLedgerUpdates>(
    apiUrl,
    { type: 'userNonFundingLedgerUpdates', ...params },
    options
  )
  return { items, saturated: items.length >= 500 }
}

/** Read the complete inclusive ledger interval through the shared capped-window paginator. */
export const getLedgerHistory = async (
  apiUrl: string,
  params: { user: Address; startTime: number; endTime: number },
  options?: InfoRequestOptions
): Promise<HlUserNonFundingLedgerUpdates> => {
  const page = await historyPage(
    params,
    Number.MAX_SAFE_INTEGER,
    (startTime, endTime) =>
      getLedgerWindow(
        apiUrl,
        { user: params.user, startTime, endTime },
        options
      ),
    (entry) => ({
      time: entry.time,
      key: `${entry.hash}:${JSON.stringify(entry.delta)}`,
    }),
    options?.signal
  )
  return page.items
}
