import {
  APP_DEPLOY_TARGET_IDS,
  isAppDeployManifest,
  type AppDeployTargetId,
  type AppDeployTargets,
} from '@ankhorage/contracts/deploy';

import { createAuthReadinessDiagnostic } from './authReadinessDiagnostic.js';
import type { DoctorDiagnostic } from './diagnostics.js';

export interface AuthReadinessTargetResolution {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly targets: AppDeployTargets | null;
}

export function resolveAuthReadinessTargets(
  deploy: unknown,
  manifestPath: string,
): AuthReadinessTargetResolution {
  if (deploy === undefined) return legacyWebTargets(manifestPath);
  if (!isAppDeployManifest(deploy)) return invalidTargets(manifestPath);

  const enabledTargets = APP_DEPLOY_TARGET_IDS.filter(
    (target) => deploy.targets[target]?.enabled === true,
  );
  if (enabledTargets.length === 0) {
    return {
      diagnostics: [
        createAuthReadinessDiagnostic({
          code: 'field-missing',
          message: 'manifest.deploy.targets must enable at least one application target.',
          path: manifestPath,
          ruleId: 'manifest.deploy.targets.enabled',
          severity: 'error',
        }),
      ],
      enabledTargets,
      targets: deploy.targets,
    };
  }

  return { diagnostics: [], enabledTargets, targets: deploy.targets };
}

function legacyWebTargets(manifestPath: string): AuthReadinessTargetResolution {
  return {
    diagnostics: [
      createAuthReadinessDiagnostic({
        code: 'field-missing',
        message:
          'deploy.targets is missing; Doctor evaluates legacy Web-only readiness until canonical targets are persisted.',
        path: manifestPath,
        ruleId: 'manifest.deploy.targets.legacy-web',
        severity: 'warning',
      }),
    ],
    enabledTargets: ['web'],
    targets: { web: { enabled: true } },
  };
}

function invalidTargets(manifestPath: string): AuthReadinessTargetResolution {
  return {
    diagnostics: [
      createAuthReadinessDiagnostic({
        code: 'field-invalid',
        message: 'manifest.deploy must match the canonical Contracts deploy target model.',
        path: manifestPath,
        ruleId: 'manifest.deploy.valid-shape',
        severity: 'error',
      }),
    ],
    enabledTargets: [],
    targets: null,
  };
}
