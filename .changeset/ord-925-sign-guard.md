---
"@lifi/perps-sdk-provider-lighter": patch
---

`LighterSigner.sign()` now throws for APPROVE_INTEGRATOR, which must go through `signApproveIntegrator()` — `sign()` cannot collect the required L1 user wallet signature, so blobs signed through it would reach the venue with an empty `L1Sig`.
