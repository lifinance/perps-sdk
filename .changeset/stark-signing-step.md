---
"@lifi/perps-types": minor
---

Add the Stark signing step for venues that settle on Starknet (Extended first).

- **perps-types**: add `SigningMethod.STARK` and `StarkActionStep`. The step's `stark` key holds a venue request and a list of `StarkMessage` items (order, transfer, or withdrawal fields). The provider signs each message with the account's Stark key, writes the signature into the request body at `signaturePath`, and sends the request to the venue with a client-held API key. No signed step goes to the backend, so `executeAction` is skipped. An empty message list marks a request that the API key alone authorizes, for example a cancel.
