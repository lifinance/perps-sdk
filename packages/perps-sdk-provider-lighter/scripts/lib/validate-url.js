export function buildValidatedUrl(inputUrl) {
  // Minimal path validation (Do this before new URL(inputUrl), as URL() resolves dot-segments.)
  if (inputUrl.includes('/../') || /\/%2e%2e\//i.test(inputUrl)) {
    throw new Error('Invalid path')
  }

  let url
  try {
    url = new URL(inputUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  // Protocol + host checks: the verifier only ever fetches from its own local servers
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Invalid protocol')
  }

  // Only allow localhost/127.0.0.1 since this is for local test servers
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Invalid host')
  }

  return url.href
}
