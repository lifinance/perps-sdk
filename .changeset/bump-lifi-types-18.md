---
"@lifi/perps-sdk": patch
---

Bump `@lifi/types` from `17.86.0` to `^18.3.0`.

The dependency also moves from an exact pin to a caret range. The exact pin was the
reason downstream consumers installed a duplicate copy of `@lifi/types`: `@lifi/sdk`
declares its own exact pin, so two exact pins on different versions can never
deduplicate. A caret range on both sides lets the package manager resolve a single
shared `18.x` copy, and it removes the requirement that `@lifi/perps-sdk` and
`@lifi/sdk` bump `@lifi/types` in lockstep forever. The duplicate disappears once
`@lifi/sdk` also moves to a caret range; until then consumers of both packages still
resolve two copies.

`18.3.0` adds two optional request fields (`gasless?: boolean`) and changes nothing
else in the type surface. `ChainId` and `GasRecommendationResponse`, the only parts
of `@lifi/types` this package uses, are unchanged.
