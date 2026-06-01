import { OrderSide, OrderType, PerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'
import type { Account, Chain, Transport, WalletClient } from 'viem'

async function run() {
  const perps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
    providers: [hyperliquidProvider()],
  })

  // The user wallet signs setup steps that name PerpsSigner.USER. Pass any
  // viem WalletClient (wagmi's useWalletClient(), a private-key client, etc.).
  perps.setSigner(walletClient)

  const userAddress = '0x1234567890123456789012345678901234567890' as const

  // 1. Check which setup gates are unsatisfied (creates the agent keypair
  //    locally when the provider requires one).
  const required = await perps.checkSetup({
    provider: 'hyperliquid',
    address: userAddress,
  })

  if (!required.isReady) {
    // 2. Sign each user-gated setup step with the configured wallet signer.
    //    Agent-gated steps are auto-signed inside executeProviderSetup.
    const userSignedActions = await Promise.all(
      required.userProviderSetup.map((step) =>
        perps.signProviderSetupAction('hyperliquid', userAddress, step)
      )
    )

    // 3. Submit the signed user setup and auto-sign any agent setup steps.
    await perps.executeProviderSetup({
      provider: 'hyperliquid',
      address: userAddress,
      required,
      userSignedActions,
    })
  }

  // 4. Place orders — the agent signs automatically, no wallet popups.
  const result = await perps.placeOrder({
    address: userAddress,
    provider: 'hyperliquid',
    asset: { assetId: 'BTC', market: 'hyperliquid' },
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    size: '0.1',
    price: '95000.00',
    leverage: 10,
  })
  console.log('Order result:', result)

  // 5. Cancel orders — also automatic.
  await perps.cancelOrders({
    address: userAddress,
    provider: 'hyperliquid',
    ids: ['order1', 'order2'],
  })
}

// Placeholder — replace with your wallet client (e.g. a viem WalletClient).
declare const walletClient: WalletClient<Transport, Chain, Account>

run()
