---
'@lifi/perps-sdk-provider-ondo': patch
---

Request the `transfer` scope on the Ondo trading API key, so that `WITHDRAWAL` succeeds. On the next HMAC-signed action, the SDK revokes a stored key without the `transfer` scope and creates a replacement key. Concurrent signing calls for one address share one key creation.
