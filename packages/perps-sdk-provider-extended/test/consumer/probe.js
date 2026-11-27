// Consumer-side smoke: load the signer binary the package resolves for itself,
// then derive a key, hash a sell order, and sign. Expected values come from
// Extended's Python SDK (test/fixtures/extended-stark-fixtures.json).

const WALLET_SIGNATURE =
  '7cff6843af5b2e3836b28b4e01f0ec05d361736cd293f2f962bbd3ef5c30e1ca6faa828d8718351b2f474e7808b09f91c33f50dfb097d2c316f0fefe1b8936171b'
const STARK_PRIVATE_KEY =
  '0x30735edc29c5af469e31c26c08b5e29cafec08e1cb2d2d009bbfea4ca18d570'
const ORDER_PUBLIC_KEY = `0x${BigInt(
  '3063774005368548400900468564897177146639024373303258005211724966418924502420'
).toString(16)}`
const ORDER_FIELDS = {
  positionId: '430876',
  baseAssetId: '344400637349001255728961162330505216',
  baseAmount: '100',
  quoteAssetId: '1',
  quoteAmount: '-5129500',
  feeAssetId: '1',
  feeAmount: '1283',
  expiration: '1796216400',
  salt: '1',
}
const ORDER_HASH =
  '0x3fc6a81333808f815ce38766cc97c24af4ff2c0dbc0fb6ba0b43636c96b02a3'
const REGISTRATION_HASH =
  '0x4b52fbccdfb1ce0890f16c13f77b37e7400164e8155e97687aee5160eff9cbc'
const REGISTRATION_SIGNATURE = {
  r: '0x4a97f007a14bbffaa11ecdc3c44ee1bd7f746bb88ea383a4414682cbb195f9f',
  s: '0x531aed35e7c8a251e02d6211ec2bc5a4062c04978883c12aa43808404281f8a',
}

export const probeExtendedSigner = async ({
  calculateStarkPrivateKey,
  calculateStarkOrderHash,
  signStarkHash,
  EXTENDED_MAINNET_STARK_DOMAIN,
}) => {
  try {
    const privateKey = await calculateStarkPrivateKey(WALLET_SIGNATURE)
    const orderHash = await calculateStarkOrderHash(
      ORDER_FIELDS,
      EXTENDED_MAINNET_STARK_DOMAIN,
      ORDER_PUBLIC_KEY
    )
    const signature = await signStarkHash(REGISTRATION_HASH, privateKey)
    return {
      ok:
        privateKey === STARK_PRIVATE_KEY &&
        orderHash === ORDER_HASH &&
        signature.r === REGISTRATION_SIGNATURE.r &&
        signature.s === REGISTRATION_SIGNATURE.s,
      privateKey,
      orderHash,
      signature,
    }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}
