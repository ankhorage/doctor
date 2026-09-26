import { ARCHITECTURE_POLICY } from '@ankhorage/policy/architecture';

import type { DoctorRuleId } from '../diagnostics.js';

/***
 * Resolves one canonical architecture/profile Policy rule by its stable Doctor rule id.
 */
export function getArchitecturePolicyRule(ruleId: DoctorRuleId) {
  const rule = Object.values(ARCHITECTURE_POLICY.rules).find((entry) => entry.id === ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown architecture policy rule: ${ruleId}`);
  }

  return rule;
}
