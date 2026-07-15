---
'@lifi/perps-sdk-provider-ondo': patch
---

Map the Ondo `POST /v1/api_keys` `secretKey` wire field to the stored `apiSecret` domain field at the boundary, and validate the record at write time. The mis-shaped record was previously evicted on read, so `REGISTER_API_KEY` never reported satisfied and HMAC signing used an empty secret.
