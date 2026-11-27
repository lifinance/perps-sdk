// Onboard a wallet to Hyperliquid: accept the terms, make the first deposit
// when no account exists, then complete the account setup.
// Requires a wallet (PRIVATE_KEY). A new account also requires USDC and ETH
// gas on Arbitrum for the first deposit.

// WARNING: this script signs on Hyperliquid mainnet and can move real funds.
// Hyperliquid has no testnet that the SDK can use.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  type ExecuteActionResponse,
  getProviders,
  getTermsAcceptance,
  isSubmittedOrAccepted,
  PerpsClient,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  HYPERLIQUID_PROVIDER_KEY,
  hyperliquidProvider,
} from '@lifi/perps-sdk-provider-hyperliquid'
import {
  convertQuoteToRoute,
  createClient,
  executeRoute,
  getQuote,
  getToken,
} from '@lifi/sdk'
import { EthereumProvider } from '@lifi/sdk-provider-ethereum'
import { createWalletClient, http, isHex, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'

const provider = HYPERLIQUID_PROVIDER_KEY
const depositAmount = process.env.DEPOSIT_AMOUNT ?? '10'
const depositToken = process.env.DEPOSIT_TOKEN ?? 'USDC'

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

function assertApplied(label: string, { results }: ExecuteActionResponse) {
  for (const result of results) {
    if (!isSubmittedOrAccepted(result)) {
      throw new Error(`${label}: ${result.status} ${result.error ?? ''}`)
    }
  }
}

const privateKey = process.env.PRIVATE_KEY
if (privateKey === undefined || !isHex(privateKey)) {
  throw new Error('Set PRIVATE_KEY to the 0x-prefixed wallet private key.')
}
const account = privateKeyToAccount(privateKey)
const address = account.address
// Hyperliquid user actions sign EIP-712 with the Arbitrum chain id.
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

// 1. Terms. Every provider action fails with TermsNotAccepted (2012) until the
//    address accepts the current terms version.
const terms = await getTermsAcceptance(perps.client, address)
if (!terms.accepted) {
  assertApplied(
    'Terms',
    await perps.submitOnboarding({ address, termsVersion: terms.termsVersion })
  )
  console.log(`Accepted terms version ${terms.termsVersion}.`)
}

// 2. Account. A Hyperliquid account exists only after its first deposit.
if (!(await perps.accountExists(provider, address))) {
  const { providers } = await getProviders(perps.client)
  const minDepositUsd =
    providers.find((entry) => entry.key === provider)?.minDepositUsd ?? '0'

  // 3. First deposit. The SDK names the destination; @lifi/sdk runs the route.
  const flow = await perps.getDepositFlow({ provider, address })
  if (flow?.kind !== 'lifiSwap') {
    throw new Error(`Unexpected deposit flow: ${flow?.kind}`)
  }
  const lifi = createClient({
    integrator: 'perps-sdk-examples',
    apiKey: process.env.LIFI_API_KEY,
    providers: [
      EthereumProvider({ getWalletClient: async () => walletClient }),
    ],
  })
  const fromToken = await getToken(lifi, arbitrum.id, depositToken)
  const quote = await getQuote(lifi, {
    fromChain: arbitrum.id,
    fromToken: fromToken.address,
    fromAmount: parseUnits(depositAmount, fromToken.decimals).toString(),
    fromAddress: address,
    toChain: flow.destination.chainId,
    toToken: flow.destination.address,
    toAddress: flow.toAddress ?? address,
  })
  // The venue does not credit a deposit below its minimum.
  const minimum = parseUnits(minDepositUsd, flow.destination.decimals)
  if (BigInt(quote.estimate.toAmountMin) < minimum) {
    throw new Error(
      `The deposit can arrive below ${minDepositUsd} USD. Raise DEPOSIT_AMOUNT.`
    )
  }
  console.log(`Depositing ${depositAmount} ${fromToken.symbol}...`)
  await executeRoute(lifi, convertQuoteToRoute(quote), {
    updateRouteHook: (route) =>
      console.log('Route status:', route.steps[0]?.execution?.status),
  })

  while (!(await perps.accountExists(provider, address))) {
    console.log('Waiting for Hyperliquid to credit the deposit...')
    await sleep(10_000)
  }
}

// 4. Setup. checkSetup creates and stores the agent key on its first call, so
//    it is not a pure read. Read the checklist again after each step.
let setup = await perps.checkSetup({ provider, address })
while (!setup.isReady) {
  const item = setup.checklist.find((entry) => !entry.satisfied)
  if (item === undefined) {
    // An SDK-signed step is still pending. The next checkSetup runs it again.
    await sleep(5_000)
    setup = await perps.checkSetup({ provider, address })
    continue
  }

  const { options } = item.descriptor
  if (options !== null) {
    // A choice step. This example takes the recommended option.
    const option = options.find((entry) => entry.default) ?? options[0]
    console.log(`Selecting '${option.title}' for ${item.descriptor.type}...`)
    assertApplied(
      item.descriptor.type,
      await perps.executeProviderOption({ provider, address, option })
    )
  } else {
    const step = setup.setup.find(
      (entry) => entry.action === item.descriptor.type
    )
    if (step === undefined) {
      throw new Error(`No staged step for ${item.descriptor.type}.`)
    }
    console.log(`Signing ${step.action}...`)
    assertApplied(
      step.action,
      await perps.executeProviderSetupAction({
        provider,
        address,
        step,
        checklist: setup.checklist,
      })
    )
  }
  setup = await perps.checkSetup({ provider, address })
}

console.log(`${address} is ready to trade on Hyperliquid.`)
