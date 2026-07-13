/**
 * Feature switch for hard inventory enforcement in the clinic shop.
 *
 * When ON (CHECKOUT_ENFORCE_STOCK=true): checkout rejects carts whose
 * quantities exceed sellable stock (onHand − reserved), and the catalog
 * surfaces real availability so product cards show "Out of Stock" and cap
 * quantity steppers.
 *
 * When OFF (default): pre-enforcement behavior — orders are accepted
 * regardless of recorded stock and products always present as purchasable.
 * This is the safe default while inventory counts are not yet maintained in
 * the database; flipping the gate on with all-zero counts would block every
 * checkout (observed in prod Jul 13).
 */
export function stockEnforcementEnabled(): boolean {
  return process.env.CHECKOUT_ENFORCE_STOCK === 'true'
}
