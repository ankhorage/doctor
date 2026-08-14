import type { DoctorDiagnostic } from './diagnostics.js';

export function createAuthReadinessDiagnostic(input: {
  readonly code: DoctorDiagnostic['code'];
  readonly message: string;
  readonly path: string;
  readonly ruleId: DoctorDiagnostic['ruleId'];
  readonly severity: DoctorDiagnostic['severity'];
}): DoctorDiagnostic {
  return {
    code: input.code,
    message: input.message,
    path: input.path,
    profile: 'app-manifest',
    ruleId: input.ruleId,
    severity: input.severity,
  };
}
