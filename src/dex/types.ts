import type { Address, AuthorizationInput } from '@lifi/perps-types'
import type { SigningMode } from '../client/types.js'

export interface DexAuthInputs {
  /** Authorizations requiring user wallet signature */
  user: AuthorizationInput[]
  /** Authorizations the agent auto-signs after user auths succeed */
  agent: AuthorizationInput[]
}

export interface DexAuthProvider {
  getAuthorizationInputs(params: {
    signingMode: SigningMode
    agentAddress?: Address
  }): DexAuthInputs
}
