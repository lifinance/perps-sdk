import { PerpsClient, PerpsError, PerpsErrorCode } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const settings = {
  provider: 'hyperliquid',
  address: '0x677d831aef5328190852e24f13c46cac05f984e7',
} as const

const perps = new PerpsClient({ providers: [hyperliquidProvider()] })

try {
  console.log(await perps.getAccount(settings))
} catch (error) {
  if (!(error instanceof PerpsError)) {
    throw error
  }

  switch (error.code) {
    case PerpsErrorCode.AccountNotFound:
      console.error(
        'Check the address. A new Hyperliquid account needs a first deposit.'
      )
      break
    case PerpsErrorCode.RateLimitExceeded:
      console.error(
        'Wait for the rate limit to reset before you repeat the read.'
      )
      break
    default:
      console.error(`Perps error ${error.code}: ${error.message}`)
  }
  process.exitCode = 1
}
