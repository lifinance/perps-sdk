import { parse } from 'json-custom-numbers'

/**
 * Parse an Extended JSON body, reading each integer above 2^53 as its exact
 * decimal string. Extended order ids exceed 2^53 and `JSON.parse` silently
 * rounds them; Extended's own frontend uses the same library for this.
 *
 * @internal
 */
export function parseVenueJson(text: string): unknown {
  return parse(text, undefined, (_key, source) => {
    const value = Number(source)
    return Number.isInteger(value) &&
      !Number.isSafeInteger(value) &&
      /^-?\d+$/.test(source)
      ? source
      : value
  })
}
