---
"@lifi/perps-sdk": minor
"@lifi/perps-sdk-provider-hyperliquid": minor
"@lifi/perps-sdk-provider-lighter": minor
---

Unify the account-summary surface on a single `getAccountSummary` name. The provider-interface method, the `PerpsClient` method, and both providers' standalone exports (formerly `getPortfolioSummary`, `summarizeHyperliquidAccount`, and `summarizeLighterAccount`) are now all named `getAccountSummary`. The result type `AccountSummary` is unchanged. This is a rename only — no behavioural change.
