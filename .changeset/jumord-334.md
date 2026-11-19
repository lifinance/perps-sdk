---
"@lifi/perps-sdk-provider-lighter": patch
---

Concurrent account reads for one wallet on one Lighter provider share one `/api/v1/account` request sequence and its result. This includes a failure after a venue 503.
