import { ActionType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  LT_TX_TYPE_APPROVE_INTEGRATOR,
  LT_TX_TYPE_BY_ACTION,
  LT_TX_TYPE_CANCEL_ALL_ORDERS,
  LT_TX_TYPE_CANCEL_ORDER,
  LT_TX_TYPE_CHANGE_PUB_KEY,
  LT_TX_TYPE_CREATE_ORDER,
  LT_TX_TYPE_MODIFY_ORDER,
  LT_TX_TYPE_TRANSFER,
  LT_TX_TYPE_UPDATE_ACCOUNT_ASSET_CONFIG,
  LT_TX_TYPE_UPDATE_ACCOUNT_CONFIG,
  LT_TX_TYPE_UPDATE_LEVERAGE,
  LT_TX_TYPE_UPDATE_MARGIN,
  LT_TX_TYPE_WITHDRAW,
} from '../index.js'

// `TxTypeL2*` values copied from lighter-go `types/txtypes/constants.go`.
const LIGHTER_GO_TX_TYPES = {
  TxTypeL2ChangePubKey: 8,
  TxTypeL2Transfer: 12,
  TxTypeL2Withdraw: 13,
  TxTypeL2CreateOrder: 14,
  TxTypeL2CancelOrder: 15,
  TxTypeL2CancelAllOrders: 16,
  TxTypeL2ModifyOrder: 17,
  TxTypeL2UpdateLeverage: 20,
  TxTypeL2UpdateMargin: 29,
  TxTypeL2UpdateAccountConfig: 41,
  TxTypeL2UpdateAccountAssetConfig: 42,
  TxTypeL2ApproveIntegrator: 45,
}

describe('Lighter tx types', () => {
  it('exports each tx type constant with its lighter-go value', () => {
    expect({
      TxTypeL2ChangePubKey: LT_TX_TYPE_CHANGE_PUB_KEY,
      TxTypeL2Transfer: LT_TX_TYPE_TRANSFER,
      TxTypeL2Withdraw: LT_TX_TYPE_WITHDRAW,
      TxTypeL2CreateOrder: LT_TX_TYPE_CREATE_ORDER,
      TxTypeL2CancelOrder: LT_TX_TYPE_CANCEL_ORDER,
      TxTypeL2CancelAllOrders: LT_TX_TYPE_CANCEL_ALL_ORDERS,
      TxTypeL2ModifyOrder: LT_TX_TYPE_MODIFY_ORDER,
      TxTypeL2UpdateLeverage: LT_TX_TYPE_UPDATE_LEVERAGE,
      TxTypeL2UpdateMargin: LT_TX_TYPE_UPDATE_MARGIN,
      TxTypeL2UpdateAccountConfig: LT_TX_TYPE_UPDATE_ACCOUNT_CONFIG,
      TxTypeL2UpdateAccountAssetConfig: LT_TX_TYPE_UPDATE_ACCOUNT_ASSET_CONFIG,
      TxTypeL2ApproveIntegrator: LT_TX_TYPE_APPROVE_INTEGRATOR,
    }).toStrictEqual(LIGHTER_GO_TX_TYPES)
  })

  it('maps each signed action to the lighter-go tx type of its tx', () => {
    expect(LT_TX_TYPE_BY_ACTION).toStrictEqual({
      [ActionType.REGISTER_API_KEY]: LIGHTER_GO_TX_TYPES.TxTypeL2ChangePubKey,
      [ActionType.TRANSFER]: LIGHTER_GO_TX_TYPES.TxTypeL2Transfer,
      [ActionType.SEND_ASSET]: LIGHTER_GO_TX_TYPES.TxTypeL2Transfer,
      [ActionType.WITHDRAWAL]: LIGHTER_GO_TX_TYPES.TxTypeL2Withdraw,
      [ActionType.PLACE_ORDER]: LIGHTER_GO_TX_TYPES.TxTypeL2CreateOrder,
      [ActionType.PLACE_TRIGGER_ORDER]: LIGHTER_GO_TX_TYPES.TxTypeL2CreateOrder,
      [ActionType.PLACE_TWAP_ORDER]: LIGHTER_GO_TX_TYPES.TxTypeL2CreateOrder,
      [ActionType.CANCEL_ORDER]: LIGHTER_GO_TX_TYPES.TxTypeL2CancelOrder,
      [ActionType.CANCEL_TWAP_ORDER]: LIGHTER_GO_TX_TYPES.TxTypeL2CancelOrder,
      [ActionType.CANCEL_ALL_ORDERS]:
        LIGHTER_GO_TX_TYPES.TxTypeL2CancelAllOrders,
      [ActionType.MODIFY_ORDER]: LIGHTER_GO_TX_TYPES.TxTypeL2ModifyOrder,
      [ActionType.UPDATE_LEVERAGE]: LIGHTER_GO_TX_TYPES.TxTypeL2UpdateLeverage,
      [ActionType.UPDATE_POSITION_MARGIN]:
        LIGHTER_GO_TX_TYPES.TxTypeL2UpdateMargin,
      [ActionType.ACCOUNT_MODE]:
        LIGHTER_GO_TX_TYPES.TxTypeL2UpdateAccountConfig,
      [ActionType.UPDATE_ASSET_COLLATERAL]:
        LIGHTER_GO_TX_TYPES.TxTypeL2UpdateAccountAssetConfig,
      [ActionType.APPROVE_INTEGRATOR]:
        LIGHTER_GO_TX_TYPES.TxTypeL2ApproveIntegrator,
      [ActionType.REVOKE_INTEGRATOR]:
        LIGHTER_GO_TX_TYPES.TxTypeL2ApproveIntegrator,
    })
  })

  it('freezes the action map', () => {
    expect(Object.isFrozen(LT_TX_TYPE_BY_ACTION)).toBe(true)
  })
})
