import {
  lighterProvider,
  loadLighterWasm,
} from '@lifi/perps-sdk-provider-lighter'
import { probeLighterSigner } from './probe.js'

const run = async () => {
  const result = await probeLighterSigner({ lighterProvider, loadLighterWasm })
  globalThis.__probe = result
  document.getElementById('probe').textContent = JSON.stringify(result)
}

void run()
