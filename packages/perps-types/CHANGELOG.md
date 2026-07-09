# @lifi/perps-types

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
