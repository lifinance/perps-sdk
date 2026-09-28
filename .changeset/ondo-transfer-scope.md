---
'@lifi/perps-sdk-provider-ondo': patch
---

Request the `transfer` scope on the Ondo trading API key, so that `WITHDRAWAL` succeeds. A stored key without the `transfer` scope reads back as absent, and the SDK creates a replacement key on the next HMAC-signed action.
