import { OrderSide, OrderType, PerpsClient } from '@lifi/perps-sdk'

async function run() {
  const perps = new PerpsClient({ integrator: 'my-app' })
  const userAddress = '0x1234...' as const

  // 1. Set up agent signing (USER_AGENT mode)
  await perps.setSigningMode(userAddress, 'hyperliquid', 'USER_AGENT')

  // 2. Check which authorizations are needed
  const required = await perps.getRequiredAuthorizations({
    dex: 'hyperliquid',
    address: userAddress,
  })

  if (!required.isReady) {
    // 3. Build authorization payloads for the user to sign
    const { actions } = await perps.buildAuthorization({
      dex: 'hyperliquid',
      address: userAddress,
      authorizations: required.userAuthorizations,
    })

    // 4. User signs the authorizations with their wallet
    const signedActions = await Promise.all(
      actions.map(async (a) => ({
        action: a.action,
        typedData: a.typedData,
        signature: await walletClient.signTypedData(a.typedData),
      }))
    )

    // 5. Submit user-signed actions (+ auto-signs agent authorizations)
    await perps.executeAuthorizations({
      dex: 'hyperliquid',
      address: userAddress,
      required,
      userSignedActions: signedActions,
    })
  }

  // 6. Place orders — agent signs automatically, no wallet popups
  const result = await perps.placeOrder({
    address: userAddress,
    dex: 'hyperliquid',
    symbol: 'BTC',
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
    dex: 'hyperliquid',
    ids: ['order1', 'order2'],
  })
}

// Placeholder — replace with your wallet client (e.g. viem WalletClient)
declare const walletClient: {
  signTypedData: (data: unknown) => Promise<string>
}

run()
