# @lifi/perps-types

## 11.4.0

### Minor Changes

- [#396](https://github.com/lifinance/perps-sdk/pull/396) [`e6f120b`](https://github.com/lifinance/perps-sdk/commit/e6f120b3aabb0dc1814b125f1fd5ee882c6f0945) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the provider-independent onboarding and internal referral-code contract.

  `@lifi/perps-types` gains `referral.ts`: `ReferralStatus`, `ReferralActivityResponse`,
  `ReferralCodeValidation`, `ReferralCodeRejection`, `AttachedReferralCode`,
  `OwnedReferralCode`, `OwnedReferralCodeEligibility`, `OnboardingRequirement`, and the
  EIP-712 contracts for two new `ActionType` members — `META_ONBOARD` (`Onboard`) and
  `META_CREATE_REFERRAL_CODE` (`CreateReferralCode`). Each typed-data payload binds the
  signing address and every mutable field. `META_ACCEPT_TERMS` and
  `acceptTermsTypeFields` are unchanged, so existing signers keep working.

  `@lifi/perps-sdk` gains two address-scoped read services, `getReferralStatus` and
  `getReferralActivity`, and three signing helpers on `PerpsClient`:
  `executeMetaAction`, `submitOnboarding`, and `createReferralCode`. They run through
  the existing `createAction`/`executeAction` pipeline with the `META_PROVIDER`
  sentinel and submit at most one step; when the backend returns no step they resolve
  to `{ results: [] }` without a signature request.

  The three provider packages extend their `accountConfig` action switch to reject the
  two new provider-independent action types, which the exhaustive switch requires. No
  provider-native referral API changes.

## 11.3.0

### Minor Changes

- [#405](https://github.com/lifinance/perps-sdk/pull/405) [`a29315c`](https://github.com/lifinance/perps-sdk/commit/a29315c27d7419246f9d7d7939314edb63cffef0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Resolve the Lighter account tier from the `/accountLimits` tier string, so a `plus` account reports its tier instead of `null`. `LighterAccountConfig` gains the optional `userTierName`.

- [#408](https://github.com/lifinance/perps-sdk/pull/408) [`ff5f2bd`](https://github.com/lifinance/perps-sdk/commit/ff5f2bdb23d4ad92ea31c821baa3d6f585661b9b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add an optional `leverage` multiple to `Fill`, and populate it in the Lighter fill mapper from the venue's pre-trade initial margin fraction.

- [#407](https://github.com/lifinance/perps-sdk/pull/407) [`ad734ee`](https://github.com/lifinance/perps-sdk/commit/ad734ee904a50c7c99abd489d25e819e7d9bc957) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add an optional `counterpartyAddress` to `DepositActivity`. The Ondo activity mapper populates it from the deposit's `fromAddress`.

## 11.2.0

### Minor Changes

- [#400](https://github.com/lifinance/perps-sdk/pull/400) [`e5e25c8`](https://github.com/lifinance/perps-sdk/commit/e5e25c8a86e53f6e407252c9a2855a09a5901f3f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the `REVOKE_AGENT` action type and its params (ORD-1510)

  - `ActionType.REVOKE_AGENT` (`revokeAgent`) with an `ActionParamsMap` entry, so `CreateActionRequest` / `ExecuteActionRequest` cover the revoke action.
  - `RevokeAgentParams` with the revoke target: the agent `address` and the `name` the venue holds for it. Both are required, because HyperCore identifies a named API wallet by name.

## 11.1.0

### Minor Changes

- [#394](https://github.com/lifinance/perps-sdk/pull/394) [`41e447f`](https://github.com/lifinance/perps-sdk/commit/41e447f1acf0cd44ee03b6d92059dbfa2e8e4412) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Retain the Hyperliquid builder-fee amount and client order ID on `Fill`. `HlUserFill` now declares the optional `builderFee` and `cloid` fields `userFills` returns, and `mapFill` projects them into the new optional `Fill.builderFee` (a `Fee`, so the builder portion carries its own token — the same token Hyperliquid charges the total fee in) and `Fill.clientOrderId`. Each stays `undefined` when the wire payload omits it, so a consumer can separate the builder portion of a fill fee from the provider portion and join a fill back to the order that produced it. Adds `ActionType.SYNC_FEE_ATTRIBUTION` with wire value `syncFeeAttribution` and an empty params contract; it is never a `Provider.setup` or `Provider.options` descriptor, and each provider account-config mapper rejects it.

## 11.0.0

### Major Changes

- [#379](https://github.com/lifinance/perps-sdk/pull/379) [`08a3b76`](https://github.com/lifinance/perps-sdk/commit/08a3b76df9726deefd8933888bcc6209f85dc9b5) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LiquidationActivity.liquidatedPositions` is now a non-empty tuple type, so a producer that builds one from an empty array no longer compiles. A consumer that reads `liquidatedPositions[0]` receives a `LiquidatedPosition` without a null guard.

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

- [#365](https://github.com/lifinance/perps-sdk/pull/365) [`cbbc415`](https://github.com/lifinance/perps-sdk/commit/cbbc415c35863f5ce9cd407236b1c743b9d54ac1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LiquidationActivity.leverageType` is now optional, and the Lighter provider no longer sets it. Lighter reports a venue liquidation type on a liquidation row and no margin mode, so the previous mapping put a value from the wrong domain into the field. Hyperliquid and Ondo keep reporting their own `cross` / `isolated` values; a consumer that reads `leverageType` must now handle `undefined`.

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

### Patch Changes

- [#364](https://github.com/lifinance/perps-sdk/pull/364) [`680a1c7`](https://github.com/lifinance/perps-sdk/commit/680a1c7cb652bf08a884dfcb74e4e0a3e4d7b422) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Document the sign and units of `FundingActivity.amount` in TSDoc, and of the
  `HlFundingDelta.usdc` and `LtPositionFunding.change` wire fields that feed it.

## 9.0.0

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

## 8.0.0

### Major Changes

- [#357](https://github.com/lifinance/perps-sdk/pull/357) [`02b7dfd`](https://github.com/lifinance/perps-sdk/commit/02b7dfdd689fcc598232ca4f28921e788234a230) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the SDK's Lighter API-key slot opinion. `RegisterApiKeyParams` is now `{ knownPublicKey?: string }`, the `DEFAULT_API_KEY_INDEX` export is gone, and `LighterAccountConfig.apiKeyIndex` is optional: the SDK records the slot from the backend registration payload and reads that record for every signature, auth token, and setup check.

## 7.0.0

### Major Changes

- [#351](https://github.com/lifinance/perps-sdk/pull/351) [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the provider-voting surface: the `ActionType.META_VOTE` action, the vote types (`VoteDirection`, `VoteType`, `VoteParams`, `VoteMessage`, `voteTypeFields`, `VoteTypedData`), and the `Provider.upVotes` and `Provider.downVotes` fields. `META_PROVIDER` and `MetaProvider` move to a new `metaProvider` module and keep the same names, values, and root export. `@lifi/perps-sdk` re-exports `@lifi/perps-types` from its root, so the removed symbols leave its published surface too.

### Minor Changes

- [#344](https://github.com/lifinance/perps-sdk/pull/344) [`130c9bd`](https://github.com/lifinance/perps-sdk/commit/130c9bd18f522205273ab1a8ba2565391d75ff19) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add PerpsErrorCode.RateLimitExceeded (2090) for a spent request budget, so clients name the HTTP 429 refusal from the shared enum instead of comparing against a local literal.

## 6.0.0

### Major Changes

- [#329](https://github.com/lifinance/perps-sdk/pull/329) [`6b2d8f5`](https://github.com/lifinance/perps-sdk/commit/6b2d8f5eea6afab6adae20da836d2cb0d3d8e51e) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `OhlcvResponse.interval` is now the `OhlcvInterval` union instead of a bare `string`, so a candle response's interval autocompletes and switches exhaustively; code that assigns an arbitrary string into the field no longer compiles and must narrow at its own boundary.

### Minor Changes

- [#331](https://github.com/lifinance/perps-sdk/pull/331) [`0a4b5eb`](https://github.com/lifinance/perps-sdk/commit/0a4b5eb0ef2cc01b1f4c30a0c6f7389227ed6c2d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add PerpsErrorCode.FeatureUnavailable (2080) for venue-side capability gates, letting clients distinguish a definitive "this venue cannot perform this action" refusal from the order-level ExchangeRejected and the recoverable SetupRequired.

## 5.3.0

### Minor Changes

- [#322](https://github.com/lifinance/perps-sdk/pull/322) [`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP action wrappers, preserve provider TWAP identifiers, sign Lighter TWAP actions, and read running TWAP parents directly from each venue.

- [#324](https://github.com/lifinance/perps-sdk/pull/324) [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add PerpsErrorCode.SetupRequired (2070) for accounts that exist but need a recoverable provider setup action completed before the requested operation can be retried. `executeProviderSetupAction` and `executeProviderOption` now throw under the failing result's `errorCode` when the backend classified the failure, falling back to `ExchangeRejected` when it did not.

## 5.2.0

### Minor Changes

- [#320](https://github.com/lifinance/perps-sdk/pull/320) [`2277d7e`](https://github.com/lifinance/perps-sdk/commit/2277d7effe2ea2492772f56cdf49aeed1eb2ea90) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP order action types and params model (ORD-1160)

  - `ActionType.PLACE_TWAP_ORDER` (`placeTwapOrder`) and `ActionType.CANCEL_TWAP_ORDER` (`cancelTwapOrder`) with `ActionParamsMap` entries, so `CreateActionRequest` / `ExecuteActionRequest` cover TWAP.
  - `PlaceTwapOrderParams` with a provider-independent core (`market`, `side`, `size`, `durationSeconds`, `reduceOnly?`) plus capability-declared extras: `randomize?` (Hyperliquid) and `frequencySeconds?` / `minPrice?` / `maxPrice?` (Ondo).
  - `CancelTwapOrderParams` with a stringified provider-native `twapId`.
  - Read-side: `OrderType.TWAP`, `TwapOrderStatus` (RUNNING / COMPLETED / CANCELLED), and the `TwapOrder` running-TWAP read model.
  - `OrderType.TWAP` is excluded from the `type` field of `PlaceOrderParams` in both `@lifi/perps-types` and `@lifi/perps-sdk`: TWAP placement goes through `ActionType.PLACE_TWAP_ORDER`. The set of values accepted by `placeOrder` is unchanged.
  - `Param.type` widened to `'string' | 'boolean' | 'number'` so provider action descriptors can express the TWAP extras (boolean toggle with default, numeric interval with allowed values).

## 5.1.1

### Patch Changes

- [#316](https://github.com/lifinance/perps-sdk/pull/316) [`bc3a171`](https://github.com/lifinance/perps-sdk/commit/bc3a17160902041001615e3e6eb6e1c97b32f79b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add optional runtime referral attribution metadata to provider responses.

## 5.1.0

### Minor Changes

- [#314](https://github.com/lifinance/perps-sdk/pull/314) [`ab7b307`](https://github.com/lifinance/perps-sdk/commit/ab7b307fcca34b443fcb305da6fa1b3ef916e1c1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter withdrawals now sign the caller's `(asset, route)` selection instead of a fixed USDC-out-of-perps default. `LtWithdrawWasmParams` requires `asset_index`, `route_type`, a decimal `amount` string, and the asset's `decimals`, `min_withdrawal_amount` and `symbol`; the signer rejects a route outside `{0, 1}` and any amount below the asset's minimum, and scales by that asset's own precision. `LtAccountAsset` now matches the live `/api/v1/account` payload (`margin_balance`, `multiplier`, and `margin_mode` as `'enabled' | 'disabled'`). New `PerpsClient.getWithdrawableBalances` lists the `(asset, route)` pairs an account can actually withdraw, and `Asset` carries the optional per-asset withdrawal metadata that read joins on.

## 5.0.0

### Major Changes

- [#304](https://github.com/lifinance/perps-sdk/pull/304) [`489cca0`](https://github.com/lifinance/perps-sdk/commit/489cca07a4bc5dc5f8eded7c43075e8bed596334) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the dead `Provider.depositAssets` field and the `DepositAsset` interface. Nothing populated the field — the `/providers` projection that fed it was withdrawn — so any consumer reading it received `undefined`. Per-venue deposit facts are declared in `@lifi/perps-sdk` as `DeclaredDepositAsset` constants (`ETHEREUM_USDC`, `HYPERLIQUID_USDC`, `LIGHTER_USDC`, …) and resolved at runtime through `getDepositFlow`; read deposit targets from there instead.

## 4.2.0

### Minor Changes

- [#300](https://github.com/lifinance/perps-sdk/pull/300) [`2112c11`](https://github.com/lifinance/perps-sdk/commit/2112c1115e57324f2e1589472b72354217a891ea) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface the venue transaction behind a submitted action: a successful `ActionResult` now carries optional `txHash` and a fully-resolved `explorerLink`, so an integrator can link to the venue explorer straight after `executeAction` instead of waiting for the fill or activity row. The backend populates `txHash` only where the venue's canonical hash is known at submit time — Lighter, whose WASM signer computes it before the network call. Explorer resolution stays provider-owned through the new optional `PerpsProviderPlugin.resolveExplorerLink(txHash)` hook, which the Lighter plugin implements against its instance's `explorerTxBaseUrl`. Hyperliquid (hash assigned at block inclusion) and Ondo (offchain) implement no hook, so their results carry neither field — no placeholder links.

## 4.1.0

### Minor Changes

- [#299](https://github.com/lifinance/perps-sdk/pull/299) [`0f015d1`](https://github.com/lifinance/perps-sdk/commit/0f015d185ca2e785146383dbed63a5fff6796beb) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose `positionSupportsMarginAdjustment(position)` and `positionSupportsMarginRemoval(position)` as the stack's owned answer to whether an open position takes a margin adjustment, and in which direction. Clients gating an edit-margin affordance read these instead of inspecting `Position.marginMode` and `Position.market.positionMarginAdjustment` themselves, or calling `positionMarginConstraints` just to test its `undefined` return. `removableIsolatedMargin` and the Hyperliquid and Lighter `positionMarginConstraints` implementations now gate on the same predicates, so a client's affordance cannot diverge from what the venue accepts.

## 4.0.1

### Patch Changes

- [#293](https://github.com/lifinance/perps-sdk/pull/293) [`e068db3`](https://github.com/lifinance/perps-sdk/commit/e068db3c1204e26bff7e1f6fb38436d9e7d07ec6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - expose an optional size on TriggerOrderInput — omitted keeps today's entire-position semantics, set it places a fixed partial trigger

## 4.0.0

### Major Changes

- [#290](https://github.com/lifinance/perps-sdk/pull/290) [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Model transfer-margin support and requirements as provider-owned contracts.

  `PerpsMarket` now declares whether position margin is unsupported, add-only, or add-and-remove. `Position` embeds that perpetual-market capability and the venue's exact current `initialMarginRequirement`, rather than forcing risk calculations through its display-oriented numeric `leverage`.

  Every provider plugin now implements `positionMarginConstraints(position)`. Hyperliquid supplies its documented `max(initial_margin_required, 0.1 * total_position_value)` retention rule and six-decimal amount increment; Lighter supplies its position's initial-margin requirement and six-decimal increment; Ondo returns `undefined` because it is cross-margined only.

  The shared `removableIsolatedMargin({ position, constraints })` helper validates the provider inputs, computes position equity in exact decimal arithmetic, retains the stricter initial-margin or notional-floor requirement, and rounds removable margin down to the venue amount increment.

  The previous `removableMargin(position)` exports are removed from the core SDK and provider packages. Callers must resolve the position's provider-owned constraints through `PerpsClient.positionMarginConstraints(position)` and pass them to `removableIsolatedMargin`.

### Minor Changes

- [#284](https://github.com/lifinance/perps-sdk/pull/284) [`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1) Thanks [@TristanNcl](https://github.com/TristanNcl)! - add getMarketSettings: the user's venue-side margin mode and leverage per market (Hyperliquid via activeAssetData, Lighter via the account position row)

## 3.3.2

### Patch Changes

- [#287](https://github.com/lifinance/perps-sdk/pull/287) [`f6dc0f6`](https://github.com/lifinance/perps-sdk/commit/f6dc0f6a8ab46a7858a0114e1328d3cebb3834a2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Declare the deposit assets each venue is funded in and discover a venue's deposit flow from the SDK.

  `ETHEREUM_USDC`, `ETHEREUM_NATIVE_GAS`, `HYPERLIQUID_USDC`, `LIGHTER_USDC`, `ROBINHOOD_USDG`, and `ROBINHOOD_NATIVE_GAS` carry the chain, checksummed address, and decimals of every token a deposit can target, so clients no longer assemble them by hand.

  `PerpsClient.getDepositFlow({ provider, address })` resolves what a deposit into that provider requires for that address, as a discriminated union: `lifiSwap` (a single route into the venue's collateral, with `toAddress` when the venue credits a provisioned address), `firstDepositPipeline` (an account-opening deposit that also seeds native gas), or `setupRequired` (the setup actions to run first). It delegates to an optional `getDepositFlow` on the provider plugin and resolves `undefined` for a provider that does not implement it. Hyperliquid reports its venue-chain USDC swap, both Lighter instances resolve against whether the account exists, and Ondo reports its provisioned deposit address or the login / deposit-address gate.

  `getGasRecommendation(client, { chainId })` reads LI.FI's gas suggestion for a chain directly from the user's client, for seeding the gas leg of a first-deposit pipeline.

  BREAKING: removes `DepositProviderKey`, `LIFI_DEPOSIT_CHAIN_BY_PROVIDER`, and `lifiDepositChainForProvider`. Resolve a provider's deposit target with `getDepositFlow` instead.

## 3.3.1

### Patch Changes

- [#275](https://github.com/lifinance/perps-sdk/pull/275) [`882c3e3`](https://github.com/lifinance/perps-sdk/commit/882c3e335c053512892779b90dbc424dfeaf4f2d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Retain delisted Hyperliquid markets for historical account data while excluding them from live market and trading flows.

## 3.3.0

### Minor Changes

- [#271](https://github.com/lifinance/perps-sdk/pull/271) [`822bb5f`](https://github.com/lifinance/perps-sdk/commit/822bb5ff4ddb238b8b73c77ce65ffd7e498f449d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Ondo `CREATE_DEPOSIT_ADDRESS` session marker and client-side deposit-address provisioning flow. The shared `SessionActionStep` type now carries the fixed Ethereum USDC margin-wallet policy for this action, and the Ondo account config exposes the canonical provisioned address.

- [#273](https://github.com/lifinance/perps-sdk/pull/273) [`ac32417`](https://github.com/lifinance/perps-sdk/commit/ac324179de2843e8dc7521863c986de304db2fb2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose provider-level funding rate periods and payout cadence metadata.

## 3.2.0

### Minor Changes

- [#265](https://github.com/lifinance/perps-sdk/pull/265) [`73fcc51`](https://github.com/lifinance/perps-sdk/commit/73fcc51a843d9294d98c6e0228ea98ba28cf0a5f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add an optional `Provider.depositAssets` (`DepositAsset[]`) describing the external on-chain ERC-20 tokens a client routes into to fund an account at a venue — each carrying its canonical on-chain identity — `chainId` (the chain the ERC-20 lives on, a `@lifi/types` `ChainId`), `address`, `decimals` — plus `displaySymbol`/`logoURI` for display. Ordered, with the first entry as the client's default; a single-element list today, with room for multiple deposit currencies later. Distinct from a category's `quoteAsset` (the pricing unit); additive and optional, so existing `/providers` payloads and consumers are unaffected.

## 3.1.0

### Minor Changes

- [#266](https://github.com/lifinance/perps-sdk/pull/266) [`128ad0c`](https://github.com/lifinance/perps-sdk/commit/128ad0cf2ea7a862ad5626eb16b2b9aa8750ecc0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add optional `tags` and `aliases` fields to `Asset` for cross-venue search/grouping metadata.

- [#252](https://github.com/lifinance/perps-sdk/pull/252) [`df52f91`](https://github.com/lifinance/perps-sdk/commit/df52f9175081de8a51b94145a8a7c5337d8b21c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - count HYPE and BTC as portfolio-margin collateral at their loan-to-value weight when computing available margin

## 3.0.0

### Major Changes

- [#258](https://github.com/lifinance/perps-sdk/pull/258) [`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `PerpsSigner` now has exactly two values: `USER` (the end-user's wallet must sign or consent — expect a wallet interaction) and `SDK` (the provider package completes signing with credentials it holds or creates, no user interaction). The previous `AGENT` and `API_KEY` values are removed; each provider package is the authority on what `SDK` means for its venue. The array shape of `signers` is unchanged.

## 2.0.1

### Patch Changes

- [#246](https://github.com/lifinance/perps-sdk/pull/246) [`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Polish package READMEs: consistent badge headers and structure, quick-start snippets, and a WebSocket section in the core README.

## 2.0.0

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

## 1.15.1

### Patch Changes

- [#232](https://github.com/lifinance/perps-sdk/pull/232) [`0a2472d`](https://github.com/lifinance/perps-sdk/commit/0a2472df592899019d7a0597a15c1d4986e0633e) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Document that `SendAssetParams.collateral` and `SendAssetActionParams.collateral` carry the canonical `Asset.id` of the asset being moved (for Hyperliquid spot assets, the token index as a string), never a display symbol.

## 1.15.0

### Minor Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the auth-token signing taxonomy for venues authenticated by a client-held credential (Ondo first): `SigningMethod.AUTH_TOKEN` / `SigningMethod.SIWE`, `ActionType.SIWE_LOGIN`, the `RestCallActionStep`/`RestCallSignedActionStep` and `SiweActionStep`/`SiweSignedActionStep` pairs, and `OndoAccountConfig` in the `AccountConfig` union. `LIFI_DEPOSIT_CHAIN_BY_PROVIDER` is now `Partial` — providers without a LI.FI deposit chain (ondo) have no entry.

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Snap Ondo order prices and sizes onto the venue's exact tick/lot grid. `formatOrderPrice`/`formatOrderSize` now round against the market's raw increment (via new optional `Market.priceIncrement`/`Market.sizeIncrement` fields) instead of a flat decimal budget, so orders on non-power-of-ten grids (e.g. `0.25`) are no longer rejected on submission.

## 1.14.0

### Minor Changes

- [#224](https://github.com/lifinance/perps-sdk/pull/224) [`4d5424c`](https://github.com/lifinance/perps-sdk/commit/4d5424cf7ea7db1be7fdb4ca958ab649118e3234) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface `referralPresent` on `LighterAccountConfig`: `getAccount` reads the applied Lighter referral (SDK-direct, per-user) and `SET_REFERRAL` now projects `satisfied` from it — `true` only when LI.FI's code is the applied one. Lighter referral is mutable, so an account already on another integrator's code stays gateable. Configure LI.FI's code via the new `lighterProvider({ referralCode })` option.

## 1.13.0

### Minor Changes

- [#215](https://github.com/lifinance/perps-sdk/pull/215) [`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4) Thanks [@TristanNcl](https://github.com/TristanNcl)! - feat: add accountSummary WS channel and fix Lighter PnL double-counting (ORD-817)

## 1.12.0

### Minor Changes

- [#214](https://github.com/lifinance/perps-sdk/pull/214) [`b4fbb6a`](https://github.com/lifinance/perps-sdk/commit/b4fbb6a9f6ae7c51aa81bb87e5334b6505770714) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add Lighter per-asset unified-collateral opt-in: `UPDATE_ASSET_COLLATERAL` action with per-asset `{ assetId, enabled }` params, a `SignUpdateAccountAssetConfig` WASM signing arm, a read-side `assetCollateral` projection on the Lighter account config decoded from each held asset's `margin_mode`, and loud rejection of the action in the Hyperliquid mappers.

## 1.11.0

### Minor Changes

- [#212](https://github.com/lifinance/perps-sdk/pull/212) [`fecfa9b`](https://github.com/lifinance/perps-sdk/commit/fecfa9b3255b5f77a1b58b49d790500a61d56561) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Implement Lighter ACCOUNT_MODE switching (Unified vs Simple trading account) via `SignUpdateAccountConfig`: WASM signing arm, typed `accountTradingMode` account state, and descriptor projection.

## 1.10.0

### Minor Changes

- [#207](https://github.com/lifinance/perps-sdk/pull/207) [`b4b7adf`](https://github.com/lifinance/perps-sdk/commit/b4b7adf8ddeabfb4f2bdaf24ecca63f8111b8220) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the Lighter `APPROVE_INTEGRATOR` action: a new `ActionType`, a `LighterSigner.dispatch` case that calls the vendored WASM `SignApproveIntegrator`, and pass-through of backend-supplied integrator account index and taker/maker fees on order create/modify signing (nil-sentinel fallback preserves the no-fee wire blob).

## 1.9.0

### Minor Changes

- [#195](https://github.com/lifinance/perps-sdk/pull/195) [`6635800`](https://github.com/lifinance/perps-sdk/commit/66358003ca10fa9afb12dd4ca0608208745f818c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add PerpsErrorCode.Unauthorized (2013) for rejected/invalid caller credentials (e.g. API key); maps to HTTP 401.

## 1.8.0

### Minor Changes

- [#196](https://github.com/lifinance/perps-sdk/pull/196) [`37ddd5b`](https://github.com/lifinance/perps-sdk/commit/37ddd5bc1320388ffebff03d8a47051376ea076b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add optional `chainId?: number` to the public `Provider` type (settlement chain id, aligned to `@lifi/types` `ChainId` values).

## 1.7.0

### Minor Changes

- [#191](https://github.com/lifinance/perps-sdk/pull/191) [`64a0f6f`](https://github.com/lifinance/perps-sdk/commit/64a0f6f8e81db2ccf34e68cc6775705dd9398542) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Type EVM_TX `txParams` as a new generic `EvmCall` interface in perps-types (unencoded viem-style contract call, viem-free) and remove the untyped `as { ... }` cast in the Lighter provider's EVM_TX signer, which now reads the typed `txParams` directly.

## 1.6.0

### Minor Changes

- [#164](https://github.com/lifinance/perps-sdk/pull/164) [`0390904`](https://github.com/lifinance/perps-sdk/commit/0390904489fdacee26af87dce33cbe960e8d8f4e) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid fill order-type detection: maker fills are now reported as `LIMIT` and taker fills leave `Fill.type` undefined, instead of every fill being reported as `MARKET`. `Fill.type` is now optional.

## 1.5.1

### Patch Changes

- [#156](https://github.com/lifinance/perps-sdk/pull/156) [`c4848fb`](https://github.com/lifinance/perps-sdk/commit/c4848fb38f13ae8e02ceccd29049b50af484cbae) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `getAccount` now returns the `positions` array it already computes, so consumers no longer need a second `getPositions` call (and its duplicate `clearinghouseState` fan-out) to obtain positions.

## 1.5.0

### Minor Changes

- [#152](https://github.com/lifinance/perps-sdk/pull/152) [`14ee156`](https://github.com/lifinance/perps-sdk/commit/14ee156ce5529dd98148568ae6fcf3a1d86907c6) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Per-market_id streaming for Hyperliquid&Lighter

## 1.4.0

### Minor Changes

- [#150](https://github.com/lifinance/perps-sdk/pull/150) [`ff8eaa4`](https://github.com/lifinance/perps-sdk/commit/ff8eaa4209f9a123546b675e745490c6e4ad1cf3) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add SET_REFERRAL action type for the Hyperliquid setReferrer setup gate; classify it as having no account-config projection in both provider mappers.

## 1.3.0

### Minor Changes

- [#141](https://github.com/lifinance/perps-sdk/pull/141) [`906cce8`](https://github.com/lifinance/perps-sdk/commit/906cce8d610f90ff155fc1e830c28689e3a70411) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Added compressed pac, sac channel on hl

## 1.2.0

### Minor Changes

- [#140](https://github.com/lifinance/perps-sdk/pull/140) [`a2b6f9e`](https://github.com/lifinance/perps-sdk/commit/a2b6f9eaa88aa02c10b63c9f11ef1cd3f128fea8) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Add public trades subscription channel for Hyperliquid and Lighter; migrate Hyperliquid orderbook to the compact l2 feed.

## 1.1.0

### Minor Changes

- [#135](https://github.com/lifinance/perps-sdk/pull/135) [`4e3977c`](https://github.com/lifinance/perps-sdk/commit/4e3977c33ac7f93a631899d1b270afb1499e7ea8) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Rename and extend the SDK's all-markets price surface into a market-context surface, and re-source it from the providers' all-markets context feeds so it carries oracle + mark + mid for every market.

## 1.0.1

### Patch Changes

- [#133](https://github.com/lifinance/perps-sdk/pull/133) [`32d357d`](https://github.com/lifinance/perps-sdk/commit/32d357d9965922c8179b83a309f4eab4df9aa627) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Standardize the package README

## 1.0.0

### Major Changes

- [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - First stable release of `@lifi/perps-types` — the shared, zero-dependency types underpinning the LI.FI Perps SDK and its provider plugins.
