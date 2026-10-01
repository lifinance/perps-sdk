import Big from 'big.js'

/**
 * The transferable part of `balance`: capped at the provider-wide
 * `withdrawable` amount and floored at zero.
 *
 * @internal
 */
export const calculateTransferable = (withdrawable: Big, balance: Big): Big => {
  if (withdrawable.lt(0)) {
    return new Big(0)
  }
  return withdrawable.gt(balance) ? balance : withdrawable
}
