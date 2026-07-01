export type DoctorDiagnosticCode =
  | 'invalid-ankh-metadata'
  | 'invalid-package-json'
  | 'missing-changelog'
  | 'missing-changeset-directory'
  | 'missing-license'
  | 'missing-readme'
  | 'missing-workflows-directory'
  | 'package-json-missing'
  | 'package-name-missing'
  | 'package-type-missing'
  | 'package-version-missing'
  | 'repo-markers-missing'
  | 'target-not-directory'
  | 'target-not-found'
  | 'unsupported-target';

export type DoctorDiagnosticSeverity = 'error' | 'warning';

export interface DoctorDiagnostic {
  readonly code: DoctorDiagnosticCode;
  readonly message: string;
  readonly path: string;
  readonly severity: DoctorDiagnosticSeverity;
}

export function countErrorDiagnostics(diagnostics: readonly DoctorDiagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
}

export function countWarningDiagnostics(diagnostics: readonly DoctorDiagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
}
