import type { ProviderAction } from '@lifi/perps-types'
import { PerpsSigner } from '@lifi/perps-types'

/**
 * Select the `Provider.setup` descriptors a user is responsible for satisfying:
 * those whose `signers` include {@link PerpsSigner.USER}. Descriptors the SDK
 * signs on its own (no `USER` signer) are held back — `checkSetup` completes
 * them inline, so surfacing them would render inert cards the user can't act on.
 *
 * Membership is a property of the descriptor's `signers` alone, independent of
 * any account: use this to build the onboarding list, then layer each entry's
 * satisfied/unsatisfied state on top from a live `checkSetup` so the tick never
 * goes stale.
 *
 * @param setup The provider's `setup` descriptors, in their declared order.
 * @public
 */
export function selectUserSetupActions(
  setup: ProviderAction[]
): ProviderAction[] {
  return setup.filter((descriptor) =>
    descriptor.signers.includes(PerpsSigner.USER)
  )
}
