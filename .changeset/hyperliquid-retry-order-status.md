---
"@lifi/perps-sdk": minor
"@lifi/perps-sdk-provider-hyperliquid": patch
---

Add `retryWithBackoff`, which runs an async function again after a failure, with a delay that doubles before each retry. The Hyperliquid order stream uses it: when `orderStatus` does not know a new order yet, the stream reads the order again before it drops the row. Before, the stream dropped a new order at once, and the order was missing until the next orders read.
