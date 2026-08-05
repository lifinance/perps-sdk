import { probeLighterSigner } from './probe.js'

const run = async () => {
  const result = await probeLighterSigner()
  globalThis.__probe = result
  document.getElementById('probe').textContent = JSON.stringify(result)
}

void run()
