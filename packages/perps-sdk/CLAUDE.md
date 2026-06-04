# `@lifi/perps-sdk` — Conventions

## Where types go

Shared types are **defined once** under `src/types/{config,provider,api}.ts`, split by audience, **exported once**, and surfaced **only** by `src/index.ts`. No re-export hops between type homes.

- `src/types/config.ts` — SDK configuration primitives (`PerpsClientSigner`, `ProviderConfig`, `ProviderConfigs`, `RequestInterceptor`, `SDKRequestOptions`, `PerpsBaseConfig`). Leaf module: imports no other type home.
- `src/types/provider.ts` — the provider SPI and low-level client (`PerpsProviderPlugin`, `PerpsProvider`, `PerpsSDKClient`, `SignActionsContext`, `ActionSignerContribution`, the `ProviderGet*Params`). Imports `config.ts` only.
- `src/types/api.ts` — consumer-facing API params/results (`PerpsConfig`, `PerpsClientOptions`, `PlaceOrderParams`, `WithdrawParams`, …). Imports `config.ts` and `provider.ts`.

Dependency direction is strictly `config.ts ← provider.ts ← api.ts`; `pnpm check:circular-deps` enforces it.

Function-local `*Params` types stay colocated in their `src/services/*.ts` source. Implementation files (e.g. `src/client/createPerpsClient.ts`) define **no** shared types and re-export none.

Wire shapes — the backend's request/response contracts — live in `@lifi/perps-types`, which is zero-dependency and **must not** gain viem or other runtime coupling. Never put viem- or transport-coupled SDK types there.
