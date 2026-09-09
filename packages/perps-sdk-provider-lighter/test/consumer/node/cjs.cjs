const assert = require('node:assert/strict')

const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
const previousFs = globalThis.fs
const hostGo = class {}
globalThis.Go = hostGo
delete globalThis.crypto

const sdk = require('@lifi/perps-sdk-provider-lighter')
assert.equal(globalThis.Go, hostGo)
assert.equal(globalThis.fs, previousFs)
Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)

const run = async () => {
  // The shared probe is ESM but accepts the package's CommonJS exports.
  const { probeLighterSigner } = await import('./probe.js')
  console.log(JSON.stringify(await probeLighterSigner(sdk)))
}

void run()
