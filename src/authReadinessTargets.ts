import { APP_DEPLOY_TARGET_IDS, isAppDeployManifest } from '@ankhorage/contracts/deploy';

import { createAuthReadinessDiagnostic } from './authReadinessDiagnostic.js';
import { resolveAuthReadinessTargetFallback } from './authReadinessTargetFallback.js';
import type { AuthReadinessTargetResolution } from './authReadinessTargetResolution.js';

export function resolveAuthReadinessTargets(
  deploy: unknown,
  manifestPath: string,
): AuthReadinessTargetResolution {
  const fallback = resolveAuthReadinessTargetFallback(deploy, manifestPath);
  if (fallback !== null) return fallback;
  if (!isAppDeployManifest(deploy)) throw new Error('Canonical deploy narrowing failed.');

  const enabledTargets = APP_DEPLOY_TARGET_IDS.filter(
    (target) => deploy.targets[target]?.enabled === true,
  );
  if (enabledTargets.length > 0) {
    return { diagnostics: [], enabledTargets, targets: deploy.targets };
  }

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
