---
"@lifi/perps-types": minor
---

Add `ExtendedAccountConfig` and `ExtendedAccountBalance`, and add `ExtendedAccountConfig` to the `AccountConfig` union. A consumer with an exhaustive switch on `AccountConfig.provider` must handle `'extended'`.
