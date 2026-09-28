import type { ActionType, SetupAction, SetupOption } from '@lifi/perps-types'
import { PerpsSigner } from '@lifi/perps-types'

/**
 * Select the `Provider.setup` descriptors a user sees: every choice step, and
 * every non-choice step signed by {@link PerpsSigner.USER}. A non-choice step
 * the SDK signs on its own is held back — `checkSetup` completes it inline, so
 * surfacing it would render an inert card the user can't act on.
 *
 * Membership is a property of the descriptor alone, independent of any
 * account. When an account is available, prefer `ProviderSetup.checklist`
 * from `checkSetup` for the onboarding list — it applies this filter, omits
 * not-required conditional steps, and carries each entry's satisfied state.
 * This function remains the static, account-free projection.
 *
 * @param setup The provider's `setup` descriptors, in their declared order.
 * @public
 */
export function selectUserSetupActions(setup: SetupAction[]): SetupAction[] {
  return setup.filter(isUserFacingSetupStep)
}

/** Whether a setup step is shown to the user rather than drained silently. */
export function isUserFacingSetupStep(descriptor: SetupAction): boolean {
  return descriptor.options !== null || descriptor.signer === PerpsSigner.USER
}

/**
 * Narrow a setup option to the action it executes, so its bound `params` read
 * with that action's param shape.
 *
 * @public
 */
export function isSetupOptionFor<T extends ActionType>(
  option: SetupOption,
  type: T
): option is SetupOption<T> {
  return option.type === type
}
