import { OrderSide, OrderType, PerpsClient } from '@lifi/perps-sdk'

async function run() {
  const perps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
  })
  const userAddress = '0x1234...' as const

  // 1. Set up agent signing (USER_AGENT mode)
  await perps.setSigningMode(userAddress, 'hyperliquid', 'USER_AGENT')

  // 2. Check which setup gates are unsatisfied
  const required = await perps.checkSetup({
    provider: 'hyperliquid',
    address: userAddress,
  })

  if (!required.isReady) {
    // 3. Build setup payloads for the user to sign
    const { actions } = await perps.buildPrerequisites({
      provider: 'hyperliquid',
      address: userAddress,
    })

    // 4. User signs the setup steps with their wallet
    const signedActions = await Promise.all(
      actions.map(async (a) => ({
        action: a.action,
        typedData: a.typedData,
        signature: await walletClient.signTypedData(a.typedData),
      }))
    )

    // 5. Submit user-signed setup (+ auto-signs agent setup steps)
    await perps.satisfySetup({
      provider: 'hyperliquid',
      address: userAddress,
      required,
      userSignedActions: signedActions,
    })
  }

  // 6. Place orders — agent signs automatically, no wallet popups
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

  // 7. Cancel orders — also automatic
  await perps.cancelOrders({
    address: userAddress,
    provider: 'hyperliquid',
    ids: ['order1', 'order2'],
  })
}

// Placeholder — replace with your wallet client (e.g. viem WalletClient)
declare const walletClient: {
  signTypedData: (data: unknown) => Promise<string>
}

run()
