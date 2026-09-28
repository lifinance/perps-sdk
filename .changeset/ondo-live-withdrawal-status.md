---
"@lifi/perps-sdk-provider-ondo": patch
---

The Ondo ledger now shows live withdrawals. The live `GET /v1/wallet/withdrawals` API sends the `WITHDRAWAL_PENDING` and `WITHDRAWAL_SUCCESS` statuses, which the REST spec does not list, and the activity mapper dropped each row with one of those statuses. `OndoWithdrawalStatus` now includes both values. Each row now reaches the ledger with its explorer link from `txid`.
