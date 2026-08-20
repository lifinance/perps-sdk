# @lifi/perps-sdk-provider-lighter

## 14.0.0

### Major Changes

- [#357](https://github.com/lifinance/perps-sdk/pull/357) [`02b7dfd`](https://github.com/lifinance/perps-sdk/commit/02b7dfdd689fcc598232ca4f28921e788234a230) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the SDK's Lighter API-key slot opinion. `RegisterApiKeyParams` is now `{ knownPublicKey?: string }`, the `DEFAULT_API_KEY_INDEX` export is gone, and `LighterAccountConfig.apiKeyIndex` is optional: the SDK records the slot from the backend registration payload and reads that record for every signature, auth token, and setup check.

### Patch Changes

- Updated dependencies [[`02b7dfd`](https://github.com/lifinance/perps-sdk/commit/02b7dfdd689fcc598232ca4f28921e788234a230)]:
  - @lifi/perps-types@8.0.0

## 13.0.2

### Patch Changes

- [#355](https://github.com/lifinance/perps-sdk/pull/355) [`7d3e56e`](https://github.com/lifinance/perps-sdk/commit/7d3e56e582f9f6b5c1b4fdd6679d6a6cce27f1f8) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Verify the stored Lighter API key still occupies its venue API-key slot before the first `WASM_BLOB` signature. A slot re-registered on another device now fails with the same error code as a missing registration, so the `REGISTER_API_KEY` gate renders instead of a venue rejection. A failed or inconclusive check never blocks the signature, a `REGISTER_API_KEY` batch skips the check, and a 30s freshness window keeps a burst of batches at one extra request.

## 13.0.1

### Patch Changes

- [#352](https://github.com/lifinance/perps-sdk/pull/352) [`b306dfe`](https://github.com/lifinance/perps-sdk/commit/b306dfe2a7c967885daaf66563f7e7f1757bf958) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lift the shared L1-countersign flow in the Lighter signActions module so APPROVE_INTEGRATOR and TRANSFER route through one helper instead of duplicated logic.

- [#353](https://github.com/lifinance/perps-sdk/pull/353) [`36f0730`](https://github.com/lifinance/perps-sdk/commit/36f0730824e75996fa66ac41a0ef35287e9df772) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove captured Lighter signer functions from the global scope after the SDK loads them.

  Drop the unused `CheckClient` entry from the exported `LighterWasmExports` type. The WASM binary still exports the function; the SDK no longer captures it, and no known consumer reads it.

## 13.0.0

### Major Changes

- [#348](https://github.com/lifinance/perps-sdk/pull/348) [`6bcfc26`](https://github.com/lifinance/perps-sdk/commit/6bcfc2674c1b922f59903732681af191068eb690) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter `TRANSFER` now collects the user's L1 wallet signature and embeds it as `txInfo.L1Sig`, so the stored API key alone cannot move USDC to an L1 address the account owner never approved. **Breaking:** a `TRANSFER` step now requires `userWallet`, and `LighterSigner.sign()` throws for `TRANSFER` — callers must use the new `LighterSigner.signTransfer()`. `SEND_ASSET` is unchanged: the same-account route move stays on the bare signer call, prompts no wallet, and keeps `L1Sig` empty.

### Patch Changes

- [#343](https://github.com/lifinance/perps-sdk/pull/343) [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Bump viem to 2.55.18 to resolve the vulnerable ws@8.18.3 transitive dependency.

- [#349](https://github.com/lifinance/perps-sdk/pull/349) [`3cff5fc`](https://github.com/lifinance/perps-sdk/commit/3cff5fccb593e7529de5e8e6423d01d9c28be9fc) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - The published `@example` blocks and READMEs no longer show the optional `integrator` field. The API key is the identity the backend resolves.

- [#351](https://github.com/lifinance/perps-sdk/pull/351) [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Remove the provider-voting surface: the `ActionType.META_VOTE` action, the vote types (`VoteDirection`, `VoteType`, `VoteParams`, `VoteMessage`, `voteTypeFields`, `VoteTypedData`), and the `Provider.upVotes` and `Provider.downVotes` fields. `META_PROVIDER` and `MetaProvider` move to a new `metaProvider` module and keep the same names, values, and root export. `@lifi/perps-sdk` re-exports `@lifi/perps-types` from its root, so the removed symbols leave its published surface too.

- Updated dependencies [[`106b3cd`](https://github.com/lifinance/perps-sdk/commit/106b3cdf4523c02c4add4b1342377712b9359e38), [`d0d7ac8`](https://github.com/lifinance/perps-sdk/commit/d0d7ac8133e3fb37a8ff7f340222f132fc39f1d2), [`130c9bd`](https://github.com/lifinance/perps-sdk/commit/130c9bd18f522205273ab1a8ba2565391d75ff19), [`074414b`](https://github.com/lifinance/perps-sdk/commit/074414b08e2ac9eff11105d2372ef2d67558fb93)]:
  - @lifi/perps-sdk@7.0.0
  - @lifi/perps-types@7.0.0

## 12.1.1

### Patch Changes

- [#340](https://github.com/lifinance/perps-sdk/pull/340) [`2b59542`](https://github.com/lifinance/perps-sdk/commit/2b59542c930d886ea537f2d340801ffa0add78ae) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter `getAccount` now resolves when the venue rejects the SDK-owned auth token (stale local API key after the slot was re-registered elsewhere): the `accountLimits` and `referral/userReferrals` reads degrade to `undefined` with a logged warning, so `apiKeyRegistered: false` can render the re-register setup step instead of the whole account read failing. Caller-supplied token rejections and all other errors still propagate.

## 12.1.0

### Minor Changes

- [#333](https://github.com/lifinance/perps-sdk/pull/333) [`5c21cab`](https://github.com/lifinance/perps-sdk/commit/5c21cabd26735536f9c1c708e4229038e143bab6) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Load the Lighter signer binary without bundler configuration: the package now verifies the WASM preamble of the asset it resolved and re-resolves through the bundler's own asset pipeline when a dependency optimizer has relocated the module (Vite dev served its HTML fallback instead), and exports `loadLighterWasm()` for warming the signer up ahead of first use.

## 12.0.0

### Major Changes

- [#330](https://github.com/lifinance/perps-sdk/pull/330) [`e9328a6`](https://github.com/lifinance/perps-sdk/commit/e9328a6bc828ce26616ba9e718ee77ed534fed7c) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `mapInterval` now takes `OhlcvInterval` instead of a bare `string` in both the Lighter and Ondo providers, so a value that is not an SDK interval is now a compile error rather than a runtime `ValidationError`. Every real caller already passed an `OhlcvInterval` (`CandleSubscription.interval`), so this only tightens the type; the runtime rejection behaviour for venue-unsupported intervals is unchanged.

### Patch Changes

- Updated dependencies [[`6b2d8f5`](https://github.com/lifinance/perps-sdk/commit/6b2d8f5eea6afab6adae20da836d2cb0d3d8e51e), [`0a4b5eb`](https://github.com/lifinance/perps-sdk/commit/0a4b5eb0ef2cc01b1f4c30a0c6f7389227ed6c2d)]:
  - @lifi/perps-types@6.0.0

## 11.1.0

### Minor Changes

- [#322](https://github.com/lifinance/perps-sdk/pull/322) [`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Add TWAP action wrappers, preserve provider TWAP identifiers, sign Lighter TWAP actions, and read running TWAP parents directly from each venue.

### Patch Changes

- Updated dependencies [[`62c2437`](https://github.com/lifinance/perps-sdk/commit/62c2437b7a65cdb6566a9aa01500f75e59e10852), [`2ffedda`](https://github.com/lifinance/perps-sdk/commit/2ffedda30f1ec78a29d3cd5e05454732912651ea)]:
  - @lifi/perps-types@5.3.0

## 11.0.0

### Major Changes

- [#318](https://github.com/lifinance/perps-sdk/pull/318) [`394d1a7`](https://github.com/lifinance/perps-sdk/commit/394d1a723d26e328572b86547239509410791b40) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - **Breaking:** Remove the `referralCode` option from `LighterProviderOptions`. `getAccount` now resolves the expected Lighter referral code from the backend-owned `referralCode` on the current instance's `/providers` descriptor (selected by provider key, so Lighter RH never compares against mainnet attribution) instead of a compiled-in constructor option. The `/api/v1/referral/userReferrals` read stays SDK-direct and authenticated with the user's Lighter auth token — the token never transits the LI.FI backend — and `LighterAccountConfig.referralPresent` is `true` only when the authenticated `used_code` equals the runtime provider `referralCode`. When the runtime metadata carries no code or no auth token is available, the referral read is skipped and `referralPresent` is `false`.

## 10.0.0

### Major Changes

- [#314](https://github.com/lifinance/perps-sdk/pull/314) [`ab7b307`](https://github.com/lifinance/perps-sdk/commit/ab7b307fcca34b443fcb305da6fa1b3ef916e1c1) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter withdrawals now sign the caller's `(asset, route)` selection instead of a fixed USDC-out-of-perps default. `LtWithdrawWasmParams` requires `asset_index`, `route_type`, a decimal `amount` string, and the asset's `decimals`, `min_withdrawal_amount` and `symbol`; the signer rejects a route outside `{0, 1}` and any amount below the asset's minimum, and scales by that asset's own precision. `LtAccountAsset` now matches the live `/api/v1/account` payload (`margin_balance`, `multiplier`, and `margin_mode` as `'enabled' | 'disabled'`). New `PerpsClient.getWithdrawableBalances` lists the `(asset, route)` pairs an account can actually withdraw, and `Asset` carries the optional per-asset withdrawal metadata that read joins on.

### Patch Changes

- Updated dependencies [[`ab7b307`](https://github.com/lifinance/perps-sdk/commit/ab7b307fcca34b443fcb305da6fa1b3ef916e1c1)]:
  - @lifi/perps-types@5.1.0

## 9.0.0

### Major Changes

- [#312](https://github.com/lifinance/perps-sdk/pull/312) [`9b42425`](https://github.com/lifinance/perps-sdk/commit/9b42425299f0af6ac006a59ce9cf4c2fca0d2547) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - **Breaking:** Lighter provider plugins now own signing, key storage and WASM loading. `lighterProvider()` and the new `lighterRhProvider()` each create their own `LighterSigner`, provider-namespaced `LighterKeyStore` and `LighterReadOnlyTokenManager` from an SDK-owned deployment descriptor, so the two deployments coexist on one client without sharing keys, tokens, endpoints, signing chain ids or collateral. `LighterProviderOptions` now exposes only consumer-level overrides (`storage`, `restUrl`, `authToken`, token lifetimes, `referralCode`); the `signer`, `keyStore`, `readOnlyTokenOptions`, `providerKey`, `explorerTxBaseUrl` and WASM URL/source options are removed, along with the `LighterSigner` / `LighterKeyStore` / `LighterReadOnlyTokenManager` / `loadLighterWasm` exports and the `./wasm/*` subpath export. `LIGHTER_MAINNET_INSTANCE` / `lighterRhInstance()` / `LighterInstanceConfig` are replaced by `LIGHTER_MAINNET_DEPLOYMENT` / `LIGHTER_RH_DEPLOYMENT` / `LighterDeployment`, and `DEFAULT_LIGHTER_SIGNER_CHAIN_ID` by `LIGHTER_MAINNET_SIGNER_CHAIN_ID`; `LIGHTER_RH_SIGNER_CHAIN_ID` is 466324 per Lighter's published Python SDK v1.1.2 endpoint profile. Go's `wasm_exec.js` is packaged as build-generated text verified against the vendored source, and `lighter-signer.wasm` stays a separate asset the package resolves itself — Vite and Next.js builds emit it with no consumer `?url`/`?raw` imports or `public/` copy step.

## 8.2.1

### Patch Changes

- [#310](https://github.com/lifinance/perps-sdk/pull/310) [`ec3510c`](https://github.com/lifinance/perps-sdk/commit/ec3510cf031924d28384ab8a45a968eada482dce) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter `EVM_TX` actions (deposits) now sign through the end-user wallet on a provider configured without a `signer` or `keyStore`; those dependencies are required only by the `WASM_BLOB` arm.

## 8.2.0

### Minor Changes

- [#303](https://github.com/lifinance/perps-sdk/pull/303) [`438e8e2`](https://github.com/lifinance/perps-sdk/commit/438e8e29b40c7d1af7d9972adaf2f18379985a30) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Sign Lighter withdrawals, transfers and spot/perp route moves against the collateral asset of the instance doing the signing instead of a module-pinned USDC index, and report collateral balances per instance. `LighterInstanceConfig` now carries a `collateral` field (L2 asset index plus display symbol — USDC on mainnet, USDG on the Robinhood chain deployment), `LighterSigner` accepts a `collateralAssetIndex`, and `lighterAsset` accepts the owning instance's provider key.

### Patch Changes

- Updated dependencies [[`489cca0`](https://github.com/lifinance/perps-sdk/commit/489cca07a4bc5dc5f8eded7c43075e8bed596334)]:
  - @lifi/perps-types@5.0.0

## 8.1.0

### Minor Changes

- [#300](https://github.com/lifinance/perps-sdk/pull/300) [`2112c11`](https://github.com/lifinance/perps-sdk/commit/2112c1115e57324f2e1589472b72354217a891ea) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Surface the venue transaction behind a submitted action: a successful `ActionResult` now carries optional `txHash` and a fully-resolved `explorerLink`, so an integrator can link to the venue explorer straight after `executeAction` instead of waiting for the fill or activity row. The backend populates `txHash` only where the venue's canonical hash is known at submit time — Lighter, whose WASM signer computes it before the network call. Explorer resolution stays provider-owned through the new optional `PerpsProviderPlugin.resolveExplorerLink(txHash)` hook, which the Lighter plugin implements against its instance's `explorerTxBaseUrl`. Hyperliquid (hash assigned at block inclusion) and Ondo (offchain) implement no hook, so their results carry neither field — no placeholder links.

### Patch Changes

- Updated dependencies [[`2112c11`](https://github.com/lifinance/perps-sdk/commit/2112c1115e57324f2e1589472b72354217a891ea)]:
  - @lifi/perps-types@4.2.0

## 8.0.1

### Patch Changes

- [#299](https://github.com/lifinance/perps-sdk/pull/299) [`0f015d1`](https://github.com/lifinance/perps-sdk/commit/0f015d185ca2e785146383dbed63a5fff6796beb) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose `positionSupportsMarginAdjustment(position)` and `positionSupportsMarginRemoval(position)` as the stack's owned answer to whether an open position takes a margin adjustment, and in which direction. Clients gating an edit-margin affordance read these instead of inspecting `Position.marginMode` and `Position.market.positionMarginAdjustment` themselves, or calling `positionMarginConstraints` just to test its `undefined` return. `removableIsolatedMargin` and the Hyperliquid and Lighter `positionMarginConstraints` implementations now gate on the same predicates, so a client's affordance cannot diverge from what the venue accepts.

- Updated dependencies [[`0f015d1`](https://github.com/lifinance/perps-sdk/commit/0f015d185ca2e785146383dbed63a5fff6796beb)]:
  - @lifi/perps-types@4.1.0

## 8.0.0

### Major Changes

- [#290](https://github.com/lifinance/perps-sdk/pull/290) [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Model transfer-margin support and requirements as provider-owned contracts.

  `PerpsMarket` now declares whether position margin is unsupported, add-only, or add-and-remove. `Position` embeds that perpetual-market capability and the venue's exact current `initialMarginRequirement`, rather than forcing risk calculations through its display-oriented numeric `leverage`.

  Every provider plugin now implements `positionMarginConstraints(position)`. Hyperliquid supplies its documented `max(initial_margin_required, 0.1 * total_position_value)` retention rule and six-decimal amount increment; Lighter supplies its position's initial-margin requirement and six-decimal increment; Ondo returns `undefined` because it is cross-margined only.

  The shared `removableIsolatedMargin({ position, constraints })` helper validates the provider inputs, computes position equity in exact decimal arithmetic, retains the stricter initial-margin or notional-floor requirement, and rounds removable margin down to the venue amount increment.

  The previous `removableMargin(position)` exports are removed from the core SDK and provider packages. Callers must resolve the position's provider-owned constraints through `PerpsClient.positionMarginConstraints(position)` and pass them to `removableIsolatedMargin`.

### Minor Changes

- [#284](https://github.com/lifinance/perps-sdk/pull/284) [`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1) Thanks [@TristanNcl](https://github.com/TristanNcl)! - add getMarketSettings: the user's venue-side margin mode and leverage per market (Hyperliquid via activeAssetData, Lighter via the account position row)

### Patch Changes

- [#284](https://github.com/lifinance/perps-sdk/pull/284) [`4e9daa7`](https://github.com/lifinance/perps-sdk/commit/4e9daa7d3785a137a88160fc38d474011d5096d9) Thanks [@TristanNcl](https://github.com/TristanNcl)! - carry the venue's fractional position leverage as a display value instead of rounding it to a whole number

- [#283](https://github.com/lifinance/perps-sdk/pull/283) [`0828773`](https://github.com/lifinance/perps-sdk/commit/082877326116885966252a89a9b957364c4921a3) Thanks [@TristanNcl](https://github.com/TristanNcl)! - map available margin from free cross collateral instead of the withdrawable balance, which includes isolated positions' excess margin

- Updated dependencies [[`42e1854`](https://github.com/lifinance/perps-sdk/commit/42e1854091c255ccd7fb501639b4c616a928adb1), [`99ebba1`](https://github.com/lifinance/perps-sdk/commit/99ebba1590e75863b511533f4272a5c49c56a1ca), [`4e9daa7`](https://github.com/lifinance/perps-sdk/commit/4e9daa7d3785a137a88160fc38d474011d5096d9)]:
  - @lifi/perps-types@4.0.0
  - @lifi/perps-sdk@6.0.0

## 7.0.0

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

## 6.0.0

### Major Changes

- [#277](https://github.com/lifinance/perps-sdk/pull/277) [`448312a`](https://github.com/lifinance/perps-sdk/commit/448312a4a3521b30bdd97bef5068f5bd8ff33d71) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Expose exact-decimal `scaleToInteger` from the generic SDK and remove the Lighter-specific export.

## 5.1.1

### Patch Changes

- [#268](https://github.com/lifinance/perps-sdk/pull/268) [`25dc35c`](https://github.com/lifinance/perps-sdk/commit/25dc35cb08c337764a80f2fd6d5ff28fa2f6fced) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Scope `LighterKeyStore` persisted API-key storage by the resolved provider instance key so two Lighter instances sharing one adapter (e.g. `lighter` and `lighter-rh`) no longer clobber each other's key. The default `lighter` instance keeps its existing un-namespaced storage key, so current users are not orphaned; `LighterProvider` injects its resolved `providerKey` into the supplied keystore.

## 5.1.0

### Minor Changes

- [#260](https://github.com/lifinance/perps-sdk/pull/260) [`09cd2b6`](https://github.com/lifinance/perps-sdk/commit/09cd2b6bbe2061afc1903d3ac622722500f1fd92) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Provider packages can now declare setup actions they complete themselves via `PerpsProviderPlugin.internalSetupActions`. `PerpsClient.checkSetup` drains each such pending step in place — building, signing, and executing it with the provider's own credentials — and omits it from the returned setup list. A descriptor whose `signers` include `USER` is never treated as internal, and a failed internal step never blocks setup: it stays unsatisfied and is retried on a later `checkSetup`. The Ondo `SESSION` signing arm now executes backend-authored request-bearing steps with the stored session token.

## 5.0.0

### Minor Changes

- [#257](https://github.com/lifinance/perps-sdk/pull/257) [`e5df3a5`](https://github.com/lifinance/perps-sdk/commit/e5df3a5b712fa8c1f0ba55e7161318473de1c762) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Parametrize the Lighter provider by instance config so a single implementation can back multiple Lighter deployments. `lighterProvider()` and `lighterWsProvider()` now accept a `providerKey`, `restUrl`, `wsUrl`, and `explorerTxBaseUrl`, and `LighterSigner` accepts the signing chain id — each instance namespaces its own market/asset registries, retry policy, and auth-token caches. A bare `lighterProvider()` is unchanged (`type: 'lighter'`, mainnet URLs, chain id 304). Adds the `lighter-rh` (Robinhood chain) instance constants and the `lighterRhInstance()` factory, plus `explorerTxUrlFromBase` for resolving explorer links from a per-instance base URL.

### Patch Changes

- Updated dependencies [[`5b463da`](https://github.com/lifinance/perps-sdk/commit/5b463da30aeea57d05bc7daa84610a088c9425c0), [`e5df3a5`](https://github.com/lifinance/perps-sdk/commit/e5df3a5b712fa8c1f0ba55e7161318473de1c762)]:
  - @lifi/perps-types@3.0.0
  - @lifi/perps-sdk@4.0.0

## 4.0.1

### Patch Changes

- [#246](https://github.com/lifinance/perps-sdk/pull/246) [`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Polish package READMEs: consistent badge headers and structure, quick-start snippets, and a WebSocket section in the core README.

- [#256](https://github.com/lifinance/perps-sdk/pull/256) [`a0572ba`](https://github.com/lifinance/perps-sdk/commit/a0572bacfe2024f2bf165361e3ea1ea863cd5981) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - `LighterSigner.sign()` now throws for APPROVE_INTEGRATOR, which must go through `signApproveIntegrator()` — `sign()` cannot collect the required L1 user wallet signature, so blobs signed through it would reach the venue with an empty `L1Sig`.

- [#255](https://github.com/lifinance/perps-sdk/pull/255) [`85a9636`](https://github.com/lifinance/perps-sdk/commit/85a96365ba9f588df0b2921ccb02536cc222ba34) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter APPROVE_INTEGRATOR now collects the user's L1 wallet signature and embeds it as `txInfo.L1Sig` before submission, so the venue accepts the integrator approval.

- Updated dependencies [[`92372e2`](https://github.com/lifinance/perps-sdk/commit/92372e20db4b30c7cb94466979dd56ff5fc73a2b)]:
  - @lifi/perps-types@2.0.1

## 4.0.0

### Major Changes

- [#248](https://github.com/lifinance/perps-sdk/pull/248) [`de3b1ea`](https://github.com/lifinance/perps-sdk/commit/de3b1eaff1f3a58d3e4db6c8e59d4150a4d18639) Thanks [@aaronmboyd](https://github.com/aaronmboyd)! - Lighter WS account channels now resolve their auth token from the co-registered `lighterProvider()` plugin by default, so `lighterWsProvider()` authenticates positions/orders/fills with no manual wiring. **Breaking:** the `authProvider` option is renamed to `resolveAuthToken` and the `LighterAuthProvider` type to `LighterAuthTokenResolver`, with no back-compat alias; the option is now an override for standalone WS clients only.

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
