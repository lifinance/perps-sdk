// Order shapes returned by Lighter's REST API.
// Lighter serializes an empty list as JSON `null`, so list members are nullable.

import type {
  Order,
  OrderStatusEnum,
  OrderTimeInForceEnum,
  OrderTriggerStatusEnum,
  OrderTypeEnum,
} from 'zklighter-perps/models/Order'
import type { SimpleOrder } from 'zklighter-perps/models/SimpleOrder'

/**
 * Lifecycle status Lighter reports on an order. Every `canceled-*` member
 * names the venue rule that ended the order.
 *
 * @public
 */
export type LtOrderStatusEnum = OrderStatusEnum

/**
 * Order type Lighter reports on the wire, in its hyphenated spelling.
 *
 * @public
 */
export type LtOrderTypeEnum = OrderTypeEnum

/**
 * Time-in-force Lighter reports on the wire, in its hyphenated spelling.
 *
 * @public
 */
export type LtOrderTimeInForceEnum = OrderTimeInForceEnum

/**
 * Trigger state Lighter reports on an order. `'na'` marks a regular order;
 * every other member marks an order with trigger semantics.
 *
 * @public
 */
export type LtOrderTriggerStatusEnum = OrderTriggerStatusEnum

/**
 * Order payload returned by Lighter's REST API. Amounts and prices are decimal
 * strings in market precision. `order_expiry` is an absolute Unix-millisecond
 * expiry; `created_at` and `updated_at` are Unix seconds. `transaction_time` is
 * a Unix microsecond timestamp. Lighter documents no unit for `timestamp` or
 * `trigger_time`, and every endpoint that returns this row is auth-gated, so
 * no public probe can observe either value.
 *
 * @public
 */
export type LtOrder = Order

/**
 * Paginated order-history response from Lighter. `next_cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtOrdersResponse {
  code: number
  next_cursor: string
  orders: LtOrder[] | null
}

/**
 * Order-lookup response from Lighter's `accountOrders` path. The lookup takes
 * up to 20 `client_order_indexes` rather than a page, so it carries no cursor.
 * It reaches the last 10K active orders with no time bound, and the last 1K
 * inactive orders from the past 24 hours.
 *
 * @public
 */
export interface LtAccountOrdersResponse {
  code: number
  orders: LtOrder[] | null
}

/**
 * Single order-book level returned by Lighter. Amounts and prices are decimal
 * strings in the market's native precision; `order_expiry` is an absolute
 * Unix-millisecond expiry. Lighter documents no unit for `transaction_time`,
 * and every resting order this endpoint returns reports the member as zero.
 *
 * @public
 */
export type LtOrderBookOrder = SimpleOrder

/**
 * Order-book response containing separate ask and bid levels plus their counts.
 *
 * @public
 */
export interface LtOrderBookOrdersResponse {
  code: number
  total_asks: number
  asks: LtOrderBookOrder[]
  total_bids: number
  bids: LtOrderBookOrder[]
}
