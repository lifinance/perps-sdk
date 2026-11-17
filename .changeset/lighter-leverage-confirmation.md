---
"@lifi/perps-sdk": major
"@lifi/perps-sdk-provider-hyperliquid": minor
"@lifi/perps-sdk-provider-lighter": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Require `PerpsProviderPlugin.isLeverageEqual` on every custom provider plugin. Hyperliquid and Ondo compare decimal values exactly. Lighter compares the stored integer IMF and rejects unsupported requested precision and zero IMF values.
