# Lighter REST CORS Probe

Verifies that browser-direct calls to Lighter's public REST API are viable
from arbitrary widget-embedding origins (no server-side proxy required).

This file is a temporary home for the findings while the
`packages/perps-sdk-provider-lighter/` workspace package does not yet exist
on `beta` (the monorepo scaffold has not landed). Once that package
lands, copy the findings into
`packages/perps-sdk-provider-lighter/README.md` and delete this file.

## Result

Green light. Lighter's public REST endpoints respond with permissive CORS
headers — both wildcard (`*`) on simple GETs and reflected-origin on
preflight (`OPTIONS`) — covering every origin we threw at it (widget
embedders, `app.li.fi`, `localhost:5173`, an unrelated `*.xyz`).

The Lighter provider package can call Lighter REST directly from the
browser. No server-side proxy fallback is required for the endpoints
listed below.

## Probe parameters

- Host: `https://mainnet.zklighter.elliot.ai` (sourced from
  `lifi-perps-backend/src/config/index.ts → lighterApi`)
- Foreign origins tested: `https://widget.example.com`, `https://app.li.fi`,
  `http://localhost:5173`, `https://random-attacker.xyz`
- Date: 2026-05-21
- Method: `curl -D -` capturing response headers; both GET and OPTIONS
  (CORS preflight) issued.

## Endpoints covered

The five endpoints named in the acceptance criteria, plus a preflight on
the orderbook endpoint to verify non-simple request flow.

| Endpoint               | Path                     | Status returned   | `Access-Control-Allow-Origin` |
|------------------------|--------------------------|-------------------|-------------------------------|
| Account fetch          | `/api/v1/account`        | 400 (no account)  | `*`                           |
| Orderbook orders       | `/api/v1/orderBookOrders`| 200               | `*`                           |
| Candles                | `/api/v1/candles`        | 200               | `*`                           |
| Trades                 | `/api/v1/trades`         | 400 (param shape) | `*`                           |
| Position funding       | `/api/v1/positionFunding`| 400 (param shape) | `*`                           |

The 400s for `account`, `trades`, and `positionFunding` reflect synthetic
probe inputs (placeholder `l1_address`, missing required filters) — they
are unrelated to CORS. The CORS headers were emitted on the 400 responses
too, which is what matters: errored responses must still carry CORS
headers or browsers will swallow the error body.

## Full CORS response (GET, simple request)

```
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Origin, X-CSRF-Token, Authorization, AccessToken, Token, Range
Access-Control-Allow-Methods: GET, HEAD, POST, PATCH, PUT, DELETE
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: Content-Length, Access-Control-Allow-Origin, Access-Control-Allow-Headers
Access-Control-Max-Age: 86400
```

## Preflight (OPTIONS) response

The preflight reflects the request's `Origin` back as
`Access-Control-Allow-Origin` (rather than `*`) and emits
`Access-Control-Allow-Credentials: true`, which is the credentialed-CORS
pattern. Every origin we tried was reflected unchanged.

```
HTTP/1.1 204 No Content
Vary: Origin
Vary: Access-Control-Request-Method
Vary: Access-Control-Request-Headers
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Origin, X-CSRF-Token, Authorization, AccessToken, Token, Range
Access-Control-Allow-Methods: GET, HEAD, POST, PATCH, PUT, DELETE
Access-Control-Allow-Origin: <echoed request Origin>
Access-Control-Expose-Headers: Content-Length, Access-Control-Allow-Origin, Access-Control-Allow-Headers
Access-Control-Max-Age: 86400
```

The preflight response carries a duplicate `Access-Control-Allow-Headers`
line (two values, one from CloudFront, one from the origin server). Both
are permissive supersets of what the SDK sends; browsers accept either.
Not a functional issue, but worth noting if a future SDK change starts
relying on a less-common request header.

## Implications for the Lighter provider package

- Direct browser-to-Lighter calls are supported. No proxy.
- Bearer-prefixed `Authorization` is allowed (already in the wildcard
  allow-list), as is the unprefixed `Token` header — relevant if the SDK
  ever needs to switch transport. Today the auth-gated endpoints take
  the token as an `auth` query param (see
  `lifi-perps-backend/src/providers/lighter/services/lighter.services.apiClient.ts`),
  which is even simpler from a CORS standpoint.
- Credentialed requests (`fetch(..., { credentials: 'include' })` /
  `withCredentials: true`) are technically permitted by the preflight, but
  the SDK should NOT set credentials mode on these calls — it isn't needed
  (auth flows through the query param or bearer header, not cookies) and
  setting it unnecessarily restricts the wildcard fallback on simple GETs.

## Reproducer

```bash
HOST="https://mainnet.zklighter.elliot.ai"
ORIGIN="https://widget.example.com"

# Simple GET (CORS headers come back with the response):
curl -sS -D - -o /dev/null -H "Origin: $ORIGIN" \
  "$HOST/api/v1/orderBookOrders?market_id=1&limit=1"

# Preflight (browsers fire this for any non-simple request):
curl -sS -D - -o /dev/null -X OPTIONS \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type,authorization" \
  "$HOST/api/v1/orderBookOrders?market_id=1&limit=1"
```

## Out of scope (followed up elsewhere if needed)

- WebSocket origin policy. The wss endpoint
  (`wss://mainnet.zklighter.elliot.ai/stream`) is not bound by CORS in
  the same way; if the provider package adds WS subscriptions, verify
  the WS handshake separately.
- `testnet.zklighter.elliot.ai`. Not probed. Lighter typically mirrors
  CORS policy across environments, but re-run the reproducer above
  against testnet before relying on it.
- Rate-limiting under the wildcard. Lighter may enforce per-IP /
  per-origin limits that don't show up in a one-shot probe.
