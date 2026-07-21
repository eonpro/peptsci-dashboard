/**
 * Feature switch for hard inventory enforcement in the clinic shop.
 *
 * When ON (the default): checkout rejects carts whose quantities exceed
 * sellable stock (onHand − reserved), and the catalog surfaces real
 * availability so product cards show "Out of Stock" and cap quantity
 * steppers.
 *
 * Opt out with CHECKOUT_ENFORCE_STOCK=false — the pre-enforcement behavior
 * where orders are accepted regardless of recorded stock and products always
 * present as purchasable. Only use the escape hatch while inventory counts
 * are not yet maintained in the database; flipping the gate on with all-zero
 * counts blocks every checkout (observed in prod Jul 13 — run
 * `scripts/check-stock-enforcement-readiness.ts` before relying on the
 * default in a new environment).
 */
export function stockEnforcementEnabled(): boolean {
  return process.env.CHECKOUT_ENFORCE_STOCK !== 'false'
}
