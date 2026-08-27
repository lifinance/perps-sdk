# @lifi/perps-sdk-provider-ondo

## 11.0.1

### Patch Changes

- [#394](https://github.com/lifinance/perps-sdk/pull/394) [`41e447f`](https://github.com/lifinance/perps-sdk/commit/41e447f1acf0cd44ee03b6d92059dbfa2e8e4412) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Retain the Hyperliquid builder-fee amount and client order ID on `Fill`. `HlUserFill` now declares the optional `builderFee` and `cloid` fields `userFills` returns, and `mapFill` projects them into the new optional `Fill.builderFee` (a `Fee`, so the builder portion carries its own token — the same token Hyperliquid charges the total fee in) and `Fill.clientOrderId`. Each stays `undefined` when the wire payload omits it, so a consumer can separate the builder portion of a fill fee from the provider portion and join a fill back to the order that produced it. Adds `ActionType.SYNC_FEE_ATTRIBUTION` with wire value `syncFeeAttribution` and an empty params contract; it is never a `Provider.setup` or `Provider.options` descriptor, and each provider account-config mapper rejects it.

- Updated dependencies [[`41e447f`](https://github.com/lifinance/perps-sdk/commit/41e447f1acf0cd44ee03b6d92059dbfa2e8e4412)]:
  - @lifi/perps-types@11.1.0

## 11.0.0

### Major Changes

- [#379](https://github.com/lifinance/perps-sdk/pull/379) [`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LiquidationActivity.liquidatedPositions` is now a non-empty tuple type, so a producer that builds one from an empty array no longer compiles. A consumer that reads `liquidatedPositions[0]` receives a `LiquidatedPosition` without a null guard.

### Patch Changes

- [#380](https://github.com/lifinance/perps-sdk/pull/380) [`ea6fb8e`](https://github.com/lifinance/perps-sdk/commit/ea6fb8ec221487773744c349e8b469cdba1f9498) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Move the shared activity-paging logic (merge, filter, sort, slice, cursor mint) out of the Lighter and Ondo providers into one helper in @lifi/perps-sdk.

- [#377](https://github.com/lifinance/perps-sdk/pull/377) [`907e82f`](https://github.com/lifinance/perps-sdk/commit/907e82f0819a948258b932b74aa644d4f871b010) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Hyperliquid and Ondo `getActivity` now drop a funding or liquidation row whose market the backend market list does not hold, instead of rejecting the whole activity feed.

  Breaking for `@lifi/perps-sdk-provider-hyperliquid`: the exported `mapFundingActivity` now returns `FundingActivity | null` — it returns `null` for a row whose market the resolver cannot identify. A caller that assigns the result to a `FundingActivity` variable must handle `null`.

- [#378](https://github.com/lifinance/perps-sdk/pull/378) [`6b64fa5`](https://github.com/lifinance/perps-sdk/commit/6b64fa5492a81ce1a6e8aa91a3196bdce5f03406) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Hyperliquid and Ondo `getFills` now drop a fill row whose market the backend market list does not hold, instead of rejecting the whole fills page.

- Updated dependencies [[`ea6fb8e`](https://github.com/lifinance/perps-sdk/commit/ea6fb8ec221487773744c349e8b469cdba1f9498), [`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5)]:
  - @lifi/perps-sdk@10.0.0
  - @lifi/perps-types@11.0.0

## 10.0.0

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

- [#374](https://github.com/lifinance/perps-sdk/pull/374) [`4b98111`](https://github.com/lifinance/perps-sdk/commit/4b981114be018914973983a104f775742f6fbe6f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Report Ondo deposit and withdrawal activity. `getActivity` now maps
  `/v1/wallet/deposits` and `/v1/wallet/withdrawals`, so a `DEPOSIT` or
  `WITHDRAWAL` request no longer returns an empty page. Both endpoints are
  unpaged, so each is fetched on the first page only and its tail rides the
  activity cursor. `asset` carries Ondo's `coin` symbol. A withdrawal Ondo
  reports as failed or cancelled is dropped. Ondo publishes no account-to-account
  transfer history, so `TRANSFER` stays unmapped.

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

### Patch Changes

- [#372](https://github.com/lifinance/perps-sdk/pull/372) [`3c20c5d`](https://github.com/lifinance/perps-sdk/commit/3c20c5d9a35f43c1986bd3c94852e3c4b2ae43cb) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Route Hyperliquid WebSocket order updates and Ondo remaining-quantity derivation through the existing shared mappers instead of duplicated inline logic. Export the `HlOrderLike` order-payload union that the shared Hyperliquid mappers accept.

- [#366](https://github.com/lifinance/perps-sdk/pull/366) [`51b2ebc`](https://github.com/lifinance/perps-sdk/commit/51b2ebca94cb40daef7d0190cccd41d9b7f093b4) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Read a `null` Ondo position-list result as no rows instead of throwing a `TypeError`.

- [#367](https://github.com/lifinance/perps-sdk/pull/367) [`e466cdc`](https://github.com/lifinance/perps-sdk/commit/e466cdc86a1aee30af49e445393d851ee0e58f0b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Read a `null` Ondo deposit-address result as an empty list, so `getAccount` reports `config.depositAddress: null` instead of raising a malformed-response error.

- Updated dependencies [[`16f46bd`](https://github.com/lifinance/perps-sdk/commit/16f46bdf0b18b3169563a34a39624c2cab15e5df), [`20acc5e`](https://github.com/lifinance/perps-sdk/commit/20acc5ef95f2343ffb13369444134c4325a80f8d), [`680a1c7`](https://github.com/lifinance/perps-sdk/commit/680a1c7cb652bf08a884dfcb74e4e0a3e4d7b422), [`cbbc415`](https://github.com/lifinance/perps-sdk/commit/cbbc415c35863f5ce9cd407236b1c743b9d54ac1), [`8b92692`](https://github.com/lifinance/perps-sdk/commit/8b92692193c1907313b12f4921954133711a4880), [`c1f0c63`](https://github.com/lifinance/perps-sdk/commit/c1f0c6380879909094f8e05067c90005534a46b3)]:
  - @lifi/perps-types@10.0.0
  - @lifi/perps-sdk@9.0.0

## 9.0.0

### Minor Changes

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

- [#363](https://github.com/lifinance/perps-sdk/pull/363) [`6689272`](https://github.com/lifinance/perps-sdk/commit/668927269a8863398694dd4f2c1df59f0b42e5bd) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Read Ondo running TWAPs from `GET /v1/perps/twap/orders/running` and map the venue's `TWAPOrderApiResp` fields. The read previously requested `GET /v1/perps/twap/orders`, a path Ondo does not serve, so every running-TWAP read failed with a 404. `OndoTwapOrder` now mirrors the documented schema (`startTime`, `totalSize`, `avgFilledPrice`, `orderStatus`, `frequency`, `totalFees`, `reduceOnly` and the optional members) in place of the `size` / `filledCost` / `createdAt` / `status` fields the venue never returned, and an empty feed marshalled as a `null` result reads as no rows.

- Updated dependencies [[`54330e9`](https://github.com/lifinance/perps-sdk/commit/54330e9839acf9e805b13b14adc921c4b3287469)]:
  - @lifi/perps-types@9.0.0
  - @lifi/perps-sdk@8.0.0

## 8.0.1

### Patch Changes

- Updated dependencies [[`02b7dfd`](https://github.com/lifinance/perps-sdk/commit/02b7dfdd689fcc598232ca4f28921e788234a230)]:
  - @lifi/perps-types@8.0.0

## 8.0.0

### Patch Changes

- [#343](https://github.com/lifinance/perps-sdk/pull/343) [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Bump viem to 2.55.18 to resolve the vulnerable ws@8.18.3 transitive dependency.

- [#349](https://github.com/lifinance/perps-sdk/pull/349) [`3cff5fc`](https://github.com/lifinance/perps-sdk/commit/3cff5fccb593e7529de5e8e6423d01d9c28be9fc) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - The published `@example` blocks and READMEs no longer show the optional `integrator` field. The API key is the identity the backend resolves.

- [#351](https://github.com/lifinance/perps-sdk/pull/351) [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the provider-voting surface: the `ActionType.META_VOTE` action, the vote types (`VoteDirection`, `VoteType`, `VoteParams`, `VoteMessage`, `voteTypeFields`, `VoteTypedData`), and the `Provider.upVotes` and `Provider.downVotes` fields. `META_PROVIDER` and `MetaProvider` move to a new `metaProvider` module and keep the same names, values, and root export. `@lifi/perps-sdk` re-exports `@lifi/perps-types` from its root, so the removed symbols leave its published surface too.

- Updated dependencies [[`106b3cd`](https://github.com/lifinance/perps-sdk/commit/106b3cdf4523c02c4add4b1342377712b9359e38), [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2), [`130c9bd`](https://github.com/lifinance/perps-sdk/commit/130c9bd18f522205273ab1a8ba2565391d75ff19), [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93)]:
  - @lifi/perps-sdk@7.0.0
  - @lifi/perps-types@7.0.0

## 7.0.0

### Major Changes

- [#335](https://github.com/lifinance/perps-sdk/pull/335) [`0038c89`](https://github.com/lifinance/perps-sdk/commit/0038c89d4bfc956fa8e57a40f7802cbc9a8f863d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Source Ondo account collateral metadata from the backend provider category.

  Breaking: `collateralBalances[0].asset` is now the backend-owned USDC asset, changing its `id` and `displaySymbol` from `USD` to `USDC` and adding the backend `displayName` and `logoURI`. `getAccount()` now reads `/providers` and throws `PerpsError(SDKError)` when the Ondo category has no quote asset.

## 6.0.0

### Major Changes

- [#330](https://github.com/lifinance/perps-sdk/pull/330) [`e9328a6`](https://github.com/lifinance/perps-sdk/commit/e9328a6bc828ce26616ba9e718ee77ed534fed7c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `mapInterval` now takes `OhlcvInterval` instead of a bare `string` in both the Lighter and Ondo providers, so a value that is not an SDK interval is now a compile error rather than a runtime `ValidationError`. Every real caller already passed an `OhlcvInterval` (`CandleSubscription.interval`), so this only tightens the type; the runtime rejection behaviour for venue-unsupported intervals is unchanged.

### Patch Changes

- Updated dependencies [[`6b2d8f5`](https://github.com/lifinance/perps-sdk/commit/6b2d8f5eea6afab6adae20da836d2cb0d3d8e51e), [`0a4b5eb`](https://github.com/lifinance/perps-sdk/commit/0a4b5eb0ef2cc01b1f4c30a0c6f7389227ed6c2d)]:
  - @lifi/perps-types@6.0.0

## 5.1.0

### Minor Changes

- [#322](https://github.com/lifinance/perps-sdk/pull/322) [`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP action wrappers, preserve provider TWAP identifiers, sign Lighter TWAP actions, and read running TWAP parents directly from each venue.

### Patch Changes

- Updated dependencies [[`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852), [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea)]:
  - @lifi/perps-types@5.3.0

## 5.0.0

### Major Changes

- [#302](https://github.com/lifinance/perps-sdk/pull/302) [`c75774d`](https://github.com/lifinance/perps-sdk/commit/c75774dcfaeba85e9becec2ce0e7216483d58ded) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - End the Ondo SIWE login at the client. The SIWE arm of `ondoSignActions` now persists the session JWT and returns no signed step, so the user's wallet signature over the ERC-4361 authentication message is never posted to the LI.FI backend and `SIWE_LOGIN` skips the `/executeAction` hop entirely — the same shape Lighter's client-executed `SET_REFERRAL` already had. Login behaviour is unchanged: the JWT is stored locally, `getAccount` reports `loggedIn: true`, and the `SIWE_LOGIN` setup descriptor reads satisfied.

  Breaking: `completeSiweLogin` resolves the `OndoAuthToken` directly instead of `{ token, signature }`. Callers that destructured `token` must use the returned token itself; the signature has no consumer outside the login exchange.

### Patch Changes

- Updated dependencies [[`489cca0`](https://github.com/lifinance/perps-sdk/commit/489cca07a4bc5dc5f8eded7c43075e8bed596334)]:
  - @lifi/perps-types@5.0.0

## 4.0.0

### Major Changes

- [#290](https://github.com/lifinance/perps-sdk/pull/290) [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Model transfer-margin support and requirements as provider-owned contracts.

  `PerpsMarket` now declares whether position margin is unsupported, add-only, or add-and-remove. `Position` embeds that perpetual-market capability and the venue's exact current `initialMarginRequirement`, rather than forcing risk calculations through its display-oriented numeric `leverage`.

  Every provider plugin now implements `positionMarginConstraints(position)`. Hyperliquid supplies its documented `max(initial_margin_required, 0.1 * total_position_value)` retention rule and six-decimal amount increment; Lighter supplies its position's initial-margin requirement and six-decimal increment; Ondo returns `undefined` because it is cross-margined only.

  The shared `removableIsolatedMargin({ position, constraints })` helper validates the provider inputs, computes position equity in exact decimal arithmetic, retains the stricter initial-margin or notional-floor requirement, and rounds removable margin down to the venue amount increment.

  The previous `removableMargin(position)` exports are removed from the core SDK and provider packages. Callers must resolve the position's provider-owned constraints through `PerpsClient.positionMarginConstraints(position)` and pass them to `removableIsolatedMargin`.

### Patch Changes

- Updated dependencies [[`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1), [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca), [`4e9daa7`](https://github.com/lifinance/perps-sdk/commit/4e9daa7d3785a137a88160fc38d474011d5096d9)]:
  - @lifi/perps-types@4.0.0
  - @lifi/perps-sdk@6.0.0

## 3.0.0

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

## 2.2.0

### Minor Changes

- [#271](https://github.com/lifinance/perps-sdk/pull/271) [`822bb5f`](https://github.com/lifinance/perps-sdk/commit/822bb5ff4ddb238b8b73c77ce65ffd7e498f449d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Ondo `CREATE_DEPOSIT_ADDRESS` session marker and client-side deposit-address provisioning flow. The shared `SessionActionStep` type now carries the fixed Ethereum USDC margin-wallet policy for this action, and the Ondo account config exposes the canonical provisioned address.

### Patch Changes

- Updated dependencies [[`822bb5f`](https://github.com/lifinance/perps-sdk/commit/822bb5ff4ddb238b8b73c77ce65ffd7e498f449d), [`ac32417`](https://github.com/lifinance/perps-sdk/commit/ac324179de2843e8dc7521863c986de304db2fb2)]:
  - @lifi/perps-types@3.3.0

## 2.1.1

### Patch Changes

- [#262](https://github.com/lifinance/perps-sdk/pull/262) [`bf8a97d`](https://github.com/lifinance/perps-sdk/commit/bf8a97dcc6937350da1f62ae8364f32ec96a3252) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Ondo live candles appending a new bar per WebSocket tick: `OndoWsProvider.handleKline` now emits the bucket-open time (`kline.s`) as the candle time instead of the per-update timestamp (`kline.t`), so consecutive updates update the forming candle in place.

- Updated dependencies [[`128ad0c`](https://github.com/lifinance/perps-sdk/commit/128ad0cf2ea7a862ad5626eb16b2b9aa8750ecc0), [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6)]:
  - @lifi/perps-types@3.1.0

## 2.1.0

### Minor Changes

- [#260](https://github.com/lifinance/perps-sdk/pull/260) [`09cd2b6`](https://github.com/lifinance/perps-sdk/commit/09cd2b6bbe2061afc1903d3ac622722500f1fd92) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Provider packages can now declare setup actions they complete themselves via `PerpsProviderPlugin.internalSetupActions`. `PerpsClient.checkSetup` drains each such pending step in place — building, signing, and executing it with the provider's own credentials — and omits it from the returned setup list. A descriptor whose `signers` include `USER` is never treated as internal, and a failed internal step never blocks setup: it stays unsatisfied and is retried on a later `checkSetup`. The Ondo `SESSION` signing arm now executes backend-authored request-bearing steps with the stored session token.

## 2.0.0

### Patch Changes

- Updated dependencies [[`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0), [`e5df3a5`](https://github.com/lifinance/perps-sdk/commit/e5df3a5b712fa8c1f0ba55e7161318473de1c762)]:
  - @lifi/perps-types@3.0.0
  - @lifi/perps-sdk@4.0.0

## 1.0.2

### Patch Changes

- [#246](https://github.com/lifinance/perps-sdk/pull/246) [`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Polish package READMEs: consistent badge headers and structure, quick-start snippets, and a WebSocket section in the core README.

- [#253](https://github.com/lifinance/perps-sdk/pull/253) [`e43e046`](https://github.com/lifinance/perps-sdk/commit/e43e046b1dfaf0856a49994dcbb5857f187429c7) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix the Ondo WS provider staying bound to a previous wallet address: releasing all authenticated channels (or a socket drop) now clears the binding and cycles the connection, so a subsequent subscribe for a different address logs in cleanly.

- Updated dependencies [[`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b)]:
  - @lifi/perps-types@2.0.1

## 1.0.1

### Patch Changes

- [#244](https://github.com/lifinance/perps-sdk/pull/244) [`b9777c5`](https://github.com/lifinance/perps-sdk/commit/b9777c5326699085a3eaf9227e93b123e059e6aa) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Map the Ondo `POST /v1/api_keys` `secretKey` wire field to the stored `apiSecret` domain field at the boundary, and validate the record at write time. The mis-shaped record was previously evicted on read, so `REGISTER_API_KEY` never reported satisfied and HMAC signing used an empty secret.

- [#243](https://github.com/lifinance/perps-sdk/pull/243) [`dd0396e`](https://github.com/lifinance/perps-sdk/commit/dd0396e2b5e714314de9a24b2d477b2777d6c32f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Derive Ondo `termsAccepted` from the `GET /v1/account` terms/privacy versions instead of the SIWE token's `newAccount` flag, so a future venue terms/privacy bump re-stages `ACCEPT_PROVIDER_TERMS`. Removes the now-unused `newAccount` token field and its post-agreement rewrite.

## 1.0.0

### Minor Changes

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface Ondo venue-terms acceptance and API-key creation as explicit setup steps.

  - **perps-types**: add `ActionType.ACCEPT_PROVIDER_TERMS` (provider-level venue terms, distinct from the app-level `META_ACCEPT_TERMS`), `SigningMethod.SESSION` (client-only venue REST authorized by a stored provider session token), and `SessionActionStep` — a marker step carrying no request material, so a backend-authored path or body can never be executed with the client's bearer token. `OndoAccountConfig` gains required `termsAccepted` and `apiKeyRegistered` flags. The `ActionResult` failure variant gains an optional structured `errorCode`.
  - **perps-sdk**: new optional plugin hook `onExecuteResults(address, results)`, invoked after every `executeAction` round-trip on both the execute and provider-setup paths, so plugins can react to structured failures.
  - **perps-sdk-provider-ondo**: venue-terms acceptance moves out of the SIWE login (no more implicit `POST /v1/agreement` on first login) and API-key creation out of lazy first-use minting into explicit `SESSION`-signed setup steps executed directly against the venue; the lazy mint remains as a headless fallback. `getAccount` reports `termsAccepted` (from the login token's `newAccount` flag) and `apiKeyRegistered` (local key presence). A stored API key is evicted when an execute result carries `errorCode: Unauthorized`, so the `REGISTER_API_KEY` setup step re-stages instead of every action failing.
  - **perps-sdk-provider-lighter / -hyperliquid**: exhaustive `ActionType` projections extended for the new member (rejected as unsupported).

- [#238](https://github.com/lifinance/perps-sdk/pull/238) [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Replace Ondo venue-side REST execution with API-key HMAC signing.

  - **perps-types**: remove `RestCallActionStep`, `RestCallSignedActionStep`, and `SigningMethod.AUTH_TOKEN`; add `SigningMethod.HMAC`, `HmacActionStep`, and `HmacSignedActionStep`. The step names its signing mechanism (like `Eip712ActionStep`/`WasmBlobActionStep`), not its transport. The signed step carries a structured `hmac { keyId, timestampMs, signature }` field — there is no `headers` map on the wire, so no venue header names (nor a Bearer JWT / API secret) can ride it. `request.body` is a pre-serialized string that transits verbatim (the exact bytes the HMAC covers).
  - **perps-sdk**: drop the `AUTH_TOKEN` execution detour and the `executeRestCallActions` plugin hook; `HMAC` steps sign then ride the standard `executeAction` path like EIP-712.
  - **perps-sdk-provider-ondo**: remove the venue-side REST execution model; add per-request HMAC-SHA256 signing (`hmacSignRequest`) with a client-held API key minted silently on first trading use, an `OndoApiKeyStore`, and first-login venue-terms acceptance. The JWT and API secret stay userland — only the HMAC key id, timestamp, and signature leave the client, and the backend builds the venue's transport headers at relay time.

### Patch Changes

- Updated dependencies [[`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307), [`5ba65da`](https://github.com/lifinance/perps-sdk/commit/5ba65daa6c3c2664d78d57ce4149784d79eba307)]:
  - @lifi/perps-types@2.0.0
  - @lifi/perps-sdk@3.0.0

## 0.1.0

### Minor Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Implement the Ondo `PerpsProviderPlugin`: `ondoProvider()` wires SIWE session login (`signActions` signs the challenge, stores the venue JWT client-side, and attaches it as a `Bearer` header on REST-call steps) and direct-to-venue authenticated reads — account snapshot with gross collateral semantics, positions, orders, fills, and merged funding/liquidation activity with a composite cursor. Logged-out reads degrade to empty pages without touching the venue; a 401 evicts the stored session so `accountExists` reports false. Quotes and fee display use Ondo's public base fee schedule (2 bps maker / 5 bps taker).

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Scaffold the Ondo Perps provider package: `OndoApiClient` (venue HTTP boundary unwrapping Ondo's `GenericResponse` envelope, `Authorization: Bearer` session auth, typed `OndoApiError`/`OndoSessionExpiredError`, retrying GETs but never POSTs), `completeSiweLogin` (signs the SIWE challenge and exchanges it for an Ondo session JWT directly against the venue), and `OndoTokenStore` (persists the JWT per wallet address and environment via a `StorageAdapter`; expired tokens read back as absent).

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Ondo realtime WS provider: `ondoWsProvider()` subscribes to Ondo's WebSocket channels — orderbook (`depthBooksPerps`), trades, klines (with SDK-interval → Ondo-resolution mapping), and market context merged from `markPricesPerps` + `fundingRatesPerps` — plus the JWT-authenticated `ordersPerps`/`fillsPerps`/`positionsPerps` streams. The stored SIWE session JWT is sent as a single `login` op per connection before the first private subscribe (re-sent after reconnects); a missing or expired session surfaces as `OndoSessionExpiredError` instead of hanging. `spotBalances` is rejected — Ondo exposes no spot balances channel.

### Patch Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Snap Ondo order prices and sizes onto the venue's exact tick/lot grid. `formatOrderPrice`/`formatOrderSize` now round against the market's raw increment (via new optional `Market.priceIncrement`/`Market.sizeIncrement` fields) instead of a flat decimal budget, so orders on non-power-of-ten grids (e.g. `0.25`) are no longer rejected on submission.

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Accept the `30m` and `1M` candle intervals in the Ondo WS provider so live subscriptions for the intervals the backend advertises no longer throw and their frames route to the chart.

- Updated dependencies [[`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521), [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521)]:
  - @lifi/perps-types@1.15.0
