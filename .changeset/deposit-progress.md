---
'@lifi/perps-sdk': minor
'@lifi/perps-sdk-provider-lighter': minor
---

Add an optional `onProgress` sink to `PerpsClient.execute()` (new public `SignActionProgress` type, carried on `SignActionsContext`). Lighter's `EVM_TX` signer emits `submitted`/`confirmed` per broadcast leg (approve, deposit), so consumers can render a live per-transaction deposit stepper.
