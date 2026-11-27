const JSON_NUMBER = /-?\d+(\.\d+)?([eE][+-]?\d+)?/y

/**
 * Parse an Extended JSON body, reading each integer that is too long for a
 * `number` as a decimal string. Extended order ids are larger than 2^53, and
 * `JSON.parse` silently rounds them.
 *
 * @internal
 */
export function parseVenueJson(text: string): unknown {
  let quoted = ''
  let inString = false
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (inString) {
      quoted += char
      if (char === '\\') {
        quoted += text[index + 1] ?? ''
        index += 2
        continue
      }
      inString = char !== '"'
      index += 1
      continue
    }
    if (char === '"') {
      inString = true
      quoted += char
      index += 1
      continue
    }
    JSON_NUMBER.lastIndex = index
    const number = JSON_NUMBER.exec(text)
    if (number !== null) {
      const isLongInteger =
        number[1] === undefined &&
        number[2] === undefined &&
        !Number.isSafeInteger(Number(number[0]))
      quoted += isLongInteger ? `"${number[0]}"` : number[0]
      index += number[0].length
      continue
    }
    quoted += char
    index += 1
  }
  return JSON.parse(quoted)
}
