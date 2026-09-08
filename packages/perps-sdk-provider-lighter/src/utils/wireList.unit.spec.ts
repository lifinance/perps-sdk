import { describe, expect, it } from 'vitest'
import { wireList } from './wireList.js'

describe('wireList', () => {
  it('reads a null wire list as an empty array', () => {
    expect(wireList<number>(null)).toEqual([])
  })

  it('reads an absent wire list as an empty array', () => {
    expect(wireList<number>(undefined)).toEqual([])
  })

  it('returns a populated wire list unchanged', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    expect(wireList(rows)).toBe(rows)
  })

  it('returns an already-empty wire list unchanged', () => {
    const rows: number[] = []
    expect(wireList(rows)).toBe(rows)
  })
})
