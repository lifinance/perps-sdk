# @lifi/perps-sdk-provider-hyperliquid

## 10.1.2

### Patch Changes

- [#411](https://github.com/lifinance/perps-sdk/pull/411) [`87328f4`](https://github.com/lifinance/perps-sdk/commit/87328f4a5acd6f4b035bd6a7d848eebc6b8deee0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Return complete Hyperliquid funding and ledger history when callers omit time bounds.

## 10.1.1

### Patch Changes

- [#406](https://github.com/lifinance/perps-sdk/pull/406) [`96cc05e`](https://github.com/lifinance/perps-sdk/commit/96cc05ef4ee6bceec72c5abb94ff79d896e45b07) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Project a `REVOKE_AGENT` setup descriptor to `values: []` instead of throwing.

- Updated dependencies [[`a29315c`](https://github.com/lifinance/perps-sdk/commit/a29315c27d7419246f9d7d7939314edb63cffef0), [`ff5f2bd`](https://github.com/lifinance/perps-sdk/commit/ff5f2bdb23d4ad92ea31c821baa3d6f585661b9b), [`ad734ee`](https://github.com/lifinance/perps-sdk/commit/ad734ee904a50c7c99abd489d25e819e7d9bc957)]:
  - @lifi/perps-types@11.3.0

## 10.1.0

### Minor Changes

- [#394](https://github.com/lifinance/perps-sdk/pull/394) [`41e447f`](https://github.com/lifinance/perps-sdk/commit/41e447f1acf0cd44ee03b6d92059dbfa2e8e4412) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Retain the Hyperliquid builder-fee amount and client order ID on `Fill`. `HlUserFill` now declares the optional `builderFee` and `cloid` fields `userFills` returns, and `mapFill` projects them into the new optional `Fill.builderFee` (a `Fee`, so the builder portion carries its own token — the same token Hyperliquid charges the total fee in) and `Fill.clientOrderId`. Each stays `undefined` when the wire payload omits it, so a consumer can separate the builder portion of a fill fee from the provider portion and join a fill back to the order that produced it. Adds `ActionType.SYNC_FEE_ATTRIBUTION` with wire value `syncFeeAttribution` and an empty params contract; it is never a `Provider.setup` or `Provider.options` descriptor, and each provider account-config mapper rejects it.

### Patch Changes

- Updated dependencies [[`41e447f`](https://github.com/lifinance/perps-sdk/commit/41e447f1acf0cd44ee03b6d92059dbfa2e8e4412)]:
  - @lifi/perps-types@11.1.0

## 10.0.0

### Major Changes

- [#379](https://github.com/lifinance/perps-sdk/pull/379) [`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LiquidationActivity.liquidatedPositions` is now a non-empty tuple type, so a producer that builds one from an empty array no longer compiles. A consumer that reads `liquidatedPositions[0]` receives a `LiquidatedPosition` without a null guard.

- [#377](https://github.com/lifinance/perps-sdk/pull/377) [`907e82f`](https://github.com/lifinance/perps-sdk/commit/907e82f0819a948258b932b74aa644d4f871b010) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Hyperliquid and Ondo `getActivity` now drop a funding or liquidation row whose market the backend market list does not hold, instead of rejecting the whole activity feed.

  Breaking for `@lifi/perps-sdk-provider-hyperliquid`: the exported `mapFundingActivity` now returns `FundingActivity | null` — it returns `null` for a row whose market the resolver cannot identify. A caller that assigns the result to a `FundingActivity` variable must handle `null`.

### Patch Changes

- [#378](https://github.com/lifinance/perps-sdk/pull/378) [`6b64fa5`](https://github.com/lifinance/perps-sdk/commit/6b64fa5492a81ce1a6e8aa91a3196bdce5f03406) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Hyperliquid and Ondo `getFills` now drop a fill row whose market the backend market list does not hold, instead of rejecting the whole fills page.

- Updated dependencies [[`ea6fb8e`](https://github.com/lifinance/perps-sdk/commit/ea6fb8ec221487773744c349e8b469cdba1f9498), [`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5)]:
  - @lifi/perps-sdk@10.0.0
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

- [#381](https://github.com/lifinance/perps-sdk/pull/381) [`8b92692`](https://github.com/lifinance/perps-sdk/commit/8b92692193c1907313b12f4921954133711a4880) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Express a withdrawal fee in the asset the venue charged it in.

  Breaking change to the public activity contract:

  - `WithdrawalActivity.fee` changes from a decimal string to the new
    `WithdrawalFee` shape, `{ amount, asset }`. A consumer that read `fee` as a
    string reads `fee.amount` instead, and must format it against `fee.asset`
    rather than against the withdrawal's own `asset`. A venue does not always
    charge the fee in the withdrawn asset.
  - Hyperliquid reports `fee.asset` as `USDC`, which stays the withdrawn asset,
    so the reported amount does not change.

  Behaviour change:

  - Ondo now reports the withdrawal fee it charges. `getActivity` maps `usdFee`
    from `/v1/wallet/withdrawals` onto `fee` with `asset: 'USD'`, so a BTC or ETH
    withdrawal reports its real fee instead of dropping it.

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

### Minor Changes

- [#372](https://github.com/lifinance/perps-sdk/pull/372) [`3c20c5d`](https://github.com/lifinance/perps-sdk/commit/3c20c5d9a35f43c1986bd3c94852e3c4b2ae43cb) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Route Hyperliquid WebSocket order updates and Ondo remaining-quantity derivation through the existing shared mappers instead of duplicated inline logic. Export the `HlOrderLike` order-payload union that the shared Hyperliquid mappers accept.

### Patch Changes

- [#376](https://github.com/lifinance/perps-sdk/pull/376) [`b42a141`](https://github.com/lifinance/perps-sdk/commit/b42a14197ad4394f8c166a8066f7bd945c95da3a) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Drop the token id suffix from the asset symbol on Hyperliquid transfer activity

- [#364](https://github.com/lifinance/perps-sdk/pull/364) [`680a1c7`](https://github.com/lifinance/perps-sdk/commit/680a1c7cb652bf08a884dfcb74e4e0a3e4d7b422) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Document the sign and units of `FundingActivity.amount` in TSDoc, and of the
  `HlFundingDelta.usdc` and `LtPositionFunding.change` wire fields that feed it.
- Updated dependencies [[`16f46bd`](https://github.com/lifinance/perps-sdk/commit/16f46bdf0b18b3169563a34a39624c2cab15e5df), [`20acc5e`](https://github.com/lifinance/perps-sdk/commit/20acc5ef95f2343ffb13369444134c4325a80f8d), [`680a1c7`](https://github.com/lifinance/perps-sdk/commit/680a1c7cb652bf08a884dfcb74e4e0a3e4d7b422), [`cbbc415`](https://github.com/lifinance/perps-sdk/commit/cbbc415c35863f5ce9cd407236b1c743b9d54ac1), [`8b92692`](https://github.com/lifinance/perps-sdk/commit/8b92692193c1907313b12f4921954133711a4880), [`c1f0c63`](https://github.com/lifinance/perps-sdk/commit/c1f0c6380879909094f8e05067c90005534a46b3)]:
  - @lifi/perps-types@10.0.0
  - @lifi/perps-sdk@9.0.0

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
  - @lifi/perps-sdk@8.0.0

## 7.0.1

### Patch Changes

- Updated dependencies [[`02b7dfd`](https://github.com/lifinance/perps-sdk/commit/02b7dfdd689fcc598232ca4f28921e788234a230)]:
  - @lifi/perps-types@8.0.0

## 7.0.0

### Patch Changes

- [#343](https://github.com/lifinance/perps-sdk/pull/343) [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Bump viem to 2.55.18 to resolve the vulnerable ws@8.18.3 transitive dependency.

- [#349](https://github.com/lifinance/perps-sdk/pull/349) [`3cff5fc`](https://github.com/lifinance/perps-sdk/commit/3cff5fccb593e7529de5e8e6423d01d9c28be9fc) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - The published `@example` blocks and READMEs no longer show the optional `integrator` field. The API key is the identity the backend resolves.

- [#351](https://github.com/lifinance/perps-sdk/pull/351) [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the provider-voting surface: the `ActionType.META_VOTE` action, the vote types (`VoteDirection`, `VoteType`, `VoteParams`, `VoteMessage`, `voteTypeFields`, `VoteTypedData`), and the `Provider.upVotes` and `Provider.downVotes` fields. `META_PROVIDER` and `MetaProvider` move to a new `metaProvider` module and keep the same names, values, and root export. `@lifi/perps-sdk` re-exports `@lifi/perps-types` from its root, so the removed symbols leave its published surface too.

- Updated dependencies [[`106b3cd`](https://github.com/lifinance/perps-sdk/commit/106b3cdf4523c02c4add4b1342377712b9359e38), [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2), [`130c9bd`](https://github.com/lifinance/perps-sdk/commit/130c9bd18f522205273ab1a8ba2565391d75ff19), [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93)]:
  - @lifi/perps-sdk@7.0.0
  - @lifi/perps-types@7.0.0

## 6.1.1

### Patch Changes

- Updated dependencies [[`6b2d8f5`](https://github.com/lifinance/perps-sdk/commit/6b2d8f5eea6afab6adae20da836d2cb0d3d8e51e), [`0a4b5eb`](https://github.com/lifinance/perps-sdk/commit/0a4b5eb0ef2cc01b1f4c30a0c6f7389227ed6c2d)]:
  - @lifi/perps-types@6.0.0

## 6.1.0

### Minor Changes

- [#322](https://github.com/lifinance/perps-sdk/pull/322) [`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP action wrappers, preserve provider TWAP identifiers, sign Lighter TWAP actions, and read running TWAP parents directly from each venue.

### Patch Changes

- Updated dependencies [[`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852), [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea)]:
  - @lifi/perps-types@5.3.0

## 6.0.2

### Patch Changes

- Updated dependencies [[`489cca0`](https://github.com/lifinance/perps-sdk/commit/489cca07a4bc5dc5f8eded7c43075e8bed596334)]:
  - @lifi/perps-types@5.0.0

## 6.0.1

### Patch Changes

- [#297](https://github.com/lifinance/perps-sdk/pull/297) [`97d2a65`](https://github.com/lifinance/perps-sdk/commit/97d2a65f04d259a0fc58aef54c67b8cc537db204) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Give Hyperliquid funding activity rows a deterministic `funding:<coin>:<ISO time>` id instead of the shared zero hash, so consumers can key on `id` without collisions.

- [#299](https://github.com/lifinance/perps-sdk/pull/299) [`0f015d1`](https://github.com/lifinance/perps-sdk/commit/0f015d185ca2e785146383dbed63a5fff6796beb) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose `positionSupportsMarginAdjustment(position)` and `positionSupportsMarginRemoval(position)` as the stack's owned answer to whether an open position takes a margin adjustment, and in which direction. Clients gating an edit-margin affordance read these instead of inspecting `Position.marginMode` and `Position.market.positionMarginAdjustment` themselves, or calling `positionMarginConstraints` just to test its `undefined` return. `removableIsolatedMargin` and the Hyperliquid and Lighter `positionMarginConstraints` implementations now gate on the same predicates, so a client's affordance cannot diverge from what the venue accepts.

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

- Updated dependencies [[`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1), [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca), [`4e9daa7`](https://github.com/lifinance/perps-sdk/commit/4e9daa7d3785a137a88160fc38d474011d5096d9)]:
  - @lifi/perps-types@4.0.0
  - @lifi/perps-sdk@6.0.0

## 5.1.0

### Minor Changes

- [#289](https://github.com/lifinance/perps-sdk/pull/289) [`feed7fa`](https://github.com/lifinance/perps-sdk/commit/feed7fa7a0dece3788a095aa490f81ae8e6249e5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Skip Hyperliquid sub-dexes whose every market is delisted when fanning `clearinghouseState` / `frontendOpenOrders` reads out, cutting the per-call request weight `getAccount`, `getPositions` and `getOrders` spend against Hyperliquid's per-IP budget. A sub-dex keeps being read as long as it has one live market.

## 5.0.0

### Minor Changes

- [#287](https://github.com/lifinance/perps-sdk/pull/287) [`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Declare the deposit assets each venue is funded in and discover a venue's deposit flow from the SDK.

  `ETHEREUM_USDC`, `ETHEREUM_NATIVE_GAS`, `HYPERLIQUID_USDC`, `LIGHTER_USDC`, `ROBINHOOD_USDG`, and `ROBINHOOD_NATIVE_GAS` carry the chain, checksummed address, and decimals of every token a deposit can target, so clients no longer assemble them by hand.

  `PerpsClient.getDepositFlow({ provider, address })` resolves what a deposit into that provider requires for that address, as a discriminated union: `lifiSwap` (a single route into the venue's collateral, with `toAddress` when the venue credits a provisioned address), `firstDepositPipeline` (an account-opening deposit that also seeds native gas), or `setupRequired` (the setup actions to run first). It delegates to an optional `getDepositFlow` on the provider plugin and resolves `undefined` for a provider that does not implement it. Hyperliquid reports its venue-chain USDC swap, both Lighter instances resolve against whether the account exists, and Ondo reports its provisioned deposit address or the login / deposit-address gate.

  `getGasRecommendation(client, { chainId })` reads LI.FI's gas suggestion for a chain directly from the user's client, for seeding the gas leg of a first-deposit pipeline.

  BREAKING: removes `DepositProviderKey`, `LIFI_DEPOSIT_CHAIN_BY_PROVIDER`, and `lifiDepositChainForProvider`. Resolve a provider's deposit target with `getDepositFlow` instead.

### Patch Changes

- Updated dependencies [[`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2)]:
  - @lifi/perps-sdk@5.0.0
  - @lifi/perps-types@3.3.2

## 4.3.1

### Patch Changes

- [#272](https://github.com/lifinance/perps-sdk/pull/272) [`48820f8`](https://github.com/lifinance/perps-sdk/commit/48820f842b3911759d351e6538b659e98c0ba225) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Normalize valid Ethereum wallet addresses in Hyperliquid REST and WebSocket requests.

- [#275](https://github.com/lifinance/perps-sdk/pull/275) [`882c3e3`](https://github.com/lifinance/perps-sdk/commit/882c3e335c053512892779b90dbc424dfeaf4f2d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Retain delisted Hyperliquid markets for historical account data while excluding them from live market and trading flows.

- Updated dependencies [[`882c3e3`](https://github.com/lifinance/perps-sdk/commit/882c3e335c053512892779b90dbc424dfeaf4f2d)]:
  - @lifi/perps-types@3.3.1

## 4.3.0

### Minor Changes

- [#270](https://github.com/lifinance/perps-sdk/pull/270) [`e4f1c15`](https://github.com/lifinance/perps-sdk/commit/e4f1c1559c39c285c839e635f69b1c1dd5d61130) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Own the canonical Hyperliquid coin/token→Asset logo mapping: `coinAsset` and spot-balance synthesis now apply the curated logo override table (USDC, USDT0, HYPE) and the `_spot`/Unit-token base rules, and the derivation (`applyLogoOverride`, `spotLogoURI`, `UNIT_TOKEN_NAMES`) is exported for downstream consumers.

## 4.2.0

### Minor Changes

- [#252](https://github.com/lifinance/perps-sdk/pull/252) [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - gate the HL ws accountSummary frame on the abstraction mode

- [#252](https://github.com/lifinance/perps-sdk/pull/252) [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - feat: stream a spot-fed accountSummary for unified and portfolio-margin accounts

- [#252](https://github.com/lifinance/perps-sdk/pull/252) [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - count HYPE and BTC as portfolio-margin collateral at their loan-to-value weight when computing available margin

### Patch Changes

- Updated dependencies [[`128ad0c`](https://github.com/lifinance/perps-sdk/commit/128ad0cf2ea7a862ad5626eb16b2b9aa8750ecc0), [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6)]:
  - @lifi/perps-types@3.1.0

## 4.1.0

### Minor Changes

- [#260](https://github.com/lifinance/perps-sdk/pull/260) [`09cd2b6`](https://github.com/lifinance/perps-sdk/commit/09cd2b6bbe2061afc1903d3ac622722500f1fd92) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Provider packages can now declare setup actions they complete themselves via `PerpsProviderPlugin.internalSetupActions`. `PerpsClient.checkSetup` drains each such pending step in place — building, signing, and executing it with the provider's own credentials — and omits it from the returned setup list. A descriptor whose `signers` include `USER` is never treated as internal, and a failed internal step never blocks setup: it stays unsatisfied and is retried on a later `checkSetup`. The Ondo `SESSION` signing arm now executes backend-authored request-bearing steps with the stored session token.

## 4.0.0

### Patch Changes

- [#258](https://github.com/lifinance/perps-sdk/pull/258) [`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `PerpsSigner` now has exactly two values: `USER` (the end-user's wallet must sign or consent — expect a wallet interaction) and `SDK` (the provider package completes signing with credentials it holds or creates, no user interaction). The previous `AGENT` and `API_KEY` values are removed; each provider package is the authority on what `SDK` means for its venue. The array shape of `signers` is unchanged.

- Updated dependencies [[`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0), [`e5df3a5`](https://github.com/lifinance/perps-sdk/commit/e5df3a5b712fa8c1f0ba55e7161318473de1c762)]:
  - @lifi/perps-types@3.0.0
  - @lifi/perps-sdk@4.0.0

## 3.0.1

### Patch Changes

- [#246](https://github.com/lifinance/perps-sdk/pull/246) [`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Polish package READMEs: consistent badge headers and structure, quick-start snippets, and a WebSocket section in the core README.

- Updated dependencies [[`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b)]:
  - @lifi/perps-types@2.0.1

## 3.0.0

### Patch Changes

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface Ondo venue-terms acceptance and API-key creation as explicit setup steps.

  - **perps-types**: add `ActionType.ACCEPT_PROVIDER_TERMS` (provider-level venue terms, distinct from the app-level `META_ACCEPT_TERMS`), `SigningMethod.SESSION` (client-only venue REST authorized by a stored provider session token), and `SessionActionStep` — a marker step carrying no request material, so a backend-authored path or body can never be executed with the client's bearer token. `OndoAccountConfig` gains required `termsAccepted` and `apiKeyRegistered` flags. The `ActionResult` failure variant gains an optional structured `errorCode`.
  - **perps-sdk**: new optional plugin hook `onExecuteResults(address, results)`, invoked after every `executeAction` round-trip on both the execute and provider-setup paths, so plugins can react to structured failures.
  - **perps-sdk-provider-ondo**: venue-terms acceptance moves out of the SIWE login (no more implicit `POST /v1/agreement` on first login) and API-key creation out of lazy first-use minting into explicit `SESSION`-signed setup steps executed directly against the venue; the lazy mint remains as a headless fallback. `getAccount` reports `termsAccepted` (from the login token's `newAccount` flag) and `apiKeyRegistered` (local key presence). A stored API key is evicted when an execute result carries `errorCode: Unauthorized`, so the `REGISTER_API_KEY` setup step re-stages instead of every action failing.
  - **perps-sdk-provider-lighter / -hyperliquid**: exhaustive `ActionType` projections extended for the new member (rejected as unsupported).

- Updated dependencies [[`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307), [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307)]:
  - @lifi/perps-types@2.0.0
  - @lifi/perps-sdk@3.0.0

## 2.1.1

### Patch Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the auth-token signing taxonomy for venues authenticated by a client-held credential (Ondo first): `SigningMethod.AUTH_TOKEN` / `SigningMethod.SIWE`, `ActionType.SIWE_LOGIN`, the `RestCallActionStep`/`RestCallSignedActionStep` and `SiweActionStep`/`SiweSignedActionStep` pairs, and `OndoAccountConfig` in the `AccountConfig` union. `LIFI_DEPOSIT_CHAIN_BY_PROVIDER` is now `Partial` — providers without a LI.FI deposit chain (ondo) have no entry.

- Updated dependencies [[`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521), [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521)]:
  - @lifi/perps-types@1.15.0

## 2.1.0

### Minor Changes

- [#215](https://github.com/lifinance/perps-sdk/pull/215) [`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4) Thanks [@TristanNcl](https://github.com/TristanNcl)! - feat: add accountSummary WS channel and fix Lighter PnL double-counting (ORD-817)

### Patch Changes

- Updated dependencies [[`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4)]:
  - @lifi/perps-types@1.13.0

## 2.0.0

### Patch Changes

- Updated dependencies [[`a5e7e17`](https://github.com/lifinance/perps-sdk/commit/a5e7e170cdfbb494ea284c949d685738d29348d4), [`13654ca`](https://github.com/lifinance/perps-sdk/commit/13654ca609282b8e5f97265ae5d4f8df98b70ff0)]:
  - @lifi/perps-sdk@2.0.0

## 1.6.2

### Patch Changes

- [#214](https://github.com/lifinance/perps-sdk/pull/214) [`b4fbb6a`](https://github.com/lifinance/perps-sdk/commit/b4fbb6a9f6ae7c51aa81bb87e5334b6505770714) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add Lighter per-asset unified-collateral opt-in: `UPDATE_ASSET_COLLATERAL` action with per-asset `{ assetId, enabled }` params, a `SignUpdateAccountAssetConfig` WASM signing arm, a read-side `assetCollateral` projection on the Lighter account config decoded from each held asset's `margin_mode`, and loud rejection of the action in the Hyperliquid mappers.

- Updated dependencies [[`b4fbb6a`](https://github.com/lifinance/perps-sdk/commit/b4fbb6a9f6ae7c51aa81bb87e5334b6505770714)]:
  - @lifi/perps-types@1.12.0

## 1.6.1

### Patch Changes

- [#210](https://github.com/lifinance/perps-sdk/pull/210) [`e6b0be6`](https://github.com/lifinance/perps-sdk/commit/e6b0be60e96839e28b91cf4bb592a5306dd38d91) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Project the SET_REFERRAL setup descriptor in the Hyperliquid account-config mapper instead of throwing, fixing getAccount rejecting for every account once the backend serves the setReferrer setup gate

- Updated dependencies [[`fecfa9b`](https://github.com/lifinance/perps-sdk/commit/fecfa9b3255b5f77a1b58b49d790500a61d56561)]:
  - @lifi/perps-types@1.11.0

## 1.6.0

### Minor Changes

- [#207](https://github.com/lifinance/perps-sdk/pull/207) [`b4b7adf`](https://github.com/lifinance/perps-sdk/commit/b4b7adf8ddeabfb4f2bdaf24ecca63f8111b8220) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Lighter `APPROVE_INTEGRATOR` action: a new `ActionType`, a `LighterSigner.dispatch` case that calls the vendored WASM `SignApproveIntegrator`, and pass-through of backend-supplied integrator account index and taker/maker fees on order create/modify signing (nil-sentinel fallback preserves the no-fee wire blob).

### Patch Changes

- Updated dependencies [[`b4b7adf`](https://github.com/lifinance/perps-sdk/commit/b4b7adf8ddeabfb4f2bdaf24ecca63f8111b8220)]:
  - @lifi/perps-types@1.10.0

## 1.5.6

### Patch Changes

- [#194](https://github.com/lifinance/perps-sdk/pull/194) [`a67df34`](https://github.com/lifinance/perps-sdk/commit/a67df34c445629a3c1822156df521a159ee21216) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Speed up Hyperliquid WS compressed-frame decoding (no per-character base64 callback, leaner DecompressionStream plumbing) and coalesce a stalled fastAssetCtxs backlog to its newest frame; orderbook deltas still all apply in order.

- Updated dependencies [[`64a0f6f`](https://github.com/lifinance/perps-sdk/commit/64a0f6f8e81db2ccf34e68cc6775705dd9398542)]:
  - @lifi/perps-types@1.7.0

## 1.5.5

### Patch Changes

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Drop stale Hyperliquid compact l2 deltas: a delta whose timestamp is not newer than the maintained orderbook is discarded, so an async-decoded delta that resolves after a newer frame no longer corrupts the book.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid `getFills` pagination to sort fills (time desc, `tid` tiebreaker) and use a composite `(time, tid)` cursor, so paging no longer skips or repeats fills when the upstream response is not newest-first or has non-monotonic `tid`s.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix getOrders throwing a TypeError and returning no orders when a Hyperliquid frontendOpenOrders response omits the children field on an order.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Maintain the Hyperliquid markets-context map incrementally per WebSocket frame instead of rebuilding it, keeping unchanged market entries referentially stable across emissions.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Count unrealized PnL toward available margin for `'gross'` collateral (Hyperliquid unified/portfolioMargin), matching the venue's buying-power accounting.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - mapStatusReason now returns a specific human-readable reason for every documented Hyperliquid terminal cancel/reject status (e.g. perpMarginRejected, oracleRejected, insufficientSpotBalanceRejected), instead of undefined for those that lacked an explicit case.

## 1.5.4

### Patch Changes

- [#169](https://github.com/lifinance/perps-sdk/pull/169) [`5e83cc6`](https://github.com/lifinance/perps-sdk/commit/5e83cc6b119d80c99e5413fd45903c76de7b99f2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix HyperliquidAgentStore silently regenerating the approved agent key when a custom StorageAdapter throws a non-PerpsError during lookup; the transient error now propagates and the stored key is left untouched.

- [#187](https://github.com/lifinance/perps-sdk/pull/187) [`62451af`](https://github.com/lifinance/perps-sdk/commit/62451af391daea9aaabd05c51a68f8433ca44068) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - mapStatusReason now returns a specific human-readable reason for every documented Hyperliquid terminal cancel/reject status (e.g. perpMarginRejected, oracleRejected, insufficientSpotBalanceRejected), instead of undefined for those that lacked an explicit case.

## 1.5.3

### Patch Changes

- [#163](https://github.com/lifinance/perps-sdk/pull/163) [`7c3bc71`](https://github.com/lifinance/perps-sdk/commit/7c3bc71b1c9f6100a19dbb9d11b89f44edb2db29) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Suppress the Hyperliquid `userFills` snapshot frame so historical fills are no longer emitted as live fill events on subscribe or reconnect.

- [#164](https://github.com/lifinance/perps-sdk/pull/164) [`0390904`](https://github.com/lifinance/perps-sdk/commit/0390904489fdacee26af87dce33cbe960e8d8f4e) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid fill order-type detection: maker fills are now reported as `LIMIT` and taker fills leave `Fill.type` undefined, instead of every fill being reported as `MARKET`. `Fill.type` is now optional.

- Updated dependencies [[`0390904`](https://github.com/lifinance/perps-sdk/commit/0390904489fdacee26af87dce33cbe960e8d8f4e)]:
  - @lifi/perps-types@1.6.0

## 1.5.2

### Patch Changes

- [#158](https://github.com/lifinance/perps-sdk/pull/158) [`ac4f00d`](https://github.com/lifinance/perps-sdk/commit/ac4f00d874fcaeb6fa93ffd9645781593658f75f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid account summaries double-counting locked margin and unrealized PnL: `accountValue` is total venue equity, so `availableMargin` now subtracts locked margin from it and `portfolioValue` no longer re-adds margin/PnL; `summarizeAccount` takes a `CollateralSemantics` (`'free' | 'gross' | 'equity'`) instead of the `collateralIsGross` boolean, and per-dex equity/margin now read `marginSummary` (whole account, isolated positions included) rather than the cross-only summary.

- [#159](https://github.com/lifinance/perps-sdk/pull/159) [`7848c4b`](https://github.com/lifinance/perps-sdk/commit/7848c4b176b6d72f5cf98d3a1156c969d7254a1c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix `mapOrderStatus` misclassifying documented Hyperliquid terminal statuses (e.g. `siblingFilledCanceled`, `scheduledCancel`, `liquidatedCanceled`, and the `*Rejected` family) as PENDING, which kept cancelled/rejected orders in the live open-orders and trigger-orders lists instead of evicting them.

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

## 1.3.1

### Patch Changes

- [#150](https://github.com/lifinance/perps-sdk/pull/150) [`ff8eaa4`](https://github.com/lifinance/perps-sdk/commit/ff8eaa4209f9a123546b675e745490c6e4ad1cf3) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add SET_REFERRAL action type for the Hyperliquid setReferrer setup gate; classify it as having no account-config projection in both provider mappers.

- Updated dependencies [[`ff8eaa4`](https://github.com/lifinance/perps-sdk/commit/ff8eaa4209f9a123546b675e745490c6e4ad1cf3)]:
  - @lifi/perps-types@1.4.0

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

- Updated dependencies [[`32d357d`](https://github.com/lifinance/perps-sdk/commit/32d357d9965922c8179b83a309f4eab4df9aa627)]:
  - @lifi/perps-sdk@1.0.1
  - @lifi/perps-types@1.0.1

## 1.0.0

### Major Changes

- [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - First stable release of the Hyperliquid provider plugin for the LI.FI Perps SDK. Register it on `PerpsClient` via the `PerpsProvider` plugin SPI to route Hyperliquid calls.

  - Agent-keypair signing with client-side key storage, typed account configuration, spot support, and ledger/activity enrichment.

### Minor Changes

- [#29](https://github.com/lifinance/perps-sdk/pull/29) [`c80a93b`](https://github.com/lifinance/perps-sdk/commit/c80a93b316dfc56072dc87617bf7a8b280cdcfd1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Unify the account-summary surface on a single `getAccountSummary` name. The provider-interface method, the `PerpsClient` method, and both providers' standalone exports (formerly `getPortfolioSummary`, `summarizeHyperliquidAccount`, and `summarizeLighterAccount`) are now all named `getAccountSummary`. The result type `AccountSummary` is unchanged. This is a rename only — no behavioural change.

### Patch Changes

- Updated dependencies [[`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c), [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c), [`c80a93b`](https://github.com/lifinance/perps-sdk/commit/c80a93b316dfc56072dc87617bf7a8b280cdcfd1)]:
  - @lifi/perps-sdk@1.0.0
  - @lifi/perps-types@1.0.0
