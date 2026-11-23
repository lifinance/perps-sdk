import { AccountMode, CrossMarginHealthStatus } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { buildCrossMarginHealth } from './crossMargin.js'

const BASE = {
  mode: AccountMode.SIMPLE,
  pool: { type: 'account', accountId: '7' },
  liquidationThreshold: '1',
} as const

describe('buildCrossMarginHealth', () => {
  it('divides maintenance margin by equity', () => {
    expect(
      buildCrossMarginHealth({
        ...BASE,
        maintenanceMargin: '25',
        equity: '100',
      })
    ).toEqual({
      ...BASE,
      status: CrossMarginHealthStatus.MEASURED,
      ratio: '0.25',
    })
  })

  it('gives a ratio equal to the threshold when equity equals maintenance margin', () => {
    expect(
      buildCrossMarginHealth({
        ...BASE,
        maintenanceMargin: '100.000001',
        equity: '100.000001',
      })
    ).toMatchObject({ status: CrossMarginHealthStatus.MEASURED, ratio: '1' })
  })

  it('gives a ratio above the threshold when equity is below maintenance margin', () => {
    expect(
      buildCrossMarginHealth({
        ...BASE,
        maintenanceMargin: '100.000001',
        equity: '100',
      })
    ).toMatchObject({
      status: CrossMarginHealthStatus.MEASURED,
      ratio: '1.00000001',
    })
  })

  it('rounds a repeating ratio half-up at 40 decimal places', () => {
    expect(
      buildCrossMarginHealth({ ...BASE, maintenanceMargin: '2', equity: '3' })
    ).toMatchObject({
      ratio: '0.6666666666666666666666666666666666666667',
    })
  })

  it('reports no exposure for zero maintenance margin, whatever the equity', () => {
    for (const equity of ['100', '0', '-5']) {
      expect(
        buildCrossMarginHealth({ ...BASE, maintenanceMargin: '0', equity })
      ).toEqual({ ...BASE, status: CrossMarginHealthStatus.NO_EXPOSURE })
    }
  })

  it('reports non-positive equity, not a ratio, for exposure with zero or negative equity', () => {
    for (const equity of ['0', '-0.005', '-250']) {
      expect(
        buildCrossMarginHealth({ ...BASE, maintenanceMargin: '10', equity })
      ).toEqual({
        ...BASE,
        status: CrossMarginHealthStatus.NON_POSITIVE_EQUITY,
      })
    }
  })

  it('reports unavailable for a missing or malformed input', () => {
    for (const [maintenanceMargin, equity] of [
      [undefined, '100'],
      ['10', undefined],
      ['n/a', '100'],
      ['10', '1e3'],
    ]) {
      expect(
        buildCrossMarginHealth({ ...BASE, maintenanceMargin, equity })
      ).toEqual({ ...BASE, status: CrossMarginHealthStatus.UNAVAILABLE })
    }
  })
})
