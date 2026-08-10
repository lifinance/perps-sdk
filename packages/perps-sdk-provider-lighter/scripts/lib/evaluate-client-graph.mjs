// Evaluate a served browser module graph in-process, so a consumer fixture can
// be exercised without a headless browser. Modules are fetched from the running
// dev/preview server and linked as ES modules whose `import.meta.url` is the URL
// they were served from — which is what the packaged signer resolves its asset
// against, and what a bundler's dependency cache relocates.
//
// Requires `node --experimental-vm-modules`.

import vm from 'node:vm'

// Web APIs the fixture graph reaches for. A bare vm context has JavaScript
// intrinsics only, so the host's implementations are handed over; the DOM stubs
// below cover the module-scope touches of the SDK's browser storage adapter and
// its WebSocket client.
const HOST_GLOBALS = [
  'Response',
  'Request',
  'Headers',
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'crypto',
  'performance',
  'console',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'queueMicrotask',
  'structuredClone',
  'atob',
  'btoa',
  'Blob',
  'AbortController',
  'AbortSignal',
  'DOMException',
  'Event',
  'EventTarget',
  'MessageEvent',
  'CloseEvent',
  'MessageChannel',
  'MessagePort',
  'WebSocket',
  'ReadableStream',
  'WritableStream',
]

const createSandbox = (origin, requests) => {
  const sandbox = {}
  for (const name of HOST_GLOBALS) {
    if (globalThis[name] !== undefined) {
      sandbox[name] = globalThis[name]
    }
  }
  sandbox.fetch = async (input, init) => {
    const response = await fetch(input, init)
    requests.push({
      url: String(input instanceof URL ? input.href : input),
      status: response.status,
      contentType: response.headers.get('content-type'),
    })
    return response
  }
  const noop = () => {}
  Object.assign(sandbox, {
    globalThis: sandbox,
    window: sandbox,
    self: sandbox,
    location: { href: `${origin}/`, origin, protocol: 'http:' },
    document: {
      // `relList.supports` answers yes so Vite's modulepreload polyfill returns
      // early, exactly as it does in a browser that needs no polyfill.
      createElement: () => ({
        relList: { supports: () => true },
        setAttribute: noop,
        appendChild: noop,
        style: {},
      }),
      head: { appendChild: noop },
      body: { appendChild: noop },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => ({ textContent: '' }),
      addEventListener: noop,
    },
    localStorage: {
      length: 0,
      getItem: () => null,
      setItem: noop,
      removeItem: noop,
      clear: noop,
      key: () => null,
    },
    navigator: { userAgent: 'node-client-graph' },
    addEventListener: noop,
    removeEventListener: noop,
  })
  return sandbox
}

/**
 * Load the module entry the served HTML document points at, evaluate the graph
 * behind it, and resolve once the fixture publishes `globalThis.__probe`.
 *
 * @param {string} origin http origin of the running server
 * @param {number} timeoutMs how long the fixture may take to publish its result
 * @returns {Promise<{ probe: unknown, requests: Array<{ url: string, status: number, contentType: string | null }> }>}
 */
export async function evaluateClientGraph(origin, timeoutMs = 120_000) {
  const documentHtml = await (await fetch(`${origin}/`)).text()
  // Vite's dev server injects its HMR client as the document's first module
  // script; it drives the DOM and is not part of the fixture's graph.
  const entry = [
    ...documentHtml.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
  ]
    .map((match) => match[1])
    .find((src) => !src.startsWith('/@vite/'))
  if (!entry) {
    throw new Error(`no fixture <script type="module" src> at ${origin}/`)
  }

  const requests = []
  const context = vm.createContext(createSandbox(origin, requests), {
    name: 'client-graph',
  })
  const modules = new Map()

  const link = async (specifier, referrer) =>
    loadLinked(new URL(specifier, referrer.identifier).href)

  function buildValidatedUrl(baseUrl) {
    try {
      const url = new URL(baseUrl);
      
      // Only allow requests to the same origin as the development server
      const originUrl = new URL(origin);
      if (url.hostname !== originUrl.hostname || url.port !== originUrl.port) {
        throw new Error('Invalid host');
      }
      
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
      
      return url.href;
    } catch {
      throw new Error('Invalid URL');
    }
  }

  const loadLinked = async (url) => {
    let module = modules.get(url)
    if (!module) {
      const response = await fetch(buildValidatedUrl(url))
      if (!response.ok) {
        throw new Error(`fetching ${url} returned ${response.status}`)
      }
      module = new vm.SourceTextModule(await response.text(), {
        identifier: url,
        context,
        initializeImportMeta: (meta) => {
          meta.url = url
          meta.env = {
            DEV: true,
            PROD: false,
            SSR: false,
            MODE: 'development',
            BASE_URL: '/',
          }
        },
        importModuleDynamically: async (specifier, referrer) => {
          const child = await link(specifier, referrer)
          await child.evaluate()
          return child
        },
      })
      modules.set(url, module)
    }
    if (module.status === 'unlinked') {
      await module.link(link)
    }
    return module
  }

  const graph = await loadLinked(new URL(entry, `${origin}/`).href)
  await graph.evaluate()

  const deadline = Date.now() + timeoutMs
  while (context.__probe === undefined) {
    if (Date.now() > deadline) {
      throw new Error(`fixture did not publish a result within ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return { probe: context.__probe, requests }
}
