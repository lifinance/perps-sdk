import type { Address, Hex, PerpsTypedData } from './typedData.js'

export interface WithdrawalInput {
  destination: Address
  amount: string // e.g., "100.5" — units are $1 USDC
}

export interface CreateWithdrawalRequest {
  dex: string
  address: Address
  withdrawal: WithdrawalInput
}

export interface WithdrawalAction {
  action: string // "Withdraw"
  description?: string
  typedData: PerpsTypedData
}

export interface CreateWithdrawalResponse {
  action: WithdrawalAction
}

export interface SignedWithdrawal {
  action: string
  typedData: PerpsTypedData
  signature: Hex
}

export interface SubmitWithdrawalRequest {
  dex: string
  address: Address
  action: SignedWithdrawal
}

export interface WithdrawalResult {
  action: string
  success: boolean
  error?: string
}

export interface SubmitWithdrawalResponse {
  result: WithdrawalResult
}
