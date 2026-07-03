---
'@lifi/perps-sdk': minor
---

Execute rest-call action steps client-side for `authToken` providers: new optional `PerpsProviderPlugin.executeRestCallActions` hook owns the venue call and result mapping, and `PerpsClient.execute` routes `SigningMethod.AUTH_TOKEN` descriptors through it. Credential headers never transit the LI.FI backend — the follow-up `executeAction` submission is bookkeeping-only with `headers` stripped, and a bookkeeping failure does not mask a venue success.
