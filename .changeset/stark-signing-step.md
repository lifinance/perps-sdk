---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-ondo": patch
"@lifi/perps-sdk-provider-lighter": patch
"@lifi/perps-sdk-provider-hyperliquid": patch
---

Add the Stark signing step for venues that settle on Starknet (Extended first).

- **perps-types**: add `SigningMethod.STARK`, `StarkActionStep` and `StarkSignedActionStep`.
  - `StarkActionStep`: the `stark` key holds a backend-built venue request and a list of `StarkMessage` items (order, transfer, or withdrawal fields). The provider signs each message with the account's Stark key and writes the signature into the request body at `signaturePath`. An empty message list marks a request that the API key alone authorizes, for example a cancel.
  - `StarkSignedActionStep`: the signed request for `executeAction`. When the provider already sent the request to the venue with its client-held API key, `clientSent` carries the venue order id, and the backend only records the request. Without `clientSent`, the backend sends the request.
- **perps-types**: add `ActionType.CREATE_ACCOUNT`, for a venue that opens the account in a separate step (Extended onboarding).
- **perps-sdk-provider-ondo**, **perps-sdk-provider-lighter**, **perps-sdk-provider-hyperliquid**: the account-config projection refuses `CREATE_ACCOUNT` as a setup descriptor, like other actions that the venue does not use.
