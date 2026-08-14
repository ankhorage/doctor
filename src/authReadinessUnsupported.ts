import type { AppDeployEnvironmentId, AppDeployTargetId } from '@ankhorage/contracts/deploy';

import { createAuthReadinessDiagnostic } from './authReadinessDiagnostic.js';
import type { DoctorDiagnostic } from './diagnostics.js';
import type { DoctorReadiness } from './readiness.js';

export function createUnsupportedAuthReadiness(input: {
  readonly environment: AppDeployEnvironmentId;
  readonly provider: string;
  readonly targets: readonly AppDeployTargetId[];
}): DoctorReadiness[] {
  return input.targets.map((target) => ({
    category: 'auth-oauth',
    environment: input.environment,
    message: 'The selected backend/provider/transport combination has no setup capability.',
    provider: input.provider,
    status: 'unsupported',
    target,
    transport: 'brokeredRedirect',
  }));
}

export function createUnsupportedAuthDiagnostic(input: {
  readonly message: string;
  readonly path: string;
}): DoctorDiagnostic {
  return createAuthReadinessDiagnostic({
    code: 'field-invalid',
    message: input.message,
    path: input.path,
    ruleId: 'manifest.auth.oauth.setup.supported',
    severity: 'error',
  });
}
