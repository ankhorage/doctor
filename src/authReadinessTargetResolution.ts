import type { AppDeployTargetId, AppDeployTargets } from '@ankhorage/contracts/deploy';

import type { DoctorDiagnostic } from './diagnostics.js';

export interface AuthReadinessTargetResolution {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly targets: AppDeployTargets | null;
}
