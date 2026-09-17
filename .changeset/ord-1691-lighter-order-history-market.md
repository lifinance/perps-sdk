---
'@lifi/perps-sdk-provider-lighter': patch
---

Drop a Lighter order row whose market the registry cannot resolve, instead of rejecting the whole order page. One delisted market that the backend market list omits no longer empties the order history. The registry warns once per unresolved id. A row whose market is delisted still resolves, so it stays in the response.
