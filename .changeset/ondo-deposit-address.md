---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Add the Ondo `CREATE_DEPOSIT_ADDRESS` session marker and client-side deposit-address provisioning flow. The shared `SessionActionStep` type now carries the fixed Ethereum USDC margin-wallet policy for this action, and the Ondo account config exposes the canonical provisioned address.
