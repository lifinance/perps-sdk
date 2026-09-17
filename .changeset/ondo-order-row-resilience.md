---
"@lifi/perps-sdk-provider-ondo": patch
---

An order row the mapper rejects, such as a lifecycle state the SDK does not carry, is now dropped instead of failing the whole read. `getOrders` warns once per distinct message, and the WebSocket order handler drops the row from the frame. A WebSocket order update whose market the registry cannot resolve now retires its own active entry when the row is terminal.
