# @lifi/perps-sdk-provider-hyperliquid

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
