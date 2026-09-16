---
"@lifi/perps-sdk-provider-ondo": patch
---

`getOrders` sends `activeOnly=true` for active-only reads and no `status` query for reads that include a terminal status, because the server rejects a `status` query. The SDK still filters the rows by the requested statuses. The order cursor now names the regular order source `active` or `all`; a cursor from a previous version is rejected as malformed.
