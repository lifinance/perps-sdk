---
'@lifi/perps-sdk-provider-ondo': minor
---

Scaffold the Ondo Perps provider package: `OndoApiClient` (venue HTTP boundary unwrapping Ondo's `GenericResponse` envelope, `Authorization: Bearer` session auth, typed `OndoApiError`/`OndoSessionExpiredError`, retrying GETs but never POSTs), `completeSiweLogin` (signs the SIWE challenge and exchanges it for an Ondo session JWT directly against the venue), and `OndoTokenStore` (persists the JWT per wallet address and environment via a `StorageAdapter`; expired tokens read back as absent).
