---
'@lifi/perps-types': minor
'@lifi/perps-sdk': minor
'@lifi/perps-sdk-provider-ondo': minor
'@lifi/perps-sdk-provider-lighter': patch
'@lifi/perps-sdk-provider-hyperliquid': patch
---

Surface Ondo venue-terms acceptance and API-key creation as explicit setup steps.

- **perps-types**: add `ActionType.ACCEPT_PROVIDER_TERMS` (provider-level venue terms, distinct from the app-level `META_ACCEPT_TERMS`), `SigningMethod.SESSION` (client-only venue REST authorized by a stored provider session token), and `SessionActionStep` — a marker step carrying no request material, so a backend-authored path or body can never be executed with the client's bearer token. `OndoAccountConfig` gains required `termsAccepted` and `apiKeyRegistered` flags. The `ActionResult` failure variant gains an optional structured `errorCode`.
- **perps-sdk**: new optional plugin hook `onExecuteResults(address, results)`, invoked after every `executeAction` round-trip on both the execute and provider-setup paths, so plugins can react to structured failures.
- **perps-sdk-provider-ondo**: venue-terms acceptance moves out of the SIWE login (no more implicit `POST /v1/agreement` on first login) and API-key creation out of lazy first-use minting into explicit `SESSION`-signed setup steps executed directly against the venue; the lazy mint remains as a headless fallback. `getAccount` reports `termsAccepted` (from the login token's `newAccount` flag) and `apiKeyRegistered` (local key presence). A stored API key is evicted when an execute result carries `errorCode: Unauthorized`, so the `REGISTER_API_KEY` setup step re-stages instead of every action failing.
- **perps-sdk-provider-lighter / -hyperliquid**: exhaustive `ActionType` projections extended for the new member (rejected as unsupported).
