# @lifi/perps-types

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
