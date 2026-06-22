---
"@lifi/perps-sdk-provider-lighter": major
---

First stable release of the Lighter provider plugin for the LI.FI Perps SDK. Register it on `PerpsClient` via the `PerpsProvider` plugin SPI to route Lighter calls.

- Bundled Go WASM signer with a persisted API-key store, signed withdrawals and transfers, and an auth-token model: a standard token plus a long-lived read-only token created and persisted through your storage adapter.
