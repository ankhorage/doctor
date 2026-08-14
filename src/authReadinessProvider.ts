import { APP_DEPLOY_ENVIRONMENT_IDS } from '@ankhorage/contracts/deploy';
import type { AppDeployTargetId, AppDeployTargets } from '@ankhorage/contracts/deploy';
import { resolveSupabaseOAuthSetupPlan } from '@ankhorage/supabase-auth';

import { createAuthReadinessDiagnostic } from './authReadinessDiagnostic.js';
import { collectMissingAuthReadinessRequirements } from './authReadinessRequirements.js';
import type { DoctorDiagnostic } from './diagnostics.js';
import type { DoctorReadiness } from './readiness.js';

const TRANSPORT = 'brokeredRedirect' as const;

export function analyzeAuthProviderReadiness(input: {
  readonly authProvider: unknown;
  readonly callbackRoute: unknown;
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly manifestPath: string;
  readonly provider: Record<string, unknown>;
  readonly targets: AppDeployTargets;
}): { readonly diagnostics: DoctorDiagnostic[]; readonly readiness: DoctorReadiness[] } {
  const providerId = typeof input.provider.id === 'string' ? input.provider.id : '';
  if (providerId === '') return { diagnostics: [], readiness: [] };
  if (input.authProvider !== 'supabase') return unsupportedBackend(input, providerId);

  const diagnostics: DoctorDiagnostic[] = [];
  const readiness: DoctorReadiness[] = [];
  const missingNativeTargets = new Set<AppDeployTargetId>();
  let unsupported = false;

  for (const environment of APP_DEPLOY_ENVIRONMENT_IDS) {
    const plan = resolveSupabaseOAuthSetupPlan({
      provider: providerId,
      transport: TRANSPORT,
      environment,
      targets: input.enabledTargets,
    });
    if (plan === null) {
      unsupported = true;
      readiness.push(...unsupportedEnvironment(providerId, input.enabledTargets, environment));
      continue;
    }

    for (const target of input.enabledTargets) {
      const missing = collectMissingAuthReadinessRequirements({
        callbackRoute: input.callbackRoute,
        credentialsRef: input.provider.credentialsRef,
        plan,
        target,
        targets: input.targets,
      });
      if (target !== 'web' && missing.includes(`${target} deep-link scheme`)) {
        missingNativeTargets.add(target);
      }
      readiness.push({
        category: 'auth-oauth',
        environment,
        message:
          missing.length === 0
            ? 'Manifest and adapter setup requirements are satisfiable; concrete callback URLs remain Infra/runtime-owned.'
            : `Missing ${missing.join(' and ')}.`,
        provider: providerId,
        status: missing.length === 0 ? 'ready' : 'missing',
        target,
        transport: TRANSPORT,
      });
    }
  }

  if (unsupported) diagnostics.push(unsupportedProviderDiagnostic(providerId, input.manifestPath));
  for (const target of missingNativeTargets) {
    diagnostics.push(nativeCallbackDiagnostic(target, input.manifestPath));
  }
  return { diagnostics, readiness };
}

function unsupportedBackend(
  input: Parameters<typeof analyzeAuthProviderReadiness>[0],
  providerId: string,
) {
  return {
    diagnostics: [
      createAuthReadinessDiagnostic({
        code: 'field-invalid',
        message: 'Configured OAuth backend has no Doctor setup resolver.',
        path: input.manifestPath,
        ruleId: 'manifest.auth.oauth.setup.supported',
        severity: 'error',
      }),
    ],
    readiness: APP_DEPLOY_ENVIRONMENT_IDS.flatMap((environment) =>
      unsupportedEnvironment(providerId, input.enabledTargets, environment),
    ),
  };
}

function unsupportedEnvironment(
  provider: string,
  targets: readonly AppDeployTargetId[],
  environment: (typeof APP_DEPLOY_ENVIRONMENT_IDS)[number],
): DoctorReadiness[] {
  return targets.map((target) => ({
    category: 'auth-oauth',
    environment,
    message: 'The selected backend/provider/transport combination has no setup capability.',
    provider,
    status: 'unsupported',
    target,
    transport: TRANSPORT,
  }));
}

function unsupportedProviderDiagnostic(providerId: string, path: string): DoctorDiagnostic {
  return createAuthReadinessDiagnostic({
    code: 'field-invalid',
    message: `OAuth provider "${providerId}" is not supported by the Supabase ${TRANSPORT} setup resolver.`,
    path,
    ruleId: 'manifest.auth.oauth.setup.supported',
    severity: 'error',
  });
}

function nativeCallbackDiagnostic(target: AppDeployTargetId, path: string): DoctorDiagnostic {
  return createAuthReadinessDiagnostic({
    code: 'field-missing',
    message: `Enabled ${target} brokered OAuth requires deploy.targets.${target}.scheme for the app callback.`,
    path,
    ruleId: 'manifest.auth.oauth.callback-target.configured',
    severity: 'error',
  });
}
