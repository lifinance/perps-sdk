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

  it('keeps 2^53-1 as a number and reads 2^53 as a string', () => {
    expect(
      parseVenueJson(
        '[9007199254740991,-9007199254740991,9007199254740992,-9007199254740992]'
      )
    ).toEqual([
      9007199254740991,
      -9007199254740991,
      '9007199254740992',
      '-9007199254740992',
    ])
  })

  it('never splits a decimal into an integer and a fraction', () => {
    expect(
      parseVenueJson('[123.456,12345456,1802919074413810230.5,-0.000001]')
    ).toEqual([123.456, 12345456, Number('1802919074413810230.5'), -0.000001])
  })

  it('reads a long integer with an exponent as a number', () => {
    expect(parseVenueJson('[1802919074413810230e2,1E-7]')).toEqual([
      Number('1802919074413810230e2'),
      1e-7,
    ])
  })

  it('handles long integers in nested objects and arrays', () => {
    expect(
      parseVenueJson(
        '{"status":"OK","data":[{"id":1802919074413810230,"orders":[{"id":1802919074413810231,"qty":"0.5","price":65000.25,"leverage":10}]},{"id":42,"orders":[]}]}'
      )
    ).toEqual({
      status: 'OK',
      data: [
        {
          id: '1802919074413810230',
          orders: [
            {
              id: '1802919074413810231',
              qty: '0.5',
              price: 65000.25,
              leverage: 10,
            },
          ],
        },
        { id: 42, orders: [] },
      ],
    })
  })

  it('handles whitespace and newlines around numbers', () => {
    expect(
      parseVenueJson('{\n  "id" :\t1802919074413810230 ,\r\n  "n": 7\n}')
    ).toEqual({ id: '1802919074413810230', n: 7 })
  })

  it('reads a top-level long integer as a string', () => {
    expect(parseVenueJson('1802919074413810230')).toBe('1802919074413810230')
  })

  it('leaves true, false, null and unicode escapes untouched', () => {
    expect(
      parseVenueJson('{"a":true,"b":false,"c":null,"d":"\\u0031\\\\"}')
    ).toEqual({ a: true, b: false, c: null, d: '1\\' })
  })

  it('throws on invalid JSON like JSON.parse', () => {
    expect(() => parseVenueJson('{"id":')).toThrow(SyntaxError)
  })
})
