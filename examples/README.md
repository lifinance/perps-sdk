# Examples

These type-checked TypeScript examples show the smallest useful flow for each SDK capability. Each example stands alone.

Use the sample values in the `settings` block as a reference. Adapt the market IDs, prices, and amounts to your application. Wallet examples read only `PRIVATE_KEY` from the environment. Keep any local `.env` file out of version control.

The SDK supports mainnet only for all providers. Hyperliquid offers a testnet, but the SDK does not support it. The wallet examples submit real actions when you supply a key and execute them.

The agent examples use `LocalJSONFileAdapter` from `@lifi/perps-sdk/node`. It stores agent credentials in an ignored plaintext JSON file. Use protected credential storage in production.

## Hyperliquid

| Example | What it shows |
| --- | --- |
| [Market data](./hyperliquid/01-market-data.ts) | Read providers, markets, an order book, candles, funding history, and a quote. |
| [Market stream](./hyperliquid/02-market-stream.ts) | Subscribe to market context, order books, trades, and candles. |
| [Onboarding](./hyperliquid/03-onboarding.ts) | Accept terms and complete provider setup. A new account needs its first deposit before setup can continue. |
| [Deposit](./hyperliquid/04-deposit.ts) | Use the destination from `getDepositFlow` to deposit Arbitrum USDC through LI.FI. The wallet needs ETH for gas. |
| [Account data](./hyperliquid/05-account-data.ts) | Read account state, positions, orders, fills, activity, portfolio history, and market settings. |
| [Limit order](./hyperliquid/06-limit-order.ts) | Place a post-only order, then read, modify, and cancel it. Use a buy price below the best ask. |
| [Position lifecycle](./hyperliquid/07-position-lifecycle.ts) | Open a position with leverage, take-profit, and stop-loss. Close it with a reduce-only order. Start with no position in that market. |
| [TWAP order](./hyperliquid/08-twap-order.ts) | Place and cancel a TWAP order. The venue can fill a slice before the cancel. |
| [Account stream](./hyperliquid/09-account-stream.ts) | Subscribe to orders, fills, positions, the account summary, and the amount available to trade. |
| [Withdrawal](./hyperliquid/10-withdraw.ts) | Read withdrawable balances and withdraw USDC to the wallet on Arbitrum. |
| [Isolated margin](./hyperliquid/11-isolated-margin.ts) | Add margin to an existing isolated position. |
| [Asset transfer](./hyperliquid/12-send-asset.ts) | Transfer USDC from perps to spot on an account with separate balances. |
| [Agent revoke](./hyperliquid/13-revoke-agent.ts) | Revoke the approved agent. |
| [Error management and troubleshooting](./hyperliquid/14-error-management-troubleshooting.ts) | Read a thrown `PerpsError` code. See the recovery table below for write results and stream failures. |

### Common failures

| Failure | What to do |
| --- | --- |
| `TermsNotAccepted` | Accept the current terms in the onboarding flow. |
| `AccountNotFound` | Check the wallet address. For a new account, check that Hyperliquid credited the first deposit before you continue setup. |
| `SetupRequired` or `AgentUnauthorized` | Check that the wallet and agent store match. Check the setup steps and complete any pending approval. |
| `InsufficientMargin` or `InsufficientBalance` | Check the amount available to trade or withdraw. Reduce the amount or add funds. |
| `ValidationError` or venue rejection for price or size | Check the market ID, the minimum notional, and the venue price and size increments. |
| `RateLimitExceeded` | Wait for the rate limit to reset before you repeat a read. |
| A write returns `Failed` | Read `result.errorCode` and `result.error`. Correct the cause before you send the action again. |
| A write returns `Indeterminate`, or throws after submission | Read the account state before you retry. If a `PerpsExecutionError` contains known results, check `error.response.results`. |
| A stream fails | Catch initial `subscribe` errors. Pass `onError` for errors after registration. Restore rejected credentials before you subscribe again. |
