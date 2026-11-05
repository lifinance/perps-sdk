import { SPOT_CATEGORY_ID } from '@lifi/perps-types'

/**
 * Whether `categoryId` is the spot category ({@link SPOT_CATEGORY_ID}).
 *
 * @public
 */
export function isSpotCategory(categoryId: string): boolean {
  return categoryId === SPOT_CATEGORY_ID
}
