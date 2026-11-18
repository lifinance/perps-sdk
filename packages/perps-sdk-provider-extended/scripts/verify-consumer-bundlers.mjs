#!/usr/bin/env node
// Install the packed package into throwaway Vite and Next.js apps and run the
// Stark signer in Chromium, as the Lighter provider does for its Go signer. The
// asset URL is decided by whichever bundler processes the package, so unit tests
// cannot catch a binary that a consumer build fails to serve.
//
// Each target checks that the probe matches the Python SDK values, that the page
// fetched exactly one `application/wasm` asset byte-identical to the packaged
// binary, and, for builds, that exactly one `.wasm` file was emitted.
//
// Usage: node scripts/verify-consumer-bundlers.mjs [--only=vite-dev,next-build] [--keep]
// Needs network access (each fixture installs its own toolchain from npm).

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fixtureSources = join(packageRoot, 'test', 'consumer')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const packagedDigest = sha256(
  readFileSync(join(packageRoot, 'wasm', 'extended-stark.wasm'))
)

const argv = process.argv.slice(2)
const only = argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
const keepFixtures = argv.includes('--keep')

const log = (message) => process.stderr.write(`${message}\n`)

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output)
        return
      }
      reject(
        new Error(`${command} ${args.join(' ')} exited with ${code}\n${output}`)
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

const startServer = async (command, args, { cwd, port }) => {
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
  const deadline = Date.now() + 180_000
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(`${command} exited before serving:\n${output}`)
    }
    try {
      await fetch(`${origin}/`)
      return { origin, stop }
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

const listFiles = (dir) => {
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

const createFixture = (root, name, { manifest, sources }) => {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  cpSync(join(fixtureSources, 'probe.js'), join(dir, 'probe.js'))
  cpSync(join(fixtureSources, sources), dir, { recursive: true })
  return dir
}

const install = (dir) =>
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: dir,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  })

const dependencies = (tarball) => ({
  '@lifi/perps-sdk-provider-extended': `file:${tarball}`,
})

/** Open the page in Chromium, wait for the probe, and check the fetched binary. */
async function assertBrowserProbe(origin) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const wasmResponses = []
    page.on('response', (response) => {
      if (response.headers()['content-type']?.startsWith('application/wasm')) {
        wasmResponses.push(response)
      }
    })
    const clientFailure = new Promise((_, reject) => {
      page.once('pageerror', (error) => {
        reject(new Error(`browser client failed: ${error.message}`))
      })
    })
    return await Promise.race([
      clientFailure,
      (async () => {
        const response = await page.goto(origin)
        assert(response?.ok(), `${origin} did not serve the fixture page`)
        await page.waitForFunction(
          () => globalThis.__probe !== undefined,
          undefined,
          {
            timeout: 120_000,
          }
        )
        const probe = await page.evaluate(() => globalThis.__probe)
        assert(probe?.ok === true, `probe failed: ${JSON.stringify(probe)}`)
        assert(
          wasmResponses.length === 1,
          `expected one application/wasm response, saw ${wasmResponses.map((r) => r.url()).join(', ') || 'none'}`
        )
        const bytes = await wasmResponses[0].body()
        assert(
          sha256(bytes) === packagedDigest,
          `${wasmResponses[0].url()} is not the binary shipped with the package`
        )
        return `${wasmResponses[0].url()} (${bytes.byteLength} bytes)`
      })(),
    ])
  } finally {
    await browser.close()
  }
}

// Next.js also emits the glue's own `stark_crypto_wrapper_wasm_bg.wasm`. The page
// never fetches it (assertBrowserProbe checks for one response), so only its
// bytes are checked.
const assertEmittedBinaries = (dir) => {
  const binaries = listFiles(dir).filter((path) => path.endsWith('.wasm'))
  assert(
    binaries.some((path) => path.includes('extended-stark')),
    `the packaged binary was not emitted: ${binaries.join(', ') || 'no .wasm'}`
  )
  for (const path of binaries) {
    assert(
      sha256(readFileSync(path)) === packagedDigest,
      `${path} is not the binary shipped with the package`
    )
  }
}

const viteFixture = async (root, tarball, name) => {
  const dir = createFixture(root, name, {
    manifest: {
      name: `extended-consumer-${name}`,
      private: true,
      type: 'module',
      dependencies: dependencies(tarball),
      devDependencies: { vite: '^6.0.1' },
    },
    sources: 'vite',
  })
  await install(dir)
  return dir
}

const serveAndProbe = async (dir, args) => {
  const port = await freePort()
  const server = await startServer(
    'npx',
    [...args, '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: dir, port }
  )
  try {
    return await assertBrowserProbe(server.origin)
  } finally {
    server.stop()
  }
}

async function nextTarget(root, tarball, mode, turbopack) {
  const name = `next-${mode}${turbopack ? '-turbopack' : ''}`
  const dir = createFixture(root, name, {
    manifest: {
      name: `extended-consumer-${name}`,
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
    assertEmittedBinaries(join(dir, '.next', 'static'))
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
    return await assertBrowserProbe(server.origin)
  } finally {
    server.stop()
  }
}

const targets = {
  // No vite.config: the dependency optimizer runs with its defaults, which is
  // the configuration that relocates the package away from its binary.
  'vite-dev': async ({ root, tarball }) =>
    serveAndProbe(await viteFixture(root, tarball, 'vite-dev'), ['vite']),
  'vite-build': async ({ root, tarball }) => {
    const dir = await viteFixture(root, tarball, 'vite-build')
    await run('npx', ['vite', 'build'], { cwd: dir })
    assertEmittedBinaries(join(dir, 'dist'))
    return serveAndProbe(dir, ['vite', 'preview'])
  },
  'next-dev': ({ root, tarball }) => nextTarget(root, tarball, 'dev', false),
  'next-build': ({ root, tarball }) =>
    nextTarget(root, tarball, 'build', false),
  'next-dev-turbopack': ({ root, tarball }) =>
    nextTarget(root, tarball, 'dev', true),
  'next-build-turbopack': ({ root, tarball }) =>
    nextTarget(root, tarball, 'build', true),
}

const main = async () => {
  const selected = Object.keys(targets).filter(
    (name) => only === undefined || only.includes(name)
  )
  assert(
    selected.length > 0,
    `no matching targets in --only=${only?.join(',')}`
  )

  const root = mkdtempSync(join(tmpdir(), 'extended-consumer-'))
  // pnpm rewrites the `workspace:` ranges into published ones; npm would not.
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

  if (keepFixtures) {
    log(`verify-consumer-bundlers: fixtures kept in ${root}`)
  } else {
    rmSync(root, { recursive: true, force: true })
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
