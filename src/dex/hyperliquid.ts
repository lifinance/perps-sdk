import type { DexAuthProvider } from './types.js'

export const hyperliquidAuthProvider: DexAuthProvider = {
  getAuthorizationInputs({ signingMode, agentAddress }) {
    if (signingMode === 'USER') {
      return {
        user: [{ key: 'ApproveBuilderFee' }, { key: 'UserSetAbstraction' }],
        agent: [],
      }
    }
    // USER_AGENT
    return {
      user: [
        { key: 'ApproveAgent', params: { agentAddress } },
        { key: 'ApproveBuilderFee' },
      ],
      agent: [{ key: 'AgentSetAbstraction' }],
    }
  },
}
