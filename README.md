<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center">LI.FI Perps SDK</h1>

[**LI.FI Perps SDK**](https://public-perps-docs.mintlify.app/) is a TypeScript SDK for trading perpetuals across multiple DEXes through one unified interface. This repository is the pnpm + Changesets monorepo that builds and publishes it.

**Using the SDK?** Start with the [`@lifi/perps-sdk` package README](./packages/perps-sdk) for installation, quick start, and the realtime API, or read the [full documentation](https://public-perps-docs.mintlify.app/). The rest of this page is for working *on* the repository.

## Packages

Published packages live under [`packages/`](./packages). `@lifi/perps-types` sits at the base with zero dependencies; the core `@lifi/perps-sdk` depends on it; each provider plugin depends on the types directly and takes the core SDK as a peer dependency.

| Package | Install for | Description |
| --- | --- | --- |
| [`@lifi/perps-sdk`](./packages/perps-sdk/README.md) | every project | Core SDK — `PerpsClient`, service functions, realtime client |
| [`@lifi/perps-sdk-provider-hyperliquid`](./packages/perps-sdk-provider-hyperliquid/README.md) | Hyperliquid | Hyperliquid provider plugin |
| [`@lifi/perps-sdk-provider-lighter`](./packages/perps-sdk-provider-lighter/README.md) | Lighter | Lighter provider plugin |
| [`@lifi/perps-types`](./packages/perps-types/README.md) | (transitive) | Shared types; re-exported from `@lifi/perps-sdk` |

## Development

pnpm workspace — Node `>=24`. From the repository root:

| Command | Does |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm build` | Build every package (CJS + ESM + types) |
| `pnpm test` | Run all package tests (vitest) |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:cov` | Tests with coverage |
| `pnpm check` | Biome lint/format check |
| `pnpm check:write` | Biome auto-fix |
| `pnpm check:types` | TypeScript type checking across packages |
| `pnpm check:circular-deps` | madge circular-dependency check |
| `pnpm knip:check` | Report unused files, deps, and exports |

## Publishing

Releases are automated with [Changesets](https://github.com/changesets/changesets). You never edit versions or run `npm publish` by hand — you describe each change in a *changeset*, and CI ([`.github/workflows/publish.yaml`](./.github/workflows/publish.yaml)) versions and publishes from `main`.

### Every package change needs a changeset

After a change that affects a published package, add a changeset:

```bash
pnpm changeset
```

It asks which packages changed and the bump level for each, then writes a markdown file under `.changeset/`. Commit that file with your PR. A changeset records exactly two things:

| Field | Controls |
| --- | --- |
| package + `patch` / `minor` / `major` | the semver bump magnitude |
| summary | the changelog entry |

Choose the bump by consumer impact: `patch` for fixes, `minor` for backward-compatible additions, `major` for breaking changes.

A PR that touches no published code (CI, `examples/`, root config) needs no release — record that explicitly with an empty changeset so the intent is visible:

```bash
pnpm changeset --empty
```

### How a release happens

1. Merge your PR (with its changeset) to `main`.
2. CI opens or refreshes a **`chore: version packages`** PR that consumes all pending changesets, bumps versions, and updates changelogs.
3. Merge that PR → CI publishes the bumped packages to npm (OIDC trusted publishing) and creates GitHub releases.

### Release channels

The bump level never selects a channel — the channel is whole-repo state, not a per-changeset field.

| Channel | npm dist-tag | How |
| --- | --- | --- |
| Stable | `latest` | default; merge changesets as above |
| Preview | `preview` | label a PR `release-preview` → publishes a throwaway `0.0.0-preview-<sha>` |
| Alpha / Beta | `alpha` / `beta` | enter pre-release mode (below) |

For a sustained pre-release line, enter pre mode on `main`:

```bash
pnpm changeset pre enter beta   # commit the generated .changeset/pre.json
# every release from main is now X.Y.Z-beta.N on the `beta` dist-tag
pnpm changeset pre exit         # commit the deletion to return to stable
```

While in pre mode, authors still write ordinary changesets — pre mode applies the `-beta.N` suffix to all of them. Consumers opt in with `npm i @lifi/perps-sdk@beta`.

## Examples

Runnable scripts in [`examples/`](./examples):

| Script | What it shows |
| --- | --- |
| [`market-data.ts`](./examples/market-data.ts) | Fetching markets, assets, prices, orderbook, OHLCV |
| [`account-data.ts`](./examples/account-data.ts) | Account state, positions, orders, fills |
| [`agent-trading.ts`](./examples/agent-trading.ts) | Full setup flow + placing and cancelling orders |
| [`error-handling.ts`](./examples/error-handling.ts) | Handling `PerpsError` codes and retries |
| [`custom-storage.ts`](./examples/custom-storage.ts) | Plugging in a custom credential store |
| [`websocket-subscriptions.ts`](./examples/websocket-subscriptions.ts) | Realtime prices, orderbook, multi-listener dedup, status |

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
