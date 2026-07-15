# @lifi/perps-sdk-provider-lighter

## 2.4.0

### Minor Changes

- [#240](https://github.com/lifinance/perps-sdk/pull/240) [`7cb09a5`](https://github.com/lifinance/perps-sdk/commit/7cb09a53cf195089879b52eb7d84c0960da137b7) Thanks [@TristanNcl](https://github.com/TristanNcl)! - Add an optional `onProgress` sink to `PerpsClient.execute()` (new public `SignActionProgress` type, carried on `SignActionsContext`). Lighter's `EVM_TX` signer emits `submitted`/`confirmed` per broadcast leg (approve, deposit), so consumers can render a live per-transaction deposit stepper.

## 2.3.0

### Minor Changes

- [#231](https://github.com/lifinance/perps-sdk/pull/231) [`2d0d493`](https://github.com/lifinance/perps-sdk/commit/2d0d493e2dace775b4fcdc52564ebcf588894236) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Adopt the `'perps'`/`'spot'` category vocabulary for `SEND_ASSET` (the legacy `'perp'` string is no longer accepted) and label account balances with category ids derived from the backend's `/providers` category metadata: collateral carries the fixed-quote category's id and asset, spot token holdings carry the null-quote category's id.

### Patch Changes

- Updated dependencies [[`0a2472d`](https://github.com/lifinance/perps-sdk/commit/0a2472df592899019d7a0597a15c1d4986e0633e)]:
  - @lifi/perps-types@1.15.1

## 2.2.1

### Patch Changes

- [#227](https://github.com/lifinance/perps-sdk/pull/227) [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add the auth-token signing taxonomy for venues authenticated by a client-held credential (Ondo first): `SigningMethod.AUTH_TOKEN` / `SigningMethod.SIWE`, `ActionType.SIWE_LOGIN`, the `RestCallActionStep`/`RestCallSignedActionStep` and `SiweActionStep`/`SiweSignedActionStep` pairs, and `OndoAccountConfig` in the `AccountConfig` union. `LIFI_DEPOSIT_CHAIN_BY_PROVIDER` is now `Partial` — providers without a LI.FI deposit chain (ondo) have no entry.

- Updated dependencies [[`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521), [`9b930d4`](https://github.com/lifinance/perps-sdk/commit/9b930d4af3b5671fe97589c73e0bc88db850f521)]:
  - @lifi/perps-types@1.15.0

## 2.2.0

### Minor Changes

- [#224](https://github.com/lifinance/perps-sdk/pull/224) [`4d5424c`](https://github.com/lifinance/perps-sdk/commit/4d5424cf7ea7db1be7fdb4ca958ab649118e3234) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface `referralPresent` on `LighterAccountConfig`: `getAccount` reads the applied Lighter referral (SDK-direct, per-user) and `SET_REFERRAL` now projects `satisfied` from it — `true` only when LI.FI's code is the applied one. Lighter referral is mutable, so an account already on another integrator's code stays gateable. Configure LI.FI's code via the new `lighterProvider({ referralCode })` option.

### Patch Changes

- [#225](https://github.com/lifinance/perps-sdk/pull/225) [`ebf7bd4`](https://github.com/lifinance/perps-sdk/commit/ebf7bd428e18aef2f2b6352e8156234ace4dba85) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Resolve Lighter getAccount balance asset identity (logoURI) through the backend market/asset registry instead of local synthesis (ORD-838)

- Updated dependencies [[`4d5424c`](https://github.com/lifinance/perps-sdk/commit/4d5424cf7ea7db1be7fdb4ca958ab649118e3234)]:
  - @lifi/perps-types@1.14.0

## 2.1.0

### Minor Changes

- [#215](https://github.com/lifinance/perps-sdk/pull/215) [`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4) Thanks [@TristanNcl](https://github.com/TristanNcl)! - feat: add accountSummary WS channel and fix Lighter PnL double-counting (ORD-817)

### Patch Changes

- Updated dependencies [[`2c5445d`](https://github.com/lifinance/perps-sdk/commit/2c5445ddb857713ae6cad3e91be671f9dd1f67f4)]:
  - @lifi/perps-types@1.13.0

## 2.0.0

### Minor Changes

- [#222](https://github.com/lifinance/perps-sdk/pull/222) [`13654ca`](https://github.com/lifinance/perps-sdk/commit/13654ca609282b8e5f97265ae5d4f8df98b70ff0) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - SDK-owned per-leg wallet chain-switching now extends to `SigningMethod.EVM_TX` actions. `SignActionsContext` gains an optional bound `switchToChain(chainId)` that core populates from the consumer's `switchChain` hook, and Lighter's `EVM_TX` signer (deposit/approve/withdraw) switches the wallet to each leg's `txParams.chainId` before broadcasting. When no `switchChain` hook is configured (local/private-key signer) it retains the fail-loud wrong-chain guard rather than broadcasting on the wrong chain.

- [#221](https://github.com/lifinance/perps-sdk/pull/221) [`3499852`](https://github.com/lifinance/perps-sdk/commit/3499852a21fe072dbc64cc096fddb52e5507395d) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Support the `SEND_ASSET` action in the Lighter signer as a same-account spot↔perp USDC self-transfer, mapping `sourceDex`/`destinationDex` onto Lighter's asset route types.

### Patch Changes

- Updated dependencies [[`a5e7e17`](https://github.com/lifinance/perps-sdk/commit/a5e7e170cdfbb494ea284c949d685738d29348d4), [`13654ca`](https://github.com/lifinance/perps-sdk/commit/13654ca609282b8e5f97265ae5d4f8df98b70ff0)]:
  - @lifi/perps-sdk@2.0.0

## 1.9.0

### Minor Changes

- [#217](https://github.com/lifinance/perps-sdk/pull/217) [`cbb85a6`](https://github.com/lifinance/perps-sdk/commit/cbb85a602d595a72efbe2c9542ff80dea20b8eea) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Export the per-asset margin-mode helpers `isAssetMarginEnabled` and `assetMarginModeInt` from the provider-lighter public barrel.

## 1.8.0

### Minor Changes

- [#214](https://github.com/lifinance/perps-sdk/pull/214) [`b4fbb6a`](https://github.com/lifinance/perps-sdk/commit/b4fbb6a9f6ae7c51aa81bb87e5334b6505770714) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add Lighter per-asset unified-collateral opt-in: `UPDATE_ASSET_COLLATERAL` action with per-asset `{ assetId, enabled }` params, a `SignUpdateAccountAssetConfig` WASM signing arm, a read-side `assetCollateral` projection on the Lighter account config decoded from each held asset's `margin_mode`, and loud rejection of the action in the Hyperliquid mappers.

### Patch Changes

- Updated dependencies [[`b4fbb6a`](https://github.com/lifinance/perps-sdk/commit/b4fbb6a9f6ae7c51aa81bb87e5334b6505770714)]:
  - @lifi/perps-types@1.12.0

## 1.7.0

### Minor Changes

- [#212](https://github.com/lifinance/perps-sdk/pull/212) [`fecfa9b`](https://github.com/lifinance/perps-sdk/commit/fecfa9b3255b5f77a1b58b49d790500a61d56561) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Implement Lighter ACCOUNT_MODE switching (Unified vs Simple trading account) via `SignUpdateAccountConfig`: WASM signing arm, typed `accountTradingMode` account state, and descriptor projection.

### Patch Changes

- [#210](https://github.com/lifinance/perps-sdk/pull/210) [`e6b0be6`](https://github.com/lifinance/perps-sdk/commit/e6b0be60e96839e28b91cf4bb592a5306dd38d91) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Project the SET_REFERRAL and APPROVE_INTEGRATOR setup gates in the Lighter account-config mapper instead of throwing, fixing getAccount rejecting once the backend serves those setup descriptors

- [#213](https://github.com/lifinance/perps-sdk/pull/213) [`f669156`](https://github.com/lifinance/perps-sdk/commit/f669156731d7da41fe9b467adfaea95d35cb0464) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Execute Lighter's token-authenticated venue mutations (ACCOUNT_TYPE → /changeAccountTier, SET_REFERRAL → /referral/use) client-side via a direct Lighter POST, so the per-call auth token never transits the LI.FI backend. Tokens are minted per-call with a short (minutes) deadline and never persisted, and venue rule violations surface verbatim as PerpsError(ExchangeRejected). Core now tolerates actions that produce no backend-bound step: `signProviderSetupAction` returns `Promise<SignedActionStep | undefined>` (`undefined` when the plugin executed the action client-side), so callers collecting results into `SignedActionStep[]` must skip `undefined`.

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

- [#204](https://github.com/lifinance/perps-sdk/pull/204) [`c0d0af1`](https://github.com/lifinance/perps-sdk/commit/c0d0af13c4c3a9d4bed998bb6d097363b9107825) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Update the vendored Lighter signer wasm to lighter-go main (`c26ac340`) and adapt `LighterSigner` to the new signing ABI. Signing behavior is preserved — integrator fees, self-trade modes, and skip-nonce are all passed as their unset sentinels. Seeded/deterministic `generateAPIKey` is no longer available (the upstream binary dropped seed support); the parameter has been removed.

## 1.5.5

### Patch Changes

- [#191](https://github.com/lifinance/perps-sdk/pull/191) [`64a0f6f`](https://github.com/lifinance/perps-sdk/commit/64a0f6f8e81db2ccf34e68cc6775705dd9398542) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Type EVM_TX `txParams` as a new generic `EvmCall` interface in perps-types (unencoded viem-style contract call, viem-free) and remove the untyped `as { ... }` cast in the Lighter provider's EVM_TX signer, which now reads the typed `txParams` directly.

- Updated dependencies [[`64a0f6f`](https://github.com/lifinance/perps-sdk/commit/64a0f6f8e81db2ccf34e68cc6775705dd9398542)]:
  - @lifi/perps-types@1.7.0

## 1.5.4

### Patch Changes

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - EVM_TX signing now asserts the wallet is on the backend-specified `txParams.chainId` and throws before broadcasting on a mismatched chain, instead of signing on whatever chain the wallet client is bound to.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix `LighterProvider.getOrders` returning self-contradictory pagination: it now reports `hasMore: false` with `limit` equal to the number of orders returned, reflecting that Lighter's `accountActiveOrders` endpoint returns the complete active-order set with no server-side paging.

- [#190](https://github.com/lifinance/perps-sdk/pull/190) [`d6c15bb`](https://github.com/lifinance/perps-sdk/commit/d6c15bbbf9239a20586ecf3bb6470261750e5395) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Maintain the Lighter WS orderbook with a cached numeric price on each level so per-delta emits sort by that cached number instead of re-parsing every price on every comparison; size-only updates no longer re-parse the price.

## 1.5.3

### Patch Changes

- [#168](https://github.com/lifinance/perps-sdk/pull/168) [`573d4c9`](https://github.com/lifinance/perps-sdk/commit/573d4c9e18e6f42381468c0187b0dda9382e953c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Harden the Lighter auth-token lifecycle: a failed read-only token creation now retries with bounded backoff instead of downgrading reads to the write-capable standard token for the whole session, the requested read-only expiry keeps a clock-skew margin under Lighter's 10-year cap, and a server-side-revoked standard token is re-signed on retry instead of failing reads until it expires.

## 1.5.2

### Patch Changes

- [#158](https://github.com/lifinance/perps-sdk/pull/158) [`ac4f00d`](https://github.com/lifinance/perps-sdk/commit/ac4f00d874fcaeb6fa93ffd9645781593658f75f) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Fix Hyperliquid account summaries double-counting locked margin and unrealized PnL: `accountValue` is total venue equity, so `availableMargin` now subtracts locked margin from it and `portfolioValue` no longer re-adds margin/PnL; `summarizeAccount` takes a `CollateralSemantics` (`'free' | 'gross' | 'equity'`) instead of the `collateralIsGross` boolean, and per-dex equity/margin now read `marginSummary` (whole account, isolated positions included) rather than the cross-only summary.

- [#160](https://github.com/lifinance/perps-sdk/pull/160) [`caec8e0`](https://github.com/lifinance/perps-sdk/commit/caec8e0da16de23d8cd4d2a0848568926975a980) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter authed reads now reject HTTP 200 responses carrying a non-success body `code`, surfacing a typed `PerpsError` instead of crashing downstream with a `TypeError`.

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

- [#147](https://github.com/lifinance/perps-sdk/pull/147) [`3a310ff`](https://github.com/lifinance/perps-sdk/commit/3a310ff1333123949e9ade7a520c93d8fb0c133e) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Consolidate the default Lighter REST host through `DEFAULT_LIGHTER_REST_URL`.

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

- [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - First stable release of the Lighter provider plugin for the LI.FI Perps SDK. Register it on `PerpsClient` via the `PerpsProvider` plugin SPI to route Lighter calls.

  - Bundled Go WASM signer with a persisted API-key store, signed withdrawals and transfers, and an auth-token model: a standard token plus a long-lived read-only token created and persisted through your storage adapter.

### Minor Changes

- [#29](https://github.com/lifinance/perps-sdk/pull/29) [`c80a93b`](https://github.com/lifinance/perps-sdk/commit/c80a93b316dfc56072dc87617bf7a8b280cdcfd1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Unify the account-summary surface on a single `getAccountSummary` name. The provider-interface method, the `PerpsClient` method, and both providers' standalone exports (formerly `getPortfolioSummary`, `summarizeHyperliquidAccount`, and `summarizeLighterAccount`) are now all named `getAccountSummary`. The result type `AccountSummary` is unchanged. This is a rename only — no behavioural change.

### Patch Changes

- Updated dependencies [[`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c), [`7810be5`](https://github.com/lifinance/perps-sdk/commit/7810be57709a875c0be520c66d0457cc8b551f4c), [`c80a93b`](https://github.com/lifinance/perps-sdk/commit/c80a93b316dfc56072dc87617bf7a8b280cdcfd1)]:
  - @lifi/perps-sdk@1.0.0
  - @lifi/perps-types@1.0.0
