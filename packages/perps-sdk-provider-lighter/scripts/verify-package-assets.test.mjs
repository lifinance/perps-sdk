import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const createFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'lighter-package-verification-'))
  for (const path of ['dist', 'wasm', 'scripts/lib']) {
    cpSync(join(packageRoot, path), join(directory, path), { recursive: true })
  }
  cpSync(join(packageRoot, 'package.json'), join(directory, 'package.json'))
  cpSync(
    join(packageRoot, 'scripts/verify-package-assets.mjs'),
    join(directory, 'scripts/verify-package-assets.mjs')
  )
  mkdirSync(join(directory, 'test/consumer'), { recursive: true })
  cpSync(
    join(packageRoot, 'test/consumer/probe.js'),
    join(directory, 'test/consumer/probe.js')
  )
  symlinkSync(
    join(packageRoot, 'node_modules'),
    join(directory, 'node_modules'),
    'dir'
  )
  return directory
}

const verify = (directory) =>
  spawnSync(
    process.execPath,
    [join(directory, 'scripts/verify-package-assets.mjs')],
    {
      encoding: 'utf8',
      timeout: 20000,
    }
  )

for (const [name, path, suffix] of [
  // A valid custom section changes the digest without changing signer behavior.
  ['WASM', 'dist/wasm/lighter-signer.wasm', Buffer.from([0, 4, 1, 113, 0, 0])],
  ['runtime', 'wasm/wasm_exec.js', Buffer.from('\n')],
]) {
  test(`rejects an altered ${name} with an unchanged manifest`, () => {
    const directory = createFixture()
    try {
      const original = verify(directory)
      assert.equal(original.status, 0, original.stderr)
      appendFileSync(join(directory, path), suffix)
      const altered = verify(directory)
      assert.equal(altered.status, 1, altered.stderr)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
