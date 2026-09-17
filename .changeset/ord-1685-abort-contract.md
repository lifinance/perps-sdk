---
"@lifi/perps-sdk": minor
---

Export `isAbortError` so a provider transport can tell a caller abort from a network failure. The core `request` already rethrows an abort untouched instead of wrapping it as a `ServerError`; the predicate that decides it is now public, so a provider transport honours the same contract without re-implementing it.
