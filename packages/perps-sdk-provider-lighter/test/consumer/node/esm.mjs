import assert from 'node:assert/strict'
import { probeLighterSigner } from './probe.js'

const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
const previousFs = globalThis.fs
const hostGo = class {}
globalThis.Go = hostGo
delete globalThis.crypto

// Static imports would run before this host-global setup.
const sdk = await import('@lifi/perps-sdk-provider-lighter')
assert.equal(globalThis.Go, hostGo)
assert.equal(globalThis.fs, previousFs)
Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)

console.log(JSON.stringify(await probeLighterSigner(sdk)))
