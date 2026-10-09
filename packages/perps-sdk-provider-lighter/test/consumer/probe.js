// Consumer-side smoke: install the package, build a provider, load the signer
// binary the package resolves for itself, and sign with it. Every fixture in
// this directory runs this and publishes the outcome as `globalThis.__probe`.

export const SIGNER_FUNCTIONS = [
  '_createClientByPrv',
  '_createClient',
  '_createAuthToken',
  '_getChangePubKeyTransaction',
  '_signChangePubKey',
  '_signCreateOrder',
  '_signCancelOrder',
  '_signCancelAllOrders',
  '_signModifyOrder',
  '_getTransferTransaction',
  '_signTransfer',
  '_signWithdraw',
  '_signUpdateLeverage',
  '_signUpdateMargin',
  '_getApproveIntegratorTransaction',
  '_signApproveIntegrator',
  '_signUpdateAccountConfig',
  '_signUpdateAccountAssetConfig',
]

const SEED = `0x${'11'.repeat(32)}`

export const probeLighterSigner = async ({
  lighterProvider,
  loadLighterWasm,
}) => {
  try {
    lighterProvider()
    const wasm = await loadLighterWasm()
    const missing = SIGNER_FUNCTIONS.filter(
      (name) => typeof wasm[name] !== 'function'
    )
    const client = await wasm._createClient(SEED, 304, 1, 0, 3, false)()
    return {
      ok: missing.length === 0 && Boolean(client.pk && client.prv),
      missing,
      createClientError: client.error,
      publicKeyPrefix: client.pk?.slice(0, 6),
    }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}
