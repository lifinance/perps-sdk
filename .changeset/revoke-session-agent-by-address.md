---
'@lifi/perps-types': minor
'@lifi/perps-sdk-provider-hyperliquid': patch
---

- `@lifi/perps-types`: `REVOKE_SESSION_AGENT` takes `RevokeSessionAgentParams` (`{ agentAddress: Address }`), so a revoke targets the session agent by address rather than by name.
- `@lifi/perps-sdk-provider-hyperliquid`: `resolveActionRequest` fills `REVOKE_SESSION_AGENT`'s `agentAddress` from the stored session agent and never provisions a new one. With no stored agent it throws `PerpsErrorCode.SDKError` ("Nothing to revoke"). Once the venue confirms the revoke, the plugin clears the stored agent key.
