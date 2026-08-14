import type { AppDeployTargetId } from '@ankhorage/contracts/deploy';

import { createAuthReadinessDiagnostic } from './authReadinessDiagnostic.js';
import type { DoctorDiagnostic } from './diagnostics.js';

export function createNativeAuthCallbackDiagnostic(
  target: AppDeployTargetId,
  path: string,
): DoctorDiagnostic {
  return createAuthReadinessDiagnostic({
    code: 'field-missing',
    message: `Enabled ${target} brokered OAuth requires deploy.targets.${target}.scheme for the app callback.`,
    path,
    ruleId: 'manifest.auth.oauth.callback-target.configured',
    severity: 'error',
  });
}
