import {
  getTermsAcceptance,
  isSubmittedOrAccepted,
  PerpsClient,
} from '@lifi/perps-sdk'
import { LocalJSONFileAdapter } from '@lifi/perps-sdk/node'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const settings = {
  provider: 'hyperliquid',
  storageFile: new URL('.perps-storage.json', import.meta.url),
}

const privateKey = process.env.PRIVATE_KEY
if (!privateKey || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY in .env.')
}
const account = privateKeyToAccount(privateKey)
const storage = new LocalJSONFileAdapter(settings.storageFile)
const perps = new PerpsClient({ providers: [hyperliquidProvider({ storage })] })
perps.setUserWallet(
  createWalletClient({ account, chain: arbitrum, transport: http() })
)

const request = { provider: settings.provider, address: account.address }
const terms = await getTermsAcceptance(perps.client, request.address)
if (!terms.accepted) {
  const { results } = await perps.submitOnboarding({
    address: request.address,
    termsVersion: terms.termsVersion,
  })
  if (results.some((result) => !isSubmittedOrAccepted(result))) {
    throw new Error('Terms acceptance failed.', { cause: results })
  }
}

if (!(await perps.accountExists(request.provider, request.address))) {
  throw new Error(
    'Make the first deposit before completing setup. See 04-deposit.ts.'
  )
}

let setup = await perps.checkSetup(request)
while (!setup.isReady) {
  const item = setup.checklist.find(({ satisfied }) => !satisfied)
  if (!item) {
    break
  }

  const { options, type } = item.descriptor
  const option = options?.find((entry) => entry.default) ?? options?.[0]
  const step = setup.setup.find(({ action }) => action === type)
  const response = option
    ? await perps.executeProviderOption({ ...request, option })
    : step &&
      (await perps.executeProviderSetupAction({
        ...request,
        step,
        checklist: setup.checklist,
      }))
  if (
    !response ||
    response.results.some((result) => !isSubmittedOrAccepted(result))
  ) {
    throw new Error(`Setup action failed: ${type}`, {
      cause: response?.results,
    })
  }
  setup = await perps.checkSetup(request)
}
console.log('Ready to trade:', setup.isReady)
