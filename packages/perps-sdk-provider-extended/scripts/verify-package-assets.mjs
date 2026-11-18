#!/usr/bin/env node
// Check that the built ESM and CJS entry points both load the shipped Stark
// signer and reproduce a known hash and signature.
//
// Usage: node scripts/verify-package-assets.mjs   (run after the build)

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(packageRoot, 'dist')
const fixtures = JSON.parse(
  readFileSync(
    join(packageRoot, 'test', 'fixtures', 'extended-stark-fixtures.json'),
    'utf8'
  )
)
const key = fixtures.keyDerivation.find(
  (entry) => entry.network === 'mainnet' && entry.accountIndex === '0'
)
const registration = fixtures.onboarding.find(
  (entry) => entry.kind === 'onboard'
)

const failures = []

for (const format of ['esm', 'cjs']) {
  const entry = join(dist, format, 'index.js')
  try {
    const provider =
      format === 'cjs'
        ? createRequire(import.meta.url)(entry)
        : await import(pathToFileURL(entry).href)
    const privateKey = await provider.calculateStarkPrivateKey(
      key.walletSignature
    )
    if (privateKey !== key.starkPrivateKey) {
      failures.push(`dist/${format}: wrong Stark private key ${privateKey}`)
    }
    const signature = await provider.signStarkHash(
      registration.starkMessage,
      privateKey
    )
    if (
      JSON.stringify(signature) !==
      JSON.stringify(registration.payload.l2Signature)
    ) {
      failures.push(
        `dist/${format}: wrong signature ${JSON.stringify(signature)}`
      )
    }
  } catch (error) {
    failures.push(`dist/${format}: ${error.message}`)
  }
}

if (failures.length > 0) {
  console.error('verify-package-assets: FAILED')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.error('verify-package-assets: ESM and CJS builds load and sign')
