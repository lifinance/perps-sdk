---
"@lifi/perps-sdk-provider-ondo": patch
"@lifi/perps-sdk": patch
---

Discard pending Ondo account-summary seeds and refreshes after subscription teardown or provider close, preventing stale balances from reaching a replacement wallet subscription, including same-wallet resubscriptions. Keep delayed authentication and wire acquisition from sending frames or changing shared references after their connection ownership ends. Preserve replacement WebSocket channel and wire registrations when an earlier open or send completes or fails after close.

Retain Ondo wallet bindings for pending and active authenticated channels, not just acquired wires. Keep delayed opens alive across another channel's linger expiry, and preserve sibling streams when a concurrent opening fails.
