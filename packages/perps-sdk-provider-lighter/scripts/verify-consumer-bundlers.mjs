#!/usr/bin/env node
// Install the packed package into throwaway fixtures and load its Go signer
// through the real consumer toolchains. Mocked unit tests cannot catch this
// class of failure: the asset URL is decided by whichever bundler processes the
// package, and Vite's dependency optimizer relocates the module before it runs.
//
// Each target asserts the same contract: the fixture reaches every expected
// signer export, `GenerateAPIKey()` answers, and the binary arrived as a
// separately served `application/wasm` asset byte-identical to the packaged one.
//
// Usage: node scripts/verify-consumer-bundlers.mjs [--only=vite-dev,node-esm] [--keep]
// Needs network access (each fixture installs its own toolchain from npm).

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateClientGraph } from './lib/evaluate-client-graph.js'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fixtureSources = join(packageRoot, 'test', 'consumer')
const packagedBinary = join(packageRoot, 'dist', 'wasm', 'lighter-signer.wasm')

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d])
/** Emitted JS must never grow to carry the binary — it stays a fetched asset. */
const MAX_CHUNK_BYTES = 500_000

const argv = process.argv.slice(2)
const only = argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
const keepFixtures = argv.includes('--keep')

const log = (message) => process.stderr.write(`${message}\n`)

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} exited with ${code}\n${stderr || stdout}`
        )
      )
    })
  })

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })

/** Start a server fixture and resolve once it answers on `origin`. */
const startServer = async (
  command,
  args,
  { cwd, port, timeoutMs = 180_000 }
) => {
  const child = spawn(command, args, { cwd, detached: true, stdio: 'pipe' })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })

  const origin = `http://127.0.0.1:${port}`
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }

  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`${command} exited before serving:\n${output}`)
    }
    try {
      await fetch(`${origin}/`)
      return { origin, stop, output: () => output }
    } catch {
      if (Date.now() > deadline) {
        stop()
        throw new Error(
          `${command} did not serve ${origin} in time:\n${output}`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const packagedDigest = sha256(readFileSync(packagedBinary))

/** Poll `probe` until it returns a value; build output appears asynchronously. */
const waitFor = async (probe, message, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value !== undefined) {
      return value
    }
    if (Date.now() > deadline) {
      throw new Error(message)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const assertProbe = (probe) => {
  assert(
    probe?.ok === true,
    `fixture probe failed: ${JSON.stringify(probe, null, 2)}`
  )
  assert(
    (probe.missing?.length ?? 0) === 0,
    `signer is missing exports: ${probe.missing?.join(', ')}`
  )
  assert(
    probe.generateApiKeyError === undefined,
    `GenerateAPIKey reported ${probe.generateApiKeyError}`
  )
}

function buildValidatedUrl(inputUrl) {
  // Minimal path validation
  if (inputUrl.includes('/../') || /\/%2e%2e\//i.test(inputUrl)) {
    throw new Error('Invalid path')
  }
  let url
  try {
    url = new URL(inputUrl)
  } catch {
    throw new Error('Invalid URL')
  }
  // Protocol check: the verifier only ever fetches from its own local servers
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Invalid protocol')
  }
  return url.href
}

/** Re-fetch a served asset to check its media type and bytes. */
const assertServedBinary = async (url) => {
  const validatedUrl = buildValidatedUrl(url)
  const response = await fetch(validatedUrl)
  assert(response.ok, `${url} returned ${response.status}`)
  const contentType = response.headers.get('content-type')
  assert(
    contentType?.startsWith('application/wasm'),
    `${url} was served as ${contentType}, not application/wasm`
  )
  const bytes = Buffer.from(await response.arrayBuffer())
  assert(
    bytes.subarray(0, 4).equals(WASM_MAGIC),
    `${url} does not start with the WASM magic bytes (got ${bytes.subarray(0, 4).toString('hex')})`
  )
  assert(
    sha256(bytes) === packagedDigest,
    `${url} is not the binary shipped with the package`
  )
  return `${url} (${bytes.byteLength} bytes, ${contentType})`
}

const assertFetchedThroughAssetUrl = async (requests) => {
  const served = requests.filter(
    (request) =>
      request.status === 200 &&
      request.contentType?.startsWith('application/wasm')
  )
  assert(
    served.length === 1,
    `expected exactly one application/wasm response, saw ${JSON.stringify(requests, null, 2)}`
  )
  return assertServedBinary(served[0].url)
}

const listFiles = (dir) => {
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else {
        found.push(path)
      }
    }
  }
  walk(dir)
  return found
}

const createFixture = (root, name, { manifest, sources }) => {
  const resolvedRoot = resolve(root)
  const resolvedDir = resolve(resolvedRoot, name)
  const relPath = relative(resolvedRoot, resolvedDir)
  if (relPath.startsWith('..') || isAbsolute(relPath)) {
    throw new Error('Invalid path')
  }
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(resolvedDir, 'package.json'),
    JSON.stringify(manifest, null, 2)
  )
  cpSync(join(fixtureSources, 'probe.js'), join(dir, 'probe.js'))
  cpSync(join(fixtureSources, sources), dir, { recursive: true })
  return dir
}

// npm installs the package's peers (`@lifi/perps-sdk`) from the registry itself,
// at whatever range the packed manifest asks for.
const install = (dir) =>
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: dir,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  })

const dependencies = (tarball) => ({
  '@lifi/perps-sdk-provider-lighter': `file:${tarball}`,
})

const targets = {
  'node-esm': async ({ root, tarball }) => {
    const dir = createFixture(root, 'node-esm', {
      manifest: {
        name: 'lighter-consumer-node-esm',
        private: true,
        type: 'module',
        dependencies: dependencies(tarball),
      },
      sources: 'node',
    })
    await install(dir)
    const stdout = await run('node', ['esm.mjs'], { cwd: dir })
    assertProbe(JSON.parse(stdout))
    return 'installed binary read through the file URL resolver'
  },

  'node-cjs': async ({ root, tarball }) => {
    const dir = createFixture(root, 'node-cjs', {
      manifest: {
        name: 'lighter-consumer-node-cjs',
        private: true,
        type: 'module',
        dependencies: dependencies(tarball),
      },
      sources: 'node',
    })
    await install(dir)
    const stdout = await run('node', ['cjs.cjs'], { cwd: dir })
    assertProbe(JSON.parse(stdout))
    return 'installed binary read through the __filename resolver'
  },

  'vite-dev': async ({ root, tarball }) => {
    // No vite.config: the dependency optimizer runs with its default settings,
    // which is the configuration that used to break.
    const dir = createFixture(root, 'vite-dev', {
      manifest: {
        name: 'lighter-consumer-vite-dev',
        private: true,
        type: 'module',
        dependencies: dependencies(tarball),
        devDependencies: { vite: '^6.0.1' },
      },
      sources: 'vite',
    })
    await install(dir)
    const port = await freePort()
    const server = await startServer(
      'npx',
      ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
      { cwd: dir, port }
    )
    try {
      const { probe, requests } = await evaluateClientGraph(server.origin)
      assertProbe(probe)
      return await assertFetchedThroughAssetUrl(requests)
    } finally {
      server.stop()
    }
  },

  'vite-build': async ({ root, tarball }) => {
    const dir = createFixture(root, 'vite-build', {
      manifest: {
        name: 'lighter-consumer-vite-build',
        private: true,
        type: 'module',
        dependencies: dependencies(tarball),
        devDependencies: { vite: '^6.0.1' },
      },
      sources: 'vite',
    })
    await install(dir)
    await run('npx', ['vite', 'build'], { cwd: dir })

    const emitted = listFiles(join(dir, 'dist'))
    const binaries = emitted.filter((path) => path.endsWith('.wasm'))
    assert(
      binaries.length === 1,
      `expected one emitted .wasm asset, got ${binaries.length}`
    )
    assert(
      sha256(readFileSync(binaries[0])) === packagedDigest,
      'the emitted asset is not the binary shipped with the package'
    )
    const inlined = emitted.filter(
      (path) =>
        path.endsWith('.js') && readFileSync(path).byteLength > MAX_CHUNK_BYTES
    )
    assert(
      inlined.length === 0,
      `emitted JavaScript over ${MAX_CHUNK_BYTES} bytes — is the binary inlined? ${inlined.join(', ')}`
    )

    const port = await freePort()
    const server = await startServer(
      'npx',
      [
        'vite',
        'preview',
        '--port',
        String(port),
        '--strictPort',
        '--host',
        '127.0.0.1',
      ],
      { cwd: dir, port }
    )
    try {
      const { probe, requests } = await evaluateClientGraph(server.origin)
      assertProbe(probe)
      return await assertFetchedThroughAssetUrl(requests)
    } finally {
      server.stop()
    }
  },

  'next-dev': ({ root, tarball }) => nextTarget(root, tarball, 'dev', false),
  'next-build': ({ root, tarball }) =>
    nextTarget(root, tarball, 'build', false),
  // Turbopack matches the same export conditions as Vite but rejects Vite's
  // `?url` query, so it is the toolchain a condition-based split breaks.
  'next-dev-turbopack': ({ root, tarball }) =>
    nextTarget(root, tarball, 'dev', true),
  'next-build-turbopack': ({ root, tarball }) =>
    nextTarget(root, tarball, 'build', true),
}

/**
 * Next.js client chunks are not ES modules, so instead of evaluating them the
 * check follows the asset webpack emitted: the chunk that references it, the
 * media type it is served with, and the bytes themselves — then instantiates
 * those bytes with the packaged Go runtime to prove the served asset signs.
 */
async function nextTarget(root, tarball, mode, turbopack) {
  const name = `next-${mode}${turbopack ? '-turbopack' : ''}`
  const dir = createFixture(root, name, {
    manifest: {
      name: `lighter-consumer-${name}`,
      private: true,
      dependencies: {
        ...dependencies(tarball),
        next: '^15.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
    },
    sources: 'next',
  })
  await install(dir)

  const bundlerFlag = turbopack ? ['--turbopack'] : []
  const port = await freePort()
  let server
  if (mode === 'build') {
    await run('npx', ['next', 'build', ...bundlerFlag], { cwd: dir })
    server = await startServer(
      'npx',
      ['next', 'start', '--port', String(port), '--hostname', '127.0.0.1'],
      { cwd: dir, port }
    )
  } else {
    server = await startServer(
      'npx',
      [
        'next',
        'dev',
        ...bundlerFlag,
        '--port',
        String(port),
        '--hostname',
        '127.0.0.1',
      ],
      { cwd: dir, port }
    )
  }

  try {
    // Requesting the page is what makes the dev server compile it, and with it
    // emit the asset.
    const html = await (await fetch(`${server.origin}/`)).text()
    assert(html.includes('probe'), 'the fixture page did not render')

    const staticDir = join(dir, '.next', 'static')
    const media = await waitFor(() => {
      const found = listFiles(staticDir).filter((path) =>
        path.endsWith('.wasm')
      )
      return found.length === 1 ? found[0] : undefined
    }, `${name} emitted no single .wasm asset under .next/static`)
    const assetName = media.split('/').pop()

    const chunks = listFiles(staticDir).filter((path) => path.endsWith('.js'))
    assert(
      chunks.some((path) => readFileSync(path, 'utf8').includes(assetName)),
      `no emitted chunk references ${assetName}`
    )

    const served = await assertServedBinary(
      `${server.origin}/_next/static/media/${assetName}`
    )
    await assertSignsWithPackagedRuntime(dir, media)
    return served
  } finally {
    server.stop()
  }
}

/**
 * Instantiate a fetched binary with the Go runtime the package ships and sign
 * with it, so a served asset is proven to be a working signer and not just the
 * right bytes.
 */
async function assertSignsWithPackagedRuntime(fixtureDir, binaryPath) {
  const installed = join(
    fixtureDir,
    'node_modules',
    '@lifi',
    'perps-sdk-provider-lighter',
    'dist',
    'esm',
    'signers',
    'generated',
    'wasmExecRuntime.js'
  )
  const { WASM_EXEC_JS } = await import(`file://${installed}`)
  const previousGo = globalThis.Go
  try {
    const Go = new Function(`${WASM_EXEC_JS}; return globalThis.Go`)()
    const go = new Go()
    const bytes = readFileSync(binaryPath)
    const { instance } = await WebAssembly.instantiate(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      go.importObject
    )
    void go.run(instance)
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const key = globalThis.GenerateAPIKey?.()
    assert(
      Boolean(key?.publicKey && key?.privateKey),
      `the emitted asset did not sign: ${JSON.stringify(key)}`
    )
  } finally {
    globalThis.Go = previousGo
  }
}

const main = async () => {
  const selected = Object.keys(targets).filter(
    (name) => only === undefined || only.includes(name)
  )
  assert(
    selected.length > 0,
    `no matching targets in --only=${only?.join(',')}`
  )

  const root = mkdtempSync(join(tmpdir(), 'lighter-consumer-'))
  // pnpm packs the tarball because it rewrites the `workspace:` ranges in the
  // manifest into the published ones; npm leaves them and the fixture install
  // then rejects the protocol.
  log(`verify-consumer-bundlers: packing into ${root}`)
  await run('pnpm', ['pack', '--pack-destination', root], { cwd: packageRoot })
  const tarball = join(
    root,
    readdirSync(root).find((entry) => entry.endsWith('.tgz'))
  )

  const failures = []
  for (const name of selected) {
    const started = Date.now()
    try {
      const detail = await targets[name]({ root, tarball })
      log(
        `  ✓ ${name} — ${detail} [${Math.round((Date.now() - started) / 1000)}s]`
      )
    } catch (error) {
      failures.push(name)
      log(`  ✗ ${name} — ${error instanceof Error ? error.message : error}`)
    }
  }

  if (!keepFixtures) {
    rmSync(root, { recursive: true, force: true })
  } else {
    log(`verify-consumer-bundlers: fixtures kept in ${root}`)
  }

  if (failures.length > 0) {
    log(`verify-consumer-bundlers: FAILED (${failures.join(', ')})`)
    process.exit(1)
  }
  log(
    `verify-consumer-bundlers: ${selected.length} consumer toolchains verified`
  )
}

await main()
// The Go runtime started above keeps a goroutine scheduled forever, so the
// event loop never drains on its own.
process.exit(0)
