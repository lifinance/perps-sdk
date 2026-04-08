import {
  ActionType,
  createAction,
  createPerpsClient,
  executeAction,
  OrderSide,
  OrderType,
  TimeInForce,
} from '@lifi/perps-sdk'

async function run() {
  const client = createPerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
  })

  // Create order payloads
  const { actions } = await createAction(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    action: ActionType.PLACE_ORDER,
    params: {
      asset: { assetId: 'BTC', market: 'hyperliquid' },
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.1',
      price: '94000.00',
      leverage: 10,
      timeInForce: TimeInForce.GTC,
    },
  })

  // Sign each action with the user's wallet
  const signedActions = await Promise.all(
    actions.map(async (a) => ({
      action: a.action,
      typedData: a.typedData,
      signature: await walletClient.signTypedData(a.typedData),
    }))
  )

  // Submit the signed order
  const result = await executeAction(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    action: ActionType.PLACE_ORDER,
    actions: signedActions,
  })
  console.log('Order result:', result)

  // Cancel orders
  const { actions: cancelActions } = await createAction(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    action: ActionType.CANCEL_ORDER,
    params: {
      ids: ['order1', 'order2'],
    },
  })

  const signedCancelActions = await Promise.all(
    cancelActions.map(async (a) => ({
      action: a.action,
      typedData: a.typedData,
      signature: await walletClient.signTypedData(a.typedData),
    }))
  )

  const cancelResult = await executeAction(client, {
    provider: 'hyperliquid',
    address: '0x1234...',
    action: ActionType.CANCEL_ORDER,
    actions: signedCancelActions,
  })
  console.log('Cancel result:', cancelResult)
}

// Placeholder — replace with your wallet client (e.g. viem WalletClient)
declare const walletClient: {
  signTypedData: (data: unknown) => Promise<string>
}

run()
