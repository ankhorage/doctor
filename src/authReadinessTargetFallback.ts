import { createAuthReadinessDiagnostic } from './authReadinessDiagnostic.js';
import type { AuthReadinessTargetResolution } from './authReadinessTargetResolution.js';

export function resolveAuthReadinessTargetFallback(
  deploy: unknown,
  manifestPath: string,
): AuthReadinessTargetResolution {
  if (deploy === undefined) {
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
