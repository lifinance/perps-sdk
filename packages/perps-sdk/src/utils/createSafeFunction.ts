/**
 * Wrap a throwing function so that it gives `undefined` in place of a throw.
 * The wrapper logs a warning with `name` and the error, which carries the
 * stack trace.
 *
 * @public
 */
export function createSafeFunction<Args extends unknown[], Result>(
  name: string,
  throwingFunction: (...args: Args) => Result
): (...args: Args) => Result | undefined {
  return (...args) => {
    try {
      return throwingFunction(...args)
    } catch (error) {
      console.warn(`[perps-sdk] ${name} failed`, error)
      return undefined
    }
  }
}
