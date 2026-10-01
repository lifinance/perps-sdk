---
'@lifi/perps-sdk': patch
---

Reuse fresh asset and market registry snapshots in Node according to HTTP max-age, Age, and Date headers. Keep reference caches isolated by client, provider, backend URL, and SDK credentials, and bypass reuse for dynamic request hooks. Preserve browser HTTP caching and reject failed expired refreshes rather than serving stale data.
