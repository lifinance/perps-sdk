---
'@lifi/perps-sdk-provider-lighter': minor
---

Lighter REST wire types now alias the generated models in `zklighter-perps`. The `Lt` prefix stays on every export. The four order enums (`LtOrderStatusEnum`, `LtOrderTypeEnum`, `LtOrderTimeInForceEnum`, `LtOrderTriggerStatusEnum`) are now string literal unions, so an unknown Lighter literal fails to compile. The package imports the generated models with `import type` only, so the build output holds no reference to `zklighter-perps`.
