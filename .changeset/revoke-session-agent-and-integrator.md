---
'@lifi/perps-types': minor
'@lifi/perps-sdk-provider-lighter': patch
'@lifi/perps-sdk-provider-hyperliquid': patch
---

- `@lifi/perps-types`: `ActionType.REVOKE_SESSION_AGENT` (`revokeSessionAgent`) and `ActionType.REVOKE_INTEGRATOR` (`revokeIntegrator`) are new, each with a `Record<string, never>` entry in `ActionParamsMap`.
- `@lifi/perps-sdk-provider-lighter`: `REVOKE_INTEGRATOR` is signed as Lighter's approve-integrator transaction (tx type 45) with the API key alone, using the step's `wasmSignParams` as given (every max fee and `approval_expiry` 0). No L1 signature is collected and the user wallet is never prompted.
- `@lifi/perps-sdk-provider-hyperliquid`: `REVOKE_SESSION_AGENT` is signed with the user wallet, the same way as `REVOKE_AGENT`, and is not a setup step in the account-config projection.
