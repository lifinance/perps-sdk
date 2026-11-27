// Revoke the session agent that the SDK signs trades with. After the revoke,
// the provider deletes the local agent key, and the next checkSetup stages
// the agent approval again.
// Requires a wallet (PRIVATE_KEY) and an agent that 03-onboarding.ts approved.

// WARNING: this script signs on Hyperliquid mainnet. Hyperliquid has no
// testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  ActionType,
  getProviders,
  isSubmittedOrAccepted,
  PerpsClient,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import { createWalletClient, http, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const provider = HYPERLIQUID_PROVIDER_KEY

// WARNING: this file holds the Hyperliquid agent private key in plaintext.
// Keep it out of version control, and delete it when you are done.
const storageFile = new URL('.perps-storage.json', import.meta.url)

async function readStorage(): Promise<Record<string, string>> {
  if (!existsSync(storageFile)) {
    return {}
  }
  return JSON.parse(await readFile(storageFile, 'utf8'))
}

async function writeStorage(values: Record<string, string>): Promise<void> {
  await writeFile(storageFile, JSON.stringify(values, null, 2), {
    mode: 0o600,
  })
}

const storage: StorageAdapter = {
  get: async (key) => (await readStorage())[key] ?? null,
  set: async (key, value) => {
    await writeStorage({ ...(await readStorage()), [key]: value })
  },
  remove: async (key) => {
    const { [key]: _removed, ...values } = await readStorage()
    await writeStorage(values)
  },
}

const privateKey = process.env.PRIVATE_KEY
if (privateKey === undefined || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY to the 0x-prefixed wallet private key.')
}
const account = privateKeyToAccount(privateKey)
const address = account.address
const walletClient = createWalletClient({
  account,
  chain: arbitrum,
  transport: http(),
})

const perps = new PerpsClient({
  apiKey: process.env.LIFI_API_KEY,
  providers: [hyperliquidProvider({ storage })],
})
perps.setUserWallet(walletClient)

// The setup step declares its own revoke action (revokeSessionAgent).
const { providers } = await getProviders(perps.client)
const step = providers
  .find((entry) => entry.key === provider)
  ?.setup.find((entry) => entry.type === ActionType.APPROVE_AGENT)
if (step === undefined) {
  throw new Error('The provider declares no approveAgent setup step.')
}

const { results } = await perps.executeProviderRevoke({
  provider,
  address,
  step,
})
for (const result of results) {
  if (!isSubmittedOrAccepted(result)) {
    // The local agent key stays when the revoke is not confirmed.
    throw new Error(
      `${result.action}: ${result.status} (${result.errorCode}) ${result.error}`
    )
  }
}
console.log(
  'Revoked the session agent. Run 03-onboarding.ts to approve a new one.'
)
