'use client'

import * as sdk from '@lifi/perps-sdk-provider-extended'
import { useEffect, useState } from 'react'
import { probeExtendedSigner } from '../probe.js'

export default function SignerProbe() {
  const [result, setResult] = useState('running')

  useEffect(() => {
    const run = async () => {
      const probe = await probeExtendedSigner(sdk)
      globalThis.__probe = probe
      setResult(JSON.stringify(probe))
    }
    void run()
  }, [])

  return <div id="probe">{result}</div>
}
