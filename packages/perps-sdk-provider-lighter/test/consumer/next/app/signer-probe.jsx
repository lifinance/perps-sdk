'use client'

import {
  lighterProvider,
  loadLighterWasm,
} from '@lifi/perps-sdk-provider-lighter'
import { useEffect, useState } from 'react'
import { probeLighterSigner } from '../probe.js'

export default function SignerProbe() {
  const [result, setResult] = useState('running')

  useEffect(() => {
    const run = async () => {
      const probe = await probeLighterSigner({
        lighterProvider,
        loadLighterWasm,
      })
      globalThis.__probe = probe
      setResult(JSON.stringify(probe))
    }
    void run()
  }, [])

  return <div id="probe">{result}</div>
}
