import { describe, expect, it } from 'vitest'
import { parseVenueJson } from './parseVenueJson.js'

describe('parseVenueJson', () => {
  it('reads an integer above 2^53 as its exact decimal string', () => {
    expect(
      parseVenueJson('{"status":"OK","data":{"id":1802919074413810230}}')
    ).toEqual({ status: 'OK', data: { id: '1802919074413810230' } })
  })

  it('keeps short integers, decimals and exponents as numbers', () => {
    expect(parseVenueJson('[330870,-12,0.5,1e21,1234.5]')).toEqual([
      330870, -12, 0.5, 1e21, 1234.5,
    ])
  })

  it('leaves digits inside strings unchanged, escaped quotes included', () => {
    expect(
      parseVenueJson('{"a":"x\\"1802919074413810230","b":"-99999999999999999"}')
    ).toEqual({ a: 'x"1802919074413810230', b: '-99999999999999999' })
  })

  it('reads a negative long integer as a string', () => {
    expect(parseVenueJson('{"amount":-1802919074413810230}')).toEqual({
      amount: '-1802919074413810230',
    })
  })
})
