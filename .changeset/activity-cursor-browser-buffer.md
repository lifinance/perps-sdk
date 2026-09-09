---
"@lifi/perps-sdk-provider-lighter": patch
"@lifi/perps-sdk-provider-ondo": patch
---

Encode and decode the activity cursor with `btoa`/`atob` only.

`encodeActivityCursor` and `decodeActivityCursor` took the Node `Buffer` path
whenever a global `Buffer` existed. A wallet dependency installs the npm
`buffer` polyfill as `window.Buffer` in the browser, and that polyfill has no
`base64url` encoding, so `getActivity` threw `TypeError: Unknown encoding:
base64url` as soon as a venue returned a page cursor. The codec no longer
consults `Buffer`.
