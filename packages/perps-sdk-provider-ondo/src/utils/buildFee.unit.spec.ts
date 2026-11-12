import { describe, expect, it, vi } from 'vitest'
import { buildFee } from './buildFee.js'

describe('buildFee', () => {
  it.each([
    { fee: '0.4', feeRebate: undefined, amount: '0.4' },
    { fee: '0.4', feeRebate: '0', amount: '0.4' },
    { fee: '0.4', feeRebate: '0.1', amount: '0.3' },
    { fee: '0.4', feeRebate: '0.5', amount: '-0.1' },
    {
      fee: '0.100000000000000001',
      feeRebate: '0.1',
      amount: '0.000000000000000001',
    },
  ])('maps a fee of $fee with rebate $feeRebate', ({
    fee,
    feeRebate,
    amount,
  }) => {
    const mapped = buildFee({ fee, feeRebate }, 'USDC')
    expect(mapped).toEqual({
      amount,
      asset: 'USDC',
      ...(feeRebate !== undefined ? { rebate: feeRebate } : {}),
    })
  })

  it.each([
    { fee: 'bad', feeRebate: undefined },
    { fee: '0.4', feeRebate: 'bad' },
    { fee: '', feeRebate: '0' },
    { fee: '0.4', feeRebate: '' },
  ])('omits a malformed fee ($fee, $feeRebate)', (row) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(buildFee(row, 'USD')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it.each([
    '-0.1',
    '-0.000000000000000001',
  ])('omits the fee and warns once when the rebate is negative (%s)', async (feeRebate) => {
    // A fresh module instance clears the warn-once memory.
    vi.resetModules()
    const { buildFee: freshBuildFee } = await import('./buildFee.js')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(freshBuildFee({ fee: '0.4', feeRebate }, 'USD')).toBeUndefined()
    expect(freshBuildFee({ fee: '0.4', feeRebate }, 'USD')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      `[ondo] \`feeRebate\` is negative, so the fee is absent: '${feeRebate}'`
    )
    warn.mockRestore()
  })
})
