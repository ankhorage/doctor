import { createRepositoryRuleSet } from '@ankhorage/rules-repository';

import type { DoctorDiagnosticSeverity, DoctorRuleId } from '../diagnostics.js';

/***
 * Resolves one canonical repository rule by its stable Doctor rule id.
 */
export function getRepositoryRule(ruleId: DoctorRuleId): {
  readonly id: DoctorRuleId;
  readonly severity: DoctorDiagnosticSeverity;
} {
  const rule = createRepositoryRuleSet().rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) {
    throw new Error('Unknown repository rule: ' + ruleId);
  }
  if (rule.defaultSeverity === 'info') {
    throw new Error('Doctor does not support info-level repository diagnostics: ' + ruleId);
  }
  return { id: ruleId, severity: rule.defaultSeverity };
}
