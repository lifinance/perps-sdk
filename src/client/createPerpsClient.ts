import { PerpsErrorCode } from '@lifi/perps-types'
import type { Account, WalletClient } from 'viem'
import { AgentManager } from '../agent/AgentManager.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsError } from '../errors/PerpsError.js'

export const DEFAULT_API_URL = 'https://develop.li.quest/v1/perps'

export interface ProviderConfig {
  markets?: string[]
}

/** @deprecated Use ProviderConfig */
export type HyperliquidConfig = ProviderConfig

export interface ProviderConfigs {
  [provider: string]: ProviderConfig | undefined
}

export interface PerpsConfig {
  integrator: string
  apiKey: string
  apiUrl?: string
  disableVersionCheck?: boolean
  storage?: StorageAdapter
  requestInterceptor?: RequestInterceptor
  providers?: ProviderConfigs
  /**
   * Wallet signer for USER-mode signing (EIP-712 typed data, EVM transactions).
   * Accepts any viem-compatible WalletClient:
   *   - Browser wallet: wagmi's useWalletClient() result
   *   - Private key:    createWalletClient({ account: privateKeyToAccount('0x...'), transport: http() })
   *   - Mnemonic:       createWalletClient({ account: mnemonicToAccount('word1 ...'), transport: http() })
   */
  signer?: WalletClient<any, any, Account>
}

export interface PerpsBaseConfig {
  integrator: string
  apiKey: string
  apiUrl: string
  disableVersionCheck?: boolean
  requestInterceptor?: RequestInterceptor
  providers?: ProviderConfigs
}

export type RequestInterceptor = (
  url: string,
  options: RequestInit
) => RequestInit | Promise<RequestInit>

export interface SDKRequestOptions {
  signal?: AbortSignal
  /**
   * Lighter auth token for authenticated read endpoints (getOrders, getOrder,
   * getActivity). Mint via `lighterSigner.createAuthToken(deadline, context)`.
   * Forwarded as `Authorization: Bearer <token>` and never persisted by the
   * backend — read-only by design (8h max TTL, cannot authorize writes).
   */
  lighterAuthToken?: string
}

export interface PerpsSDKClient {
  readonly config: PerpsBaseConfig
  readonly agentManager: AgentManager
  /** Wallet signer — accepts any viem WalletClient (browser, private key, mnemonic). */
  readonly signer?: WalletClient<any, any, Account>
}

export function createPerpsClient(options: PerpsConfig): PerpsSDKClient {
  if (!options.integrator) {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      'Integrator is required. Please see documentation at https://docs.li.fi'
    )
    error.tool = '@lifi/perps-sdk'
    throw error
  }

  const apiUrl = options.apiUrl ?? DEFAULT_API_URL

  const config: PerpsBaseConfig = {
    integrator: options.integrator,
    apiKey: options.apiKey,
    apiUrl,
    disableVersionCheck: options.disableVersionCheck,
    requestInterceptor: options.requestInterceptor,
    providers: options.providers,
  }

  const agentManager = new AgentManager(options.storage)

  return {
    get config() {
      return config
    },
    get agentManager() {
      return agentManager
    },
    get signer() {
      return options.signer
    },
  }
}
