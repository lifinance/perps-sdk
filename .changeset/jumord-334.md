---
"@lifi/perps-sdk-provider-lighter": patch
---

Concurrent account reads for one wallet on one Lighter provider share one `/api/v1/account` request sequence and its result. This includes margin health reads and retries after a venue 503. A caller can cancel its own read without canceling other callers.
