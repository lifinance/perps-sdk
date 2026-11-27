# Examples

These scripts show how to use the LI.FI Perps SDK. Each provider has its own folder. The root `pnpm check:types` type-checks every script against the workspace packages, so the scripts stay current with the SDK.

> **WARNING:** The wallet scripts sign on mainnet, and some of them move real funds. Hyperliquid has no testnet that the SDK can use. Read the comment at the top of a script before you run it.

## Prerequisites

- Node `>=26.13.0`. Node runs the TypeScript files directly, with no build step for the examples.
- pnpm `11`.
- For a wallet script: a wallet private key. Some scripts also need an existing account or funds. The tables below give the requirements of each script.

Install the dependencies and build the packages from the repository root:

```bash
pnpm install
pnpm build
```

## Run a script

Run each script from the repository root:

```bash
node examples/hyperliquid/01-market-data.ts
PRIVATE_KEY=0x... node examples/hyperliquid/03-onboarding.ts
```

## Environment variables

The scripts read all inputs from environment variables. No script contains a value that you must edit.

| Variable | Scripts | Description |
| --- | --- | --- |
| `PRIVATE_KEY` | Wallet scripts | The 0x-prefixed private key of the wallet. Required. |
| `ADDRESS` | `05`, `09` | The 0x-prefixed address of the account to read. Required. |
| `LIFI_API_KEY` | All | Your LI.FI API key. Optional. |
| `MARKET_ID` | Market and order scripts | The opaque `Market.id`. The default is `BTC`. |
| `STREAM_SECONDS` | `02`, `09` | The stream duration. The defaults are `15` and `30`. |
| `QUOTE_SIZE_USD` | `01` | The USD notional of the quote. The default is `1000`. |
| `DEPOSIT_AMOUNT` | `03`, `04` | The deposit amount in the source token. The default is `10`. |
| `DEPOSIT_TOKEN` | `03`, `04` | The source token on Arbitrum. The default is `USDC`. |
| `ORDER_NOTIONAL_USD` | `06`, `07`, `11` | The order notional. The default is 10% above the venue minimum. |
| `LIMIT_PRICE_RATIO` | `06` | The limit price as a fraction of the mark price. The default is `0.7`. |
| `LEVERAGE` | `07`, `11` | The leverage. The default is `2`. |
| `SLIPPAGE_PERCENT` | `07`, `11` | The market order slippage. The default is the provider default. |
| `TAKE_PROFIT_PERCENT`, `STOP_LOSS_PERCENT` | `07` | The return on margin, in percent, at which the TP and the SL trigger. The defaults are `50`. |
| `TWAP_NOTIONAL_USD`, `TWAP_DURATION_SECONDS` | `08` | The TWAP notional and duration. The defaults are `110` and `300`. |
| `WITHDRAW_AMOUNT` | `10` | The USDC withdrawal amount, fee included. The default is `2`. |
| `WITHDRAW_DESTINATION` | `10` | The address that receives the USDC on Arbitrum. The default is the wallet address. |
| `MARGIN_AMOUNT` | `11` | The USDC margin to add. The default is `1`. |
| `SEND_AMOUNT` | `12` | The USDC amount to send. The default is `1`. |

## Conventions

All provider folders use these rules:

- Each script is self-contained. It imports only published packages (`@lifi/perps-sdk`, the provider packages, `viem`, `@lifi/sdk`, and `@lifi/sdk-provider-ethereum`) and Node built-ins. No script imports another script.
- Each script starts with a comment that gives its purpose and its requirements: a wallet, an existing account, or funds.
- Each script that signs on mainnet or moves funds starts with a WARNING comment.
- Each order script uses an order near the smallest notional that the venue accepts. It calculates the size with `calculateOrderAmounts`, which snaps the size onto the lot grid.
- The provider folders use the same file names for the same capability.

> **WARNING:** `.perps-storage.json` holds the trading key in plaintext. Do not commit it or share it. Delete it when you are done.

## Hyperliquid

Run `03-onboarding.ts` before the trading scripts. It accepts the terms, makes the first deposit when no account exists, and approves the agent.

| File | Purpose | Funds |
| --- | --- | --- |
| [`01-market-data.ts`](./hyperliquid/01-market-data.ts) | Providers, markets, the orderbook, candles, funding history, and a quote. | None. No wallet. |
| [`02-market-stream.ts`](./hyperliquid/02-market-stream.ts) | The public WebSocket channels `marketContext`, `orderbook`, `trades`, and `candle`. | None. No wallet. |
| [`03-onboarding.ts`](./hyperliquid/03-onboarding.ts) | Terms, the first deposit, and the setup loop until the account is ready. | USDC and ETH gas on Arbitrum for a new account. |
| [`04-deposit.ts`](./hyperliquid/04-deposit.ts) | A deposit to an existing account through `@lifi/sdk`. | USDC and ETH gas on Arbitrum. |
| [`05-account-data.ts`](./hyperliquid/05-account-data.ts) | Account reads and the code of a `PerpsError`. | None. An existing account. |
| [`06-limit-order.ts`](./hyperliquid/06-limit-order.ts) | A post-only limit order far from the mark price: place, read, modify, and cancel. | Margin for the smallest order. The order does not fill. |
| [`07-position-lifecycle.ts`](./hyperliquid/07-position-lifecycle.ts) | A leverage update, a market position with TP/SL, and a reduce-only close. | Margin for the smallest order, plus fees. |
| [`08-twap-order.ts`](./hyperliquid/08-twap-order.ts) | A TWAP order, then its cancel. | Margin for a 100 USD TWAP. A slice can fill. |
| [`09-account-stream.ts`](./hyperliquid/09-account-stream.ts) | The account channels `orderUpdates`, `fills`, `positions`, `accountSummary`, and `availableToTrade`. | None. An existing account. |
| [`10-withdraw.ts`](./hyperliquid/10-withdraw.ts) | The withdrawable balances, then a USDC withdrawal to Arbitrum. | Withdrawable USDC above the 1 USDC fee. |
| [`11-isolated-margin.ts`](./hyperliquid/11-isolated-margin.ts) | An isolated position, `updatePositionMargin`, and a close. | Margin for the smallest order and the added margin, plus fees. |
| [`12-send-asset.ts`](./hyperliquid/12-send-asset.ts) | `sendAsset` from perps to spot and back. | Transferable USDC. |
| [`13-revoke-agent.ts`](./hyperliquid/13-revoke-agent.ts) | The revoke of the session agent. | None. An approved agent. |
