---
'@lifi/perps-sdk': patch
'@lifi/perps-sdk-provider-lighter': patch
---

Preserve execution evidence across failures after actions have reached the venue.

- Lighter token-auth mutations report HTTP 5xx and responses without a valid integer result code as indeterminate, without recording a refusal, settling referral state, or retrying the write.
- EVM progress-callback failures retain the current transaction hash and submitted or accepted status alongside earlier confirmed legs.
- SDK explorer-link and post-signing setup-resolution failures retain known execution results. `PerpsExecutionError` preserves the originating provider's `tool` attribution.
