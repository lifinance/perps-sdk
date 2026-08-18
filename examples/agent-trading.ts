import { getMarkets, OrderSide, OrderType, PerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import type { Account, Chain, Transport, WalletClient } from 'viem'

async function run() {
  const perps = new PerpsClient({
    apiKey: 'your-api-key',
    providers: [hyperliquidProvider()],
  })

  // The user wallet signs setup steps that name PerpsSigner.USER. Pass any
  // viem WalletClient (wagmi's useWalletClient(), a private-key client, etc.).
  perps.setUserWallet(walletClient)

  const userAddress = '0x1234567890123456789012345678901234567890' as const

  // 1. Check which setup gates are unsatisfied (creates the agent keypair
  //    locally when the provider requires one).
  const setup = await perps.checkSetup({
    provider: 'hyperliquid',
    address: userAddress,
  })

  if (!setup.isReady) {
    // 2. Sign each outstanding setup step with the configured wallet signer.
    //    Agent-gated steps are auto-signed inside executeProviderSetup.
    const signedActions = await Promise.all(
      setup.setup.map((step) =>
        perps.signProviderSetupAction('hyperliquid', userAddress, step)
      )
    )

    // 3. Submit the signed setup steps and auto-sign any agent setup steps.
    await perps.executeProviderSetup({
      provider: 'hyperliquid',
      address: userAddress,
      setup: setup.setup,
      signedActions,
    })
  }

  // 4. Resolve the market by its opaque Market.id — placeOrder references a
  //    market via { marketId, categoryId }, not a display symbol.
  const { markets } = await getMarkets(perps.client, {
    provider: 'hyperliquid',
  })
  const btc = markets.find((m) => m.baseAsset.displaySymbol === 'BTC')
  if (!btc) {
    throw new Error('BTC market not found')
  }

  // 5. Place orders — the agent signs automatically, no wallet popups.
  const result = await perps.placeOrder({
    address: userAddress,
    provider: 'hyperliquid',
    market: { marketId: btc.id, categoryId: btc.categoryId },
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    size: '0.1',
    price: '95000.00',
    leverage: 10,
  })
  console.log('Order result:', result)

  // 6. Cancel orders — also automatic.
  await perps.cancelOrders({
    address: userAddress,
    provider: 'hyperliquid',
    ids: ['order1', 'order2'],
  })
}

// Placeholder — replace with your wallet client (e.g. a viem WalletClient).
declare const walletClient: WalletClient<Transport, Chain, Account>

run()
