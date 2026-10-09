---
"@lifi/perps-sdk-provider-lighter": patch
---

Lighter and Lighter Robinhood funding rates are now decimal fractions, as the `FundingInfo.rate` and `FundingActivity.fundingRate` contracts say. Before, the provider passed the venue percent value through, so funding showed 100 times too high.
