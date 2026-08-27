# @lifi/perps-sdk

## 10.0.1

### Patch Changes

- [#392](https://github.com/lifinance/perps-sdk/pull/392) [`eec96d1`](https://github.com/lifinance/perps-sdk/commit/eec96d125500b68356c30bf74ba2c7df0707a957) Thanks [@chybisov](https://github.com/chybisov)! - Bump `@lifi/types` from `17.86.0` to `^18.3.0`.

  The dependency also moves from an exact pin to a caret range. The exact pin was the
  reason downstream consumers installed a duplicate copy of `@lifi/types`: `@lifi/sdk`
  declares its own exact pin, so two exact pins on different versions can never
  deduplicate. A caret range on both sides lets the package manager resolve a single
  shared `18.x` copy, and it removes the requirement that `@lifi/perps-sdk` and
  `@lifi/sdk` bump `@lifi/types` in lockstep forever. The duplicate disappears once
  `@lifi/sdk` also moves to a caret range; until then consumers of both packages still
  resolve two copies.

  `18.3.0` adds two optional request fields (`gasless?: boolean`) and changes nothing
  else in the type surface. `ChainId` and `GasRecommendationResponse`, the only parts
  of `@lifi/types` this package uses, are unchanged.

## 10.0.0

### Major Changes

- [#379](https://github.com/lifinance/perps-sdk/pull/379) [`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LiquidationActivity.liquidatedPositions` is now a non-empty tuple type, so a producer that builds one from an empty array no longer compiles. A consumer that reads `liquidatedPositions[0]` receives a `LiquidatedPosition` without a null guard.

### Patch Changes

- [#380](https://github.com/lifinance/perps-sdk/pull/380) [`ea6fb8e`](https://github.com/lifinance/perps-sdk/commit/ea6fb8ec221487773744c349e8b469cdba1f9498) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Move the shared activity-paging logic (merge, filter, sort, slice, cursor mint) out of the Lighter and Ondo providers into one helper in @lifi/perps-sdk.

- Updated dependencies [[`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5)]:
  - @lifi/perps-types@11.0.0

## 9.0.0

### Major Changes

- [#360](https://github.com/lifinance/perps-sdk/pull/360) [`16f46bd`](https://github.com/lifinance/perps-sdk/commit/16f46bdf0b18b3169563a34a39624c2cab15e5df) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - **Breaking:** `OpenOrder.size` is removed. `OpenOrder` now carries `originalSize` (the quantity the order was submitted for) and `remainingSize` (the quantity still resting on the book), matching the names `Order` already uses. The old `size` field held the remaining quantity on Hyperliquid and the original quantity on Lighter, so `filledSize / size` returned a wrong fill fraction on one of the two. Replace a read of `size` with `remainingSize` for the resting quantity, or with `originalSize` for the submitted quantity. `expectedRealizedPnlForOpenOrder` now projects `remainingSize`, which corrects its result for a partially filled Lighter order. `expectedRealizedPnlForOpenOrder` returns `null` when `remainingSize` is zero, because nothing is left to fill; the zero-means-close-the-whole-position convention stays on the trigger-order path. The Ondo provider normalizes `originalSize` through `big.js`, so an unfilled Ondo order reports the same string on both sizes.

- [#362](https://github.com/lifinance/perps-sdk/pull/362) [`20acc5e`](https://github.com/lifinance/perps-sdk/commit/20acc5ef95f2343ffb13369444134c4325a80f8d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Normalize ledger and liquidation activity across providers.

  Breaking changes to the public activity contract:

  - `DepositActivity` and `WithdrawalActivity` gain a required `asset` field, so a
    consumer no longer hard-codes USDC. The Lighter Robinhood deployment reports
    USDG.
  - `WithdrawalActivity.fee` is optional. Lighter no longer reports a fabricated
    `'0'` fee.
  - `LiquidationActivity.liquidatedNotionalPosition`, `accountValue`, and
    `LiquidatedPosition.size` are optional. A provider omits a metric the venue
    does not report instead of sending `'0'`, which reads as a real zero.
  - `LiquidationActivity.liquidatedPositions` is never empty. A provider drops a
    liquidation record whose positions it cannot identify.

  Behaviour changes:

  - `TransferActivity` covers movements between two distinct accounts only. Every
    adapter excludes a same-account route or margin-location move.
  - `getActivity` fetches only the reference data a requested activity type needs,
    so a ledger-only request no longer pulls the market list.
  - A composite activity cursor applies the request type filter to its replayed
    rows, so paging two type filters independently never leaks or duplicates rows.

- [#365](https://github.com/lifinance/perps-sdk/pull/365) [`cbbc415`](https://github.com/lifinance/perps-sdk/commit/cbbc415c35863f5ce9cd407236b1c743b9d54ac1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LiquidationActivity.leverageType` is now optional, and the Lighter provider no longer sets it. Lighter reports a venue liquidation type on a liquidation row and no margin mode, so the previous mapping put a value from the wrong domain into the field. Hyperliquid and Ondo keep reporting their own `cross` / `isolated` values; a consumer that reads `leverageType` must now handle `undefined`.

- [#383](https://github.com/lifinance/perps-sdk/pull/383) [`c1f0c63`](https://github.com/lifinance/perps-sdk/commit/c1f0c6380879909094f8e05067c90005534a46b3) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Express a fill fee and a transfer fee in the asset the venue charged it in.

  Breaking changes to the public account and activity contract:

  - `Fill.fee` changes from a decimal string to `{ amount, asset }`. A consumer
    that read `fee` as a string reads `fee.amount` instead, and must format it
    against `fee.asset` rather than against the market's quote asset. Hyperliquid
    charges a fill fee in a token that is not always the quote asset.
  - `TransferActivity` gains `fees`, a list of `{ amount, asset }` entries. A
    venue can charge more than one fee for one transfer, each in a different
    asset. The Hyperliquid `spotTransfer` and `sendAsset` mapper no longer puts
    `fee`, `nativeTokenFee`, or `feeToken` in the opaque `meta` record. A consumer
    that read `meta.fee` reads `fees` instead.
  - The fee shape is now named `Fee` and covers a fill fee, a transfer fee, and a
    withdrawal fee. It carries the same two members as before under the new name.
    `WithdrawalActivity.fee` is now typed as `Fee`. The `WithdrawalFee` name is
    gone: `import type { WithdrawalFee }` no longer compiles, so replace it with
    `Fee` at every import site.
  - `@lifi/perps-sdk` re-exports `@lifi/perps-types`, so it carries the same
    breaking type change to its own consumers.

  Provider behaviour:

  - Hyperliquid reads `feeToken` from a `userFills` row and reports it as
    `fee.asset`. A row without `feeToken` falls back to the market's quote asset.
  - Hyperliquid reports the `spotTransfer` fee in `USDC` and the accompanying
    `nativeTokenFee` in `HYPE`. It reports the `sendAsset` fee in the delta's own
    `feeToken` and the accompanying `nativeTokenFee` in `HYPE`.
  - Lighter and Ondo report the fill fee in the market's quote asset, which is
    what both venues charge. The reported amount does not change.

### Patch Changes

- Updated dependencies [[`16f46bd`](https://github.com/lifinance/perps-sdk/commit/16f46bdf0b18b3169563a34a39624c2cab15e5df), [`20acc5e`](https://github.com/lifinance/perps-sdk/commit/20acc5ef95f2343ffb13369444134c4325a80f8d), [`680a1c7`](https://github.com/lifinance/perps-sdk/commit/680a1c7cb652bf08a884dfcb74e4e0a3e4d7b422), [`cbbc415`](https://github.com/lifinance/perps-sdk/commit/cbbc415c35863f5ce9cd407236b1c743b9d54ac1), [`8b92692`](https://github.com/lifinance/perps-sdk/commit/8b92692193c1907313b12f4921954133711a4880), [`c1f0c63`](https://github.com/lifinance/perps-sdk/commit/c1f0c6380879909094f8e05067c90005534a46b3)]:
  - @lifi/perps-types@10.0.0

## 8.0.0

### Major Changes

- [#361](https://github.com/lifinance/perps-sdk/pull/361) [`54330e9`](https://github.com/lifinance/perps-sdk/commit/54330e9839acf9e805b13b14adc921c4b3287469) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Carry accrued funding on `Position`.

  `Position` gains a required `accruedFunding` string. It reports the funding the
  position accrued since it opened, in quote-currency units. A positive value means
  the account received funding. A negative value means the account paid it. Every
  venue resets the value when the position returns to flat.

  `HlPosition` gains a required `cumFunding` object, which the Hyperliquid
  `clearinghouseState` and `webData2` payloads always send. Hyperliquid signs
  `cumFunding` as funding paid, so the Hyperliquid mapper negates
  `cumFunding.sinceOpen`. Lighter `total_funding_paid_out` and Ondo
  `netFundingSinceNeutral` already use the account point of view, so those mappers
  pass the value through.

### Patch Changes

- Updated dependencies [[`54330e9`](https://github.com/lifinance/perps-sdk/commit/54330e9839acf9e805b13b14adc921c4b3287469)]:
  - @lifi/perps-types@9.0.0

## 7.0.1

### Patch Changes

- Updated dependencies [[`02b7dfd`](https://github.com/lifinance/perps-sdk/commit/02b7dfdd689fcc598232ca4f28921e788234a230)]:
  - @lifi/perps-types@8.0.0

## 7.0.0

### Major Changes

- [#351](https://github.com/lifinance/perps-sdk/pull/351) [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the provider-voting surface: the `ActionType.META_VOTE` action, the vote types (`VoteDirection`, `VoteType`, `VoteParams`, `VoteMessage`, `voteTypeFields`, `VoteTypedData`), and the `Provider.upVotes` and `Provider.downVotes` fields. `META_PROVIDER` and `MetaProvider` move to a new `metaProvider` module and keep the same names, values, and root export. `@lifi/perps-sdk` re-exports `@lifi/perps-types` from its root, so the removed symbols leave its published surface too.

### Minor Changes

- [#345](https://github.com/lifinance/perps-sdk/pull/345) [`106b3cd`](https://github.com/lifinance/perps-sdk/commit/106b3cdf4523c02c4add4b1342377712b9359e38) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `integrator` is now optional in the perps client configuration. The SDK sends `x-lifi-integrator` only when you set both `apiKey` and `integrator`, and a client without an API key sends neither identity header and receives the backend's default fee identity.

  `PerpsBaseConfig.integrator`, which `client.config` exposes, is now `string | undefined`. Read it with an optional type. A strict TypeScript consumer that assigns `client.config.integrator` to a `string` must narrow the value first.

  `apiKey` and `integrator` are trimmed at construction. A whitespace-only value becomes absent, so the SDK never sends a placeholder identity header.

### Patch Changes

- [#343](https://github.com/lifinance/perps-sdk/pull/343) [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Bump viem to 2.55.18 to resolve the vulnerable ws@8.18.3 transitive dependency.

- Updated dependencies [[`130c9bd`](https://github.com/lifinance/perps-sdk/commit/130c9bd18f522205273ab1a8ba2565391d75ff19), [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93)]:
  - @lifi/perps-types@7.0.0

## 6.6.0

### Minor Changes

- [#338](https://github.com/lifinance/perps-sdk/pull/338) [`356835f`](https://github.com/lifinance/perps-sdk/commit/356835ff302f4700952404ccffa714b065ce95da) Thanks [@TristanNcl](https://github.com/TristanNcl)! - `getOrderbook` accepts an optional `priceStep` — the desired price-bucket size in quote units, forwarded to the backend so venues that cap their raw book at a few levels (Hyperliquid) can aggregate server-side.

## 6.5.1

### Patch Changes

- Updated dependencies [[`6b2d8f5`](https://github.com/lifinance/perps-sdk/commit/6b2d8f5eea6afab6adae20da836d2cb0d3d8e51e), [`0a4b5eb`](https://github.com/lifinance/perps-sdk/commit/0a4b5eb0ef2cc01b1f4c30a0c6f7389227ed6c2d)]:
  - @lifi/perps-types@6.0.0

## 6.5.0

### Minor Changes

- [#322](https://github.com/lifinance/perps-sdk/pull/322) [`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP action wrappers, preserve provider TWAP identifiers, sign Lighter TWAP actions, and read running TWAP parents directly from each venue.

### Patch Changes

- [#324](https://github.com/lifinance/perps-sdk/pull/324) [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add PerpsErrorCode.SetupRequired (2070) for accounts that exist but need a recoverable provider setup action completed before the requested operation can be retried. `executeProviderSetupAction` and `executeProviderOption` now throw under the failing result's `errorCode` when the backend classified the failure, falling back to `ExchangeRejected` when it did not.

- Updated dependencies [[`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852), [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea)]:
  - @lifi/perps-types@5.3.0

## 6.4.0

### Minor Changes

- [#320](https://github.com/lifinance/perps-sdk/pull/320) [`2277d7e`](https://github.com/lifinance/perps-sdk/commit/2277d7effe2ea2492772f56cdf49aeed1eb2ea90) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP order action types and params model (ORD-1160)

  - `ActionType.PLACE_TWAP_ORDER` (`placeTwapOrder`) and `ActionType.CANCEL_TWAP_ORDER` (`cancelTwapOrder`) with `ActionParamsMap` entries, so `CreateActionRequest` / `ExecuteActionRequest` cover TWAP.
  - `PlaceTwapOrderParams` with a provider-independent core (`market`, `side`, `size`, `durationSeconds`, `reduceOnly?`) plus capability-declared extras: `randomize?` (Hyperliquid) and `frequencySeconds?` / `minPrice?` / `maxPrice?` (Ondo).
  - `CancelTwapOrderParams` with a stringified provider-native `twapId`.
  - Read-side: `OrderType.TWAP`, `TwapOrderStatus` (RUNNING / COMPLETED / CANCELLED), and the `TwapOrder` running-TWAP read model.
  - `OrderType.TWAP` is excluded from the `type` field of `PlaceOrderParams` in both `@lifi/perps-types` and `@lifi/perps-sdk`: TWAP placement goes through `ActionType.PLACE_TWAP_ORDER`. The set of values accepted by `placeOrder` is unchanged.
  - `Param.type` widened to `'string' | 'boolean' | 'number'` so provider action descriptors can express the TWAP extras (boolean toggle with default, numeric interval with allowed values).

### Patch Changes

- Updated dependencies [[`2277d7e`](https://github.com/lifinance/perps-sdk/commit/2277d7effe2ea2492772f56cdf49aeed1eb2ea90)]:
  - @lifi/perps-types@5.2.0

## 6.3.0

### Minor Changes

- [#314](https://github.com/lifinance/perps-sdk/pull/314) [`ab7b307`](https://github.com/lifinance/perps-sdk/commit/ab7b307fcca34b443fcb305da6fa1b3ef916e1c1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter withdrawals now sign the caller's `(asset, route)` selection instead of a fixed USDC-out-of-perps default. `LtWithdrawWasmParams` requires `asset_index`, `route_type`, a decimal `amount` string, and the asset's `decimals`, `min_withdrawal_amount` and `symbol`; the signer rejects a route outside `{0, 1}` and any amount below the asset's minimum, and scales by that asset's own precision. `LtAccountAsset` now matches the live `/api/v1/account` payload (`margin_balance`, `multiplier`, and `margin_mode` as `'enabled' | 'disabled'`). New `PerpsClient.getWithdrawableBalances` lists the `(asset, route)` pairs an account can actually withdraw, and `Asset` carries the optional per-asset withdrawal metadata that read joins on.

### Patch Changes

- Updated dependencies [[`ab7b307`](https://github.com/lifinance/perps-sdk/commit/ab7b307fcca34b443fcb305da6fa1b3ef916e1c1)]:
  - @lifi/perps-types@5.1.0

## 6.2.1

### Patch Changes

- [#306](https://github.com/lifinance/perps-sdk/pull/306) [`2475f77`](https://github.com/lifinance/perps-sdk/commit/2475f77a005b04e19da5c91c19e39e859da9bf73) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix `src/version.ts` reporting a stale, hand-committed version (three majors behind `package.json`) instead of the package's real version. The generator (`scripts/version.js`) now also preserves the `name`/`version` `@public` doc comments it previously stripped, and `changeset:version` regenerates the file in lockstep with every version bump so the committed source, the shipped `src/**/*.ts` files, and the built `dist` output never drift again. The `x-lifi-perps-sdk` request header and any source-consumed build now report the correct SDK version.

- Updated dependencies [[`489cca0`](https://github.com/lifinance/perps-sdk/commit/489cca07a4bc5dc5f8eded7c43075e8bed596334)]:
  - @lifi/perps-types@5.0.0

## 6.2.0

### Minor Changes

- [#300](https://github.com/lifinance/perps-sdk/pull/300) [`2112c11`](https://github.com/lifinance/perps-sdk/commit/2112c1115e57324f2e1589472b72354217a891ea) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface the venue transaction behind a submitted action: a successful `ActionResult` now carries optional `txHash` and a fully-resolved `explorerLink`, so an integrator can link to the venue explorer straight after `executeAction` instead of waiting for the fill or activity row. The backend populates `txHash` only where the venue's canonical hash is known at submit time — Lighter, whose WASM signer computes it before the network call. Explorer resolution stays provider-owned through the new optional `PerpsProviderPlugin.resolveExplorerLink(txHash)` hook, which the Lighter plugin implements against its instance's `explorerTxBaseUrl`. Hyperliquid (hash assigned at block inclusion) and Ondo (offchain) implement no hook, so their results carry neither field — no placeholder links.

### Patch Changes

- Updated dependencies [[`2112c11`](https://github.com/lifinance/perps-sdk/commit/2112c1115e57324f2e1589472b72354217a891ea)]:
  - @lifi/perps-types@4.2.0

## 6.1.0

### Minor Changes

- [#299](https://github.com/lifinance/perps-sdk/pull/299) [`0f015d1`](https://github.com/lifinance/perps-sdk/commit/0f015d185ca2e785146383dbed63a5fff6796beb) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose `positionSupportsMarginAdjustment(position)` and `positionSupportsMarginRemoval(position)` as the stack's owned answer to whether an open position takes a margin adjustment, and in which direction. Clients gating an edit-margin affordance read these instead of inspecting `Position.marginMode` and `Position.market.positionMarginAdjustment` themselves, or calling `positionMarginConstraints` just to test its `undefined` return. `removableIsolatedMargin` and the Hyperliquid and Lighter `positionMarginConstraints` implementations now gate on the same predicates, so a client's affordance cannot diverge from what the venue accepts.

### Patch Changes

- Updated dependencies [[`0f015d1`](https://github.com/lifinance/perps-sdk/commit/0f015d185ca2e785146383dbed63a5fff6796beb)]:
  - @lifi/perps-types@4.1.0

## 6.0.0

### Major Changes

- [#290](https://github.com/lifinance/perps-sdk/pull/290) [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Model transfer-margin support and requirements as provider-owned contracts.

  `PerpsMarket` now declares whether position margin is unsupported, add-only, or add-and-remove. `Position` embeds that perpetual-market capability and the venue's exact current `initialMarginRequirement`, rather than forcing risk calculations through its display-oriented numeric `leverage`.

  Every provider plugin now implements `positionMarginConstraints(position)`. Hyperliquid supplies its documented `max(initial_margin_required, 0.1 * total_position_value)` retention rule and six-decimal amount increment; Lighter supplies its position's initial-margin requirement and six-decimal increment; Ondo returns `undefined` because it is cross-margined only.

  The shared `removableIsolatedMargin({ position, constraints })` helper validates the provider inputs, computes position equity in exact decimal arithmetic, retains the stricter initial-margin or notional-floor requirement, and rounds removable margin down to the venue amount increment.

  The previous `removableMargin(position)` exports are removed from the core SDK and provider packages. Callers must resolve the position's provider-owned constraints through `PerpsClient.positionMarginConstraints(position)` and pass them to `removableIsolatedMargin`.

### Minor Changes

- [#284](https://github.com/lifinance/perps-sdk/pull/284) [`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1) Thanks [@TristanNcl](https://github.com/TristanNcl)! - add getMarketSettings: the user's venue-side margin mode and leverage per market (Hyperliquid via activeAssetData, Lighter via the account position row)

### Patch Changes

- [#284](https://github.com/lifinance/perps-sdk/pull/284) [`4e9daa7`](https://github.com/lifinance/perps-sdk/commit/4e9daa7d3785a137a88160fc38d474011d5096d9) Thanks [@TristanNcl](https://github.com/TristanNcl)! - expose marginMode on PlaceOrderParams — the backends already apply it (Lighter on the order tx, Hyperliquid via the prepended leverage update), but the client type never carried it, so orders silently fell to the cross default

- Updated dependencies [[`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1), [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca)]:
  - @lifi/perps-types@4.0.0

## 5.0.0

### Major Changes

- [#287](https://github.com/lifinance/perps-sdk/pull/287) [`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Declare the deposit assets each venue is funded in and discover a venue's deposit flow from the SDK.

  `ETHEREUM_USDC`, `ETHEREUM_NATIVE_GAS`, `HYPERLIQUID_USDC`, `LIGHTER_USDC`, `ROBINHOOD_USDG`, and `ROBINHOOD_NATIVE_GAS` carry the chain, checksummed address, and decimals of every token a deposit can target, so clients no longer assemble them by hand.

  `PerpsClient.getDepositFlow({ provider, address })` resolves what a deposit into that provider requires for that address, as a discriminated union: `lifiSwap` (a single route into the venue's collateral, with `toAddress` when the venue credits a provisioned address), `firstDepositPipeline` (an account-opening deposit that also seeds native gas), or `setupRequired` (the setup actions to run first). It delegates to an optional `getDepositFlow` on the provider plugin and resolves `undefined` for a provider that does not implement it. Hyperliquid reports its venue-chain USDC swap, both Lighter instances resolve against whether the account exists, and Ondo reports its provisioned deposit address or the login / deposit-address gate.

  `getGasRecommendation(client, { chainId })` reads LI.FI's gas suggestion for a chain directly from the user's client, for seeding the gas leg of a first-deposit pipeline.

  BREAKING: removes `DepositProviderKey`, `LIFI_DEPOSIT_CHAIN_BY_PROVIDER`, and `lifiDepositChainForProvider`. Resolve a provider's deposit target with `getDepositFlow` instead.

### Patch Changes

- Updated dependencies [[`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2)]:
  - @lifi/perps-types@3.3.2

## 4.4.2

### Patch Changes

- [#285](https://github.com/lifinance/perps-sdk/pull/285) [`2ffa07e`](https://github.com/lifinance/perps-sdk/commit/2ffa07e50db81625c1d9a0fa85e1fcbae8bde149) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Map the Lighter Robinhood instance to LI.FI's Robinhood Chain deposit target.

## 4.4.1

### Patch Changes

- [#280](https://github.com/lifinance/perps-sdk/pull/280) [`8151264`](https://github.com/lifinance/perps-sdk/commit/81512644e330921504192b149faf77a3f21a8610) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Keep unknown reference-data warnings deduplicated across registry syncs so repeated account refreshes do not replay persistent unsupported IDs.

## 4.4.0

### Minor Changes

- [#277](https://github.com/lifinance/perps-sdk/pull/277) [`448312a`](https://github.com/lifinance/perps-sdk/commit/448312a4a3521b30bdd97bef5068f5bd8ff33d71) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose exact-decimal `scaleToInteger` from the generic SDK and remove the Lighter-specific export.

## 4.3.1

### Patch Changes

- [#275](https://github.com/lifinance/perps-sdk/pull/275) [`882c3e3`](https://github.com/lifinance/perps-sdk/commit/882c3e335c053512892779b90dbc424dfeaf4f2d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Retain delisted Hyperliquid markets for historical account data while excluding them from live market and trading flows.

- Updated dependencies [[`882c3e3`](https://github.com/lifinance/perps-sdk/commit/882c3e335c053512892779b90dbc424dfeaf4f2d)]:
  - @lifi/perps-types@3.3.1

## 4.3.0

### Minor Changes

- [#263](https://github.com/lifinance/perps-sdk/pull/263) [`b988876`](https://github.com/lifinance/perps-sdk/commit/b9888768be56fc84f6f2e0c8fc32118a11cbfa59) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add `selectUserSetupActions`, which filters a provider's `setup` descriptors to those a user must satisfy (their `signers` include `USER`). Steps the SDK signs on its own are held back so onboarding lists render one card per user action instead of inert placeholders for steps `checkSetup` completes inline.

### Patch Changes

- Updated dependencies [[`73fcc51`](https://github.com/lifinance/perps-sdk/commit/73fcc51a843d9294d98c6e0228ea98ba28cf0a5f)]:
  - @lifi/perps-types@3.2.0

## 4.2.0

### Minor Changes

- [#252](https://github.com/lifinance/perps-sdk/pull/252) [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - count HYPE and BTC as portfolio-margin collateral at their loan-to-value weight when computing available margin

### Patch Changes

- Updated dependencies [[`128ad0c`](https://github.com/lifinance/perps-sdk/commit/128ad0cf2ea7a862ad5626eb16b2b9aa8750ecc0), [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6)]:
  - @lifi/perps-types@3.1.0

## 4.1.0

### Minor Changes

- [#260](https://github.com/lifinance/perps-sdk/pull/260) [`09cd2b6`](https://github.com/lifinance/perps-sdk/commit/09cd2b6bbe2061afc1903d3ac622722500f1fd92) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Provider packages can now declare setup actions they complete themselves via `PerpsProviderPlugin.internalSetupActions`. `PerpsClient.checkSetup` drains each such pending step in place — building, signing, and executing it with the provider's own credentials — and omits it from the returned setup list. A descriptor whose `signers` include `USER` is never treated as internal, and a failed internal step never blocks setup: it stays unsatisfied and is retried on a later `checkSetup`. The Ondo `SESSION` signing arm now executes backend-authored request-bearing steps with the stored session token.

## 4.0.0

### Major Changes

- [#258](https://github.com/lifinance/perps-sdk/pull/258) [`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `PerpsSigner` now has exactly two values: `USER` (the end-user's wallet must sign or consent — expect a wallet interaction) and `SDK` (the provider package completes signing with credentials it holds or creates, no user interaction). The previous `AGENT` and `API_KEY` values are removed; each provider package is the authority on what `SDK` means for its venue. The array shape of `signers` is unchanged.

### Minor Changes

- [#257](https://github.com/lifinance/perps-sdk/pull/257) [`e5df3a5`](https://github.com/lifinance/perps-sdk/commit/e5df3a5b712fa8c1f0ba55e7161318473de1c762) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Parametrize the Lighter provider by instance config so a single implementation can back multiple Lighter deployments. `lighterProvider()` and `lighterWsProvider()` now accept a `providerKey`, `restUrl`, `wsUrl`, and `explorerTxBaseUrl`, and `LighterSigner` accepts the signing chain id — each instance namespaces its own market/asset registries, retry policy, and auth-token caches. A bare `lighterProvider()` is unchanged (`type: 'lighter'`, mainnet URLs, chain id 304). Adds the `lighter-rh` (Robinhood chain) instance constants and the `lighterRhInstance()` factory, plus `explorerTxUrlFromBase` for resolving explorer links from a per-instance base URL.

### Patch Changes

- Updated dependencies [[`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0)]:
  - @lifi/perps-types@3.0.0

## 3.1.1

### Patch Changes

- [#246](https://github.com/lifinance/perps-sdk/pull/246) [`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Polish package READMEs: consistent badge headers and structure, quick-start snippets, and a WebSocket section in the core README.

- Updated dependencies [[`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b)]:
  - @lifi/perps-types@2.0.1

## 3.1.0

### Minor Changes

- [#250](https://github.com/lifinance/perps-sdk/pull/250) [`195d3b4`](https://github.com/lifinance/perps-sdk/commit/195d3b492943dab672dcb2f2d692e29287208e80) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add `formatNumber`, a currency-symbol-free display formatter, and a `rounding: 'halfUp' | 'floor'` option on `FormatOptions` so ceiling-validated readouts (available balance, removable margin) can truncate toward zero.

## 3.0.0

### Major Changes

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Replace Ondo venue-side REST execution with API-key HMAC signing.

  - **perps-types**: remove `RestCallActionStep`, `RestCallSignedActionStep`, and `SigningMethod.AUTH_TOKEN`; add `SigningMethod.HMAC`, `HmacActionStep`, and `HmacSignedActionStep`. The step names its signing mechanism (like `Eip712ActionStep`/`WasmBlobActionStep`), not its transport. The signed step carries a structured `hmac { keyId, timestampMs, signature }` field — there is no `headers` map on the wire, so no venue header names (nor a Bearer JWT / API secret) can ride it. `request.body` is a pre-serialized string that transits verbatim (the exact bytes the HMAC covers).
  - **perps-sdk**: drop the `AUTH_TOKEN` execution detour and the `executeRestCallActions` plugin hook; `HMAC` steps sign then ride the standard `executeAction` path like EIP-712.
  - **perps-sdk-provider-ondo**: remove the venue-side REST execution model; add per-request HMAC-SHA256 signing (`hmacSignRequest`) with a client-held API key minted silently on first trading use, an `OndoApiKeyStore`, and first-login venue-terms acceptance. The JWT and API secret stay userland — only the HMAC key id, timestamp, and signature leave the client, and the backend builds the venue's transport headers at relay time.

### Minor Changes

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface Ondo venue-terms acceptance and API-key creation as explicit setup steps.

  - **perps-types**: add `ActionType.ACCEPT_PROVIDER_TERMS` (provider-level venue terms, distinct from the app-level `META_ACCEPT_TERMS`), `SigningMethod.SESSION` (client-only venue REST authorized by a stored provider session token), and `SessionActionStep` — a marker step carrying no request material, so a backend-authored path or body can never be executed with the client's bearer token. `OndoAccountConfig` gains required `termsAccepted` and `apiKeyRegistered` flags. The `ActionResult` failure variant gains an optional structured `errorCode`.
  - **perps-sdk**: new optional plugin hook `onExecuteResults(address, results)`, invoked after every `executeAction` round-trip on both the execute and provider-setup paths, so plugins can react to structured failures.
  - **perps-sdk-provider-ondo**: venue-terms acceptance moves out of the SIWE login (no more implicit `POST /v1/agreement` on first login) and API-key creation out of lazy first-use minting into explicit `SESSION`-signed setup steps executed directly against the venue; the lazy mint remains as a headless fallback. `getAccount` reports `termsAccepted` (from the login token's `newAccount` flag) and `apiKeyRegistered` (local key presence). A stored API key is evicted when an execute result carries `errorCode: Unauthorized`, so the `REGISTER_API_KEY` setup step re-stages instead of every action failing.
  - **perps-sdk-provider-lighter / -hyperliquid**: exhaustive `ActionType` projections extended for the new member (rejected as unsupported).

### Patch Changes

- Updated dependencies [[`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307), [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307)]:
  - @lifi/perps-types@2.0.0

## 2.4.0

### Minor Changes

- [#240](https://github.com/lifinance/perps-sdk/pull/240) [`7cb09a5`](https://github.com/lifinance/perps-sdk/commit/7cb09a53cf195089879b52eb7d84c0960da137b7) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Add an optional `onProgress` sink to `PerpsClient.execute()` (new public `SignActionProgress` type, carried on `SignActionsContext`). Lighter's `EVM_TX` signer emits `submitted`/`confirmed` per broadcast leg (approve, deposit), so consumers can render a live per-transaction deposit stepper.

## 2.3.2

### Patch Changes

- [#236](https://github.com/lifinance/perps-sdk/pull/236) [`f56c36e`](https://github.com/lifinance/perps-sdk/commit/f56c36e6e80edf305d05b7e09540d9a329af9b88) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add a release changeset so the Ondo provider cache-sync fix branch triggers versioning and publish workflows.

## 2.3.1

### Patch Changes

- [#232](https://github.com/lifinance/perps-sdk/pull/232) [`0a2472d`](https://github.com/lifinance/perps-sdk/commit/0a2472df592899019d7a0597a15c1d4986e0633e) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Document that `SendAssetParams.collateral` and `SendAssetActionParams.collateral` carry the canonical `Asset.id` of the asset being moved (for Hyperliquid spot assets, the token index as a string), never a display symbol.

- Updated dependencies [[`0a2472d`](https://github.com/lifinance/perps-sdk/commit/0a2472df592899019d7a0597a15c1d4986e0633e)]:
  - @lifi/perps-types@1.15.1

## 2.3.0

### Minor Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Execute rest-call action steps client-side for `authToken` providers: new optional `PerpsProviderPlugin.executeRestCallActions` hook owns the venue call and result mapping, and `PerpsClient.execute` routes `SigningMethod.AUTH_TOKEN` descriptors through it. Credential headers never transit the LI.FI backend — the follow-up `executeAction` submission is bookkeeping-only with `headers` stripped, and a bookkeeping failure does not mask a venue success.

### Patch Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the auth-token signing taxonomy for venues authenticated by a client-held credential (Ondo first): `SigningMethod.AUTH_TOKEN` / `SigningMethod.SIWE`, `ActionType.SIWE_LOGIN`, the `RestCallActionStep`/`RestCallSignedActionStep` and `SiweActionStep`/`SiweSignedActionStep` pairs, and `OndoAccountConfig` in the `AccountConfig` union. `LIFI_DEPOSIT_CHAIN_BY_PROVIDER` is now `Partial` — providers without a LI.FI deposit chain (ondo) have no entry.

- Updated dependencies [[`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521), [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521)]:
  - @lifi/perps-types@1.15.0

## 2.2.0

### Minor Changes

- [#229](https://github.com/lifinance/perps-sdk/pull/229) [`59d359f`](https://github.com/lifinance/perps-sdk/commit/59d359f7e633ad7fbaa76194eb15017de3122954) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Encrypt the default `localStorageAdapter` at rest: session secrets are now stored as AES-GCM-256 ciphertext in `localStorage`, keyed by a non-extractable WebCrypto key held in IndexedDB, degrading to no-op writes / null reads when browser crypto storage is unavailable.

## 2.1.0

### Minor Changes

- [#215](https://github.com/lifinance/perps-sdk/pull/215) [`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4) Thanks [@TristanNcl](https://github.com/TristanNcl)! - feat: add accountSummary WS channel and fix Lighter PnL double-counting (ORD-817)

### Patch Changes

- Updated dependencies [[`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4)]:
  - @lifi/perps-types@1.13.0

## 2.0.0

### Major Changes

- [#219](https://github.com/lifinance/perps-sdk/pull/219) [`a5e7e17`](https://github.com/lifinance/perps-sdk/commit/a5e7e170cdfbb494ea284c949d685738d29348d4) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - SDK now owns wallet chain-switching for USER-signed EIP-712 actions via a consumer-supplied `switchChain` hook (`PerpsClientOptions.switchChain` / `setSwitchChain`), invoked at the single signing choke point. Adds a `sendAsset()` convenience wrapper. BREAKING: `signProviderSetupAction` and `executeProviderSetup` are now private (`executeProviderSetupAction` is the sole public setup entry), and `ExecuteProviderSetupParams` / `ExecuteProviderSetupResult` are no longer exported.

### Minor Changes

- [#222](https://github.com/lifinance/perps-sdk/pull/222) [`13654ca`](https://github.com/lifinance/perps-sdk/commit/13654ca609282b8e5f97265ae5d4f8df98b70ff0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - SDK-owned per-leg wallet chain-switching now extends to `SigningMethod.EVM_TX` actions. `SignActionsContext` gains an optional bound `switchToChain(chainId)` that core populates from the consumer's `switchChain` hook, and Lighter's `EVM_TX` signer (deposit/approve/withdraw) switches the wallet to each leg's `txParams.chainId` before broadcasting. When no `switchChain` hook is configured (local/private-key signer) it retains the fail-loud wrong-chain guard rather than broadcasting on the wrong chain.

## 1.6.0

### Minor Changes

- [#213](https://github.com/lifinance/perps-sdk/pull/213) [`f669156`](https://github.com/lifinance/perps-sdk/commit/f669156731d7da41fe9b467adfaea95d35cb0464) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Execute Lighter's token-authenticated venue mutations (ACCOUNT_TYPE → /changeAccountTier, SET_REFERRAL → /referral/use) client-side via a direct Lighter POST, so the per-call auth token never transits the LI.FI backend. Tokens are minted per-call with a short (minutes) deadline and never persisted, and venue rule violations surface verbatim as PerpsError(ExchangeRejected). Core now tolerates actions that produce no backend-bound step: `signProviderSetupAction` returns `Promise<SignedActionStep | undefined>` (`undefined` when the plugin executed the action client-side), so callers collecting results into `SignedActionStep[]` must skip `undefined`.

### Patch Changes

- Updated dependencies [[`fecfa9b`](https://github.com/lifinance/perps-sdk/commit/fecfa9b3255b5f77a1b58b49d790500a61d56561)]:
  - @lifi/perps-types@1.11.0

## 1.5.6

### Patch Changes

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix WS resubscribe replay racing a concurrent subscribe: a channel subscribed while the reconnect replay loop is suspended is no longer sent twice. Replay now iterates a snapshot taken at replay start and re-checks the live registry before each send.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `getMarket` now throws a `MarketNotFound` `PerpsError` when the backend returns an empty markets list, instead of silently resolving `undefined` under a `Promise<Market>` type.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix `ReconnectingWebSocket.close()` never transitioning connection status to `disconnected`, which left `reconnect()` a no-op, `registerSub` sending into a dead socket, and new status listeners told `connected` after an explicit close.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix WS unsubscribe closures so double-invoking one (e.g. React StrictMode effect cleanup) no longer tears down a sibling subscription sharing the same channel.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the reference-data registry's lookup-miss refetch. A registry miss now warns once and returns `undefined`; the index is reconciled solely by `sync()` through the HTTP layer, which every REST call and each WS (re)connect already performs. The backend owns reference-data freshness (Valkey-cached, kept warm), so the client-side cache-bypassing refetch — and the cooldown and load-generation guards it required — added no freshness and are gone.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `walkOrderbook` (and `buildQuote`) now throw a `ValidationError` `PerpsError` when an orderbook level's price or size does not parse to a finite number, instead of silently propagating NaN into the quote and reporting `insufficientLiquidity: false`.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Count unrealized PnL toward available margin for `'gross'` collateral (Hyperliquid unified/portfolioMargin), matching the venue's buying-power accounting.

## 1.5.5

### Patch Changes

- [#167](https://github.com/lifinance/perps-sdk/pull/167) [`f7c77aa`](https://github.com/lifinance/perps-sdk/commit/f7c77aad84d81fbb2b9e9ac540298704f373af4b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Stop misclassifying aborted requests as retryable server errors: `fetchWithRetry` now rethrows `AbortError` immediately (no retry, no backoff sleep), backoff sleeps are signal-aware, and `request` no longer wraps a cancellation as a `ServerError`.

## 1.5.4

### Patch Changes

- [#161](https://github.com/lifinance/perps-sdk/pull/161) [`bfdfd6c`](https://github.com/lifinance/perps-sdk/commit/bfdfd6cf53b7e79ed035378ad2430a9ffdf03ab5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Streamed quotes from `subscribeQuote` now track the live market context (mark price and funding) instead of the snapshot taken at subscribe time, so price impact no longer drifts as the market moves.

## 1.5.3

### Patch Changes

- [#165](https://github.com/lifinance/perps-sdk/pull/165) [`e2da3cf`](https://github.com/lifinance/perps-sdk/commit/e2da3cf245ebe2f8b6adab24fa269cbef2f49f4f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Make `PerpsWsClient.close()` terminal: a subscription whose provider init is suspended mid-flight when `close()` runs now aborts instead of resurrecting a live auto-reconnecting socket, and `subscribe`/`subscribeQuote` calls after `close()` reject with a typed error.

- Updated dependencies [[`0390904`](https://github.com/lifinance/perps-sdk/commit/0390904489fdacee26af87dce33cbe960e8d8f4e)]:
  - @lifi/perps-types@1.6.0

## 1.5.2

### Patch Changes

- [#158](https://github.com/lifinance/perps-sdk/pull/158) [`ac4f00d`](https://github.com/lifinance/perps-sdk/commit/ac4f00d874fcaeb6fa93ffd9645781593658f75f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid account summaries double-counting locked margin and unrealized PnL: `accountValue` is total venue equity, so `availableMargin` now subtracts locked margin from it and `portfolioValue` no longer re-adds margin/PnL; `summarizeAccount` takes a `CollateralSemantics` (`'free' | 'gross' | 'equity'`) instead of the `collateralIsGross` boolean, and per-dex equity/margin now read `marginSummary` (whole account, isolated positions included) rather than the cross-only summary.

## 1.5.1

### Patch Changes

- [#156](https://github.com/lifinance/perps-sdk/pull/156) [`c4848fb`](https://github.com/lifinance/perps-sdk/commit/c4848fb38f13ae8e02ceccd29049b50af484cbae) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `getAccount` now returns the `positions` array it already computes, so consumers no longer need a second `getPositions` call (and its duplicate `clearinghouseState` fan-out) to obtain positions.

- Updated dependencies [[`c4848fb`](https://github.com/lifinance/perps-sdk/commit/c4848fb38f13ae8e02ceccd29049b50af484cbae)]:
  - @lifi/perps-types@1.5.1

## 1.5.0

### Minor Changes

- [#152](https://github.com/lifinance/perps-sdk/pull/152) [`14ee156`](https://github.com/lifinance/perps-sdk/commit/14ee156ce5529dd98148568ae6fcf3a1d86907c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Per-market_id streaming for Hyperliquid&Lighter

### Patch Changes

- Updated dependencies [[`14ee156`](https://github.com/lifinance/perps-sdk/commit/14ee156ce5529dd98148568ae6fcf3a1d86907c6)]:
  - @lifi/perps-types@1.5.0

## 1.4.0

### Minor Changes

- [#153](https://github.com/lifinance/perps-sdk/pull/153) [`91e3e01`](https://github.com/lifinance/perps-sdk/commit/91e3e01d1d5c1e1fdd5e883b81747b8e4e73591f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add a per-plugin `accountExists` capability and surface it on `checkSetup`, which now short-circuits with `{ accountExists: false, setup: [], isReady: false }` for unfunded accounts so consumers can gate the deposit-first flow.

## 1.3.0

### Minor Changes

- [#141](https://github.com/lifinance/perps-sdk/pull/141) [`906cce8`](https://github.com/lifinance/perps-sdk/commit/906cce8d610f90ff155fc1e830c28689e3a70411) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Added compressed pac, sac channel on hl

### Patch Changes

- Updated dependencies [[`906cce8`](https://github.com/lifinance/perps-sdk/commit/906cce8d610f90ff155fc1e830c28689e3a70411)]:
  - @lifi/perps-types@1.3.0

## 1.2.0

### Minor Changes

- [#140](https://github.com/lifinance/perps-sdk/pull/140) [`a2b6f9e`](https://github.com/lifinance/perps-sdk/commit/a2b6f9eaa88aa02c10b63c9f11ef1cd3f128fea8) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Add public trades subscription channel for Hyperliquid and Lighter; migrate Hyperliquid orderbook to the compact l2 feed.

### Patch Changes

- Updated dependencies [[`a2b6f9e`](https://github.com/lifinance/perps-sdk/commit/a2b6f9eaa88aa02c10b63c9f11ef1cd3f128fea8)]:
  - @lifi/perps-types@1.2.0

## 1.1.0

### Minor Changes

- [#135](https://github.com/lifinance/perps-sdk/pull/135) [`4e3977c`](https://github.com/lifinance/perps-sdk/commit/4e3977c33ac7f93a631899d1b270afb1499e7ea8) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Rename and extend the SDK's all-markets price surface into a market-context surface, and re-source it from the providers' all-markets context feeds so it carries oracle + mark + mid for every market.

### Patch Changes

- Updated dependencies [[`4e3977c`](https://github.com/lifinance/perps-sdk/commit/4e3977c33ac7f93a631899d1b270afb1499e7ea8)]:
  - @lifi/perps-types@1.1.0

## 1.0.1

### Patch Changes

- [#133](https://github.com/lifinance/perps-sdk/pull/133) [`32d357d`](https://github.com/lifinance/perps-sdk/commit/32d357d9965922c8179b83a309f4eab4df9aa627) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Standardize the package README

- Updated dependencies [[`32d357d`](https://github.com/lifinance/perps-sdk/commit/32d357d9965922c8179b83a309f4eab4df9aa627)]:
  - @lifi/perps-types@1.0.1

## 1.0.0

### Major Changes

- [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - First stable release of the LI.FI Perps SDK — a unified TypeScript interface for trading perpetuals across multiple DEXes. This release reshapes the SDK into a focused set of packages and finalizes the public API.

  **Packages**

  - `@lifi/perps-sdk` — core client (`PerpsClient`), service functions, and the realtime `PerpsWsClient`.
  - `@lifi/perps-sdk-provider-hyperliquid` and `@lifi/perps-sdk-provider-lighter` — per-DEX provider plugins registered on the client.
  - `@lifi/perps-types` — shared, zero-dependency types underpinning the whole stack.

  **Unified market model**

  - Markets, assets, and categories are modeled with an explicit collateral partition. A market is referenced by an opaque `marketId` / `MarketRef` rather than a display symbol, so the same code addresses any venue.
  - Market-structure reads (markets, assets, prices, OHLCV, orderbook) resolve through the LI.FI backend; per-user reads (account, positions, orders, fills, activity) go directly to the venue.

  **Provider plugin architecture**

  - A single `PerpsProvider` plugin SPI: register provider plugins on the client and route every call by provider key.
  - Descriptor-driven signing — each action declares its signing method (agent key, wallet EIP-712, or EVM transaction) and is dispatched automatically. One-time setup (`checkSetup` → `executeSetup`) provisions a per-user signing agent, after which orders need no wallet prompt.

  **Realtime**

  - `PerpsWsClient` with ref-counted subscription fan-out, automatic reconnect and replay, and schema-validated frames. Channels for prices, orderbook, candles, fills, order updates, positions, and spot balances, plus streaming quotes over the orderbook.

  **Quotes, order math, and formatting**

  - One-shot `getQuote` with a VWAP book-walk, position/order math helpers (liquidation distance, effective leverage, removable margin), and provider-correct price/size formatting and liquidation-price estimation.
  - Exact decimal handling of order-submission values via big.js, with canonical financial display formatters.

  **Resilience**

  - Retry transport with per-provider rate-limit policies and automatic nonce-refresh retries on execution.

  Additional client surfaces: `getMeta`, terms acceptance, governance vote counts, and token metadata.

### Minor Changes

- [#29](https://github.com/lifinance/perps-sdk/pull/29) [`c80a93b`](https://github.com/lifinance/perps-sdk/commit/c80a93b316dfc56072dc87617bf7a8b280cdcfd1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Unify the account-summary surface on a single `getAccountSummary` name. The provider-interface method, the `PerpsClient` method, and both providers' standalone exports (formerly `getPortfolioSummary`, `summarizeHyperliquidAccount`, and `summarizeLighterAccount`) are now all named `getAccountSummary`. The result type `AccountSummary` is unchanged. This is a rename only — no behavioural change.

### Patch Changes

- Updated dependencies [[`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c)]:
  - @lifi/perps-types@1.0.0
