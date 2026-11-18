import * as sdk from '@lifi/perps-sdk-provider-extended'
import { probeExtendedSigner } from './probe.js'

const run = async () => {
  const result = await probeExtendedSigner(sdk)
  globalThis.__probe = result
  document.getElementById('probe').textContent = JSON.stringify(result)
}

void run()
