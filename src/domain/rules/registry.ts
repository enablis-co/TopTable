import type { SeatGuard } from '../allocate'
import type { RulePlan, SeatingRule } from './contract'
import type { RuleReport } from './engine'
import { evaluatePlan, seatGuardFrom } from './engine'

/**
 * Discovery: a new `*.rule.ts` file under this folder is registered by its presence alone, with
 * no edit to this or any other file (AGENTS.md; TT-14). The only file that knows about the glob
 * — every rule and engine test passes an explicit rule array instead, so none of them depends on
 * this mechanism.
 */
const modules = import.meta.glob<{ rule: SeatingRule }>('./*.rule.ts', { eager: true })

/**
 * `Object.values`, not indexed access — `noUncheckedIndexedAccess` types `modules[key]` as
 * possibly `undefined`. Sorted with plain comparison, not `localeCompare`, which is locale- and
 * ICU-dependent and would make this order vary by machine; rules are order-independent by
 * contract, so the sort exists only to make the visible output order stable.
 */
export const REGISTERED_RULES: readonly SeatingRule[] = Object.values(modules)
  .map((module) => module.rule)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

export function evaluateRegistered(plan: RulePlan): RuleReport {
  return evaluatePlan(plan, REGISTERED_RULES)
}

export function registeredSeatGuard(): SeatGuard {
  return seatGuardFrom(REGISTERED_RULES)
}
