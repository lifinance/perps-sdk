// Consumer-side smoke: install the package, build a provider, load the signer
// binary the package resolves for itself, and sign with it. Every fixture in
// this directory runs this and publishes the outcome as `globalThis.__probe`.

import {
  lighterProvider,
  loadLighterWasm,
} from '@lifi/perps-sdk-provider-lighter'

export const SIGNER_FUNCTIONS = [
  'GenerateAPIKey',
  'CreateClient',
  'CheckClient',
  'CreateAuthToken',
  'SignChangePubKey',
  'SignCreateOrder',
  'SignCancelOrder',
  'SignCancelAllOrders',
  'SignTransfer',
  'SignWithdraw',
  'SignUpdateLeverage',
  'SignModifyOrder',
  'SignUpdateMargin',
  'SignApproveIntegrator',
  'SignUpdateAccountConfig',
  'SignUpdateAccountAssetConfig',
]

export const probeLighterSigner = async () => {
  try {
    lighterProvider()
    const wasm = await loadLighterWasm()
    const missing = SIGNER_FUNCTIONS.filter(
      (name) => typeof wasm[name] !== 'function'
    )
    const key = wasm.GenerateAPIKey()
    return {
      ok: missing.length === 0 && Boolean(key.publicKey && key.privateKey),
      missing,
      generateApiKeyError: key.error,
      publicKeyPrefix: key.publicKey?.slice(0, 6),
    }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}
