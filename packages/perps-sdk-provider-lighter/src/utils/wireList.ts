/**
 * Read a Lighter wire list member. Lighter serializes an empty list as JSON
 * `null` rather than `[]`, so every list the SDK reads off a REST body passes
 * through this at the response boundary and every mapper downstream works on a
 * real array.
 *
 * @internal
 */
export const wireList = <T>(value: T[] | null | undefined): T[] => value ?? []
