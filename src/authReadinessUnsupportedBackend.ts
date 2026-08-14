import type { AppDeployTargetId } from '@ankhorage/contracts/deploy';
import { APP_DEPLOY_ENVIRONMENT_IDS } from '@ankhorage/contracts/deploy';

import {
  createUnsupportedAuthDiagnostic,
  createUnsupportedAuthReadiness,
} from './authReadinessUnsupported.js';
import type { DoctorDiagnostic } from './diagnostics.js';
import type { DoctorReadiness } from './readiness.js';

export function analyzeUnsupportedAuthBackend(input: {
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly manifestPath: string;
  readonly provider: string;
}): {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly readiness: readonly DoctorReadiness[];
} {
  return {
    diagnostics: [
      createUnsupportedAuthDiagnostic({
        message: 'Configured OAuth backend has no Doctor setup resolver.',
        path: input.manifestPath,
      }),
    ],
    readiness: APP_DEPLOY_ENVIRONMENT_IDS.flatMap((environment) =>
      createUnsupportedAuthReadiness({
        environment,
        provider: input.provider,
        targets: input.enabledTargets,
      }),
    ),
  };
}
