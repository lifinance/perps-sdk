/**
 * Exhaustiveness helper for discriminated-union switches.
 *
 * Use in the `default` arm of a `switch (discriminant)` block: TypeScript
 * narrows the variable to `never` when every case is handled, so adding a
 * new variant to the union without a corresponding `case` becomes a
 * compile error here. At runtime — if reached — throw rather than return
 * silently; the throw is unreachable in well-typed code but flags
 * upstream-shape drift loudly.
 *
 * @example
 *   switch (config.provider) {
 *     case 'hyperliquid': return projectHyperliquid(config)
 *     case 'lighter': return projectLighter(config)
 *     default: return assertNever(config)
 *   }
 * @internal
 */
export function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
  )
}
