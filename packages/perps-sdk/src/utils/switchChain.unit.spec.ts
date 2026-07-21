import type { ActionStep, ProviderAction } from '@lifi/perps-types'
import {
  ActionType,
  PerpsErrorCode,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import type { Account, EIP1193RequestFn } from 'viem'
import { createWalletClient, custom } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'
import type { PerpsClientSigner } from '../types/config.js'
import { switchSigningChain, userEip712TargetChainId } from './switchChain.js'

const account: Account = privateKeyToAccount(`0x${'11'.repeat(32)}`)

/**
 * Wallet whose `eth_chainId` reports `chainId`; every other RPC call is
 * unexpected. `request` is a spy so tests can assert whether an RPC was made.
 */
function walletOnChain(chainId: number): PerpsClientSigner {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === 'eth_chainId') {
      return `0x${chainId.toString(16)}`
    }
    throw new Error(`unexpected RPC: ${method}`)
  }) as unknown as EIP1193RequestFn
  return createWalletClient({
    account,
    transport: custom({ request }),
  })
}

/** Wallet whose transport throws on any RPC — proves no RPC was attempted. */
function inertWallet(): PerpsClientSigner {
  return createWalletClient({
    account,
    transport: custom({
      request: (async () => {
        throw new Error('RPC must not be called')
      }) as unknown as EIP1193RequestFn,
    }),
  })
}

function eip712Step(chainId?: number): ActionStep {
  return {
    action: ActionType.WITHDRAWAL,
    typedData: {
      domain: chainId === undefined ? {} : { chainId },
      types: { X: [{ name: 'x', type: 'uint256' }] },
      primaryType: 'X',
      message: { x: 0 },
    },
  }
}

const userEip712: ProviderAction = {
  type: ActionType.WITHDRAWAL,
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
}

describe('userEip712TargetChainId', () => {
  it('returns the first numeric domain.chainId for a USER-signed EIP-712 batch', () => {
    expect(
      userEip712TargetChainId(userEip712, [eip712Step(), eip712Step(42161)])
    ).toBe(42161)
  })

  it('returns undefined for an AGENT-signed batch', () => {
    const agent: ProviderAction = {
      type: ActionType.PLACE_ORDER,
      signers: [PerpsSigner.SDK],
      signingMethod: SigningMethod.EIP712,
    }
    expect(userEip712TargetChainId(agent, [eip712Step(42161)])).toBeUndefined()
  })

  it('returns undefined for a non-EIP-712 signing method', () => {
    const wasm: ProviderAction = {
      type: ActionType.REGISTER_API_KEY,
      signers: [PerpsSigner.USER],
      signingMethod: SigningMethod.WASM_BLOB,
    }
    expect(userEip712TargetChainId(wasm, [eip712Step(42161)])).toBeUndefined()
  })

  it('returns undefined when no step carries a numeric chainId', () => {
    expect(userEip712TargetChainId(userEip712, [eip712Step()])).toBeUndefined()
  })

  it('returns undefined when domain.chainId is a non-numeric wire value', () => {
    // domain.chainId is typed `number`, but a provider could serialize it as a
    // string over the wire; the `typeof === 'number'` guard must reject it.
    const stringChainStep = {
      action: ActionType.WITHDRAWAL,
      typedData: {
        domain: { chainId: '42161' },
        types: { X: [{ name: 'x', type: 'uint256' }] },
        primaryType: 'X',
        message: { x: 0 },
      },
    } as unknown as ActionStep
    expect(
      userEip712TargetChainId(userEip712, [stringChainStep])
    ).toBeUndefined()
  })
})

describe('switchSigningChain', () => {
  it('returns the wallet unchanged with no hook and never touches the RPC', async () => {
    const wallet = inertWallet()
    await expect(switchSigningChain(wallet, 42161)).resolves.toBe(wallet)
  })

  it('returns the wallet without calling the hook when already on target', async () => {
    const wallet = walletOnChain(42161)
    const hook = vi.fn()
    await expect(switchSigningChain(wallet, 42161, hook)).resolves.toBe(wallet)
    expect(hook).not.toHaveBeenCalled()
  })

  it('invokes the hook and returns its client when on the wrong chain', async () => {
    const wallet = walletOnChain(1)
    const switched = walletOnChain(42161)
    const hook = vi.fn(async () => switched)
    await expect(switchSigningChain(wallet, 42161, hook)).resolves.toBe(
      switched
    )
    expect(hook).toHaveBeenCalledOnce()
    expect(hook).toHaveBeenCalledWith(42161)
  })

  it('throws SDKError when the hook resolves to undefined', async () => {
    const wallet = walletOnChain(1)
    const hook = vi.fn(async () => undefined)
    await expect(switchSigningChain(wallet, 42161, hook)).rejects.toMatchObject(
      {
        code: PerpsErrorCode.SDKError,
        message: expect.stringMatching(/42161/),
      }
    )
  })

  it('throws SDKError when the hook returns a client still on the wrong chain', async () => {
    const wallet = walletOnChain(1)
    const hook = vi.fn(async () => walletOnChain(10))
    await expect(switchSigningChain(wallet, 42161, hook)).rejects.toMatchObject(
      {
        code: PerpsErrorCode.SDKError,
        message: expect.stringMatching(/chain 10/),
      }
    )
  })
})
