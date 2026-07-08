---
'@lifi/perps-sdk-provider-ondo': minor
---

Implement the Ondo `PerpsProviderPlugin`: `ondoProvider()` wires SIWE session login (`signActions` signs the challenge, stores the venue JWT client-side, and attaches it as a `Bearer` header on REST-call steps) and direct-to-venue authenticated reads — account snapshot with gross collateral semantics, positions, orders, fills, and merged funding/liquidation activity with a composite cursor. Logged-out reads degrade to empty pages without touching the venue; a 401 evicts the stored session so `accountExists` reports false. Quotes and fee display use Ondo's public base fee schedule (2 bps maker / 5 bps taker).
