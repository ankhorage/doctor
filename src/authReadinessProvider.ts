import type { AppDeployTargetId, AppDeployTargets } from '@ankhorage/contracts/deploy';
import { APP_DEPLOY_ENVIRONMENT_IDS } from '@ankhorage/contracts/deploy';
import { resolveSupabaseOAuthSetupPlan } from '@ankhorage/supabase-auth';

import { analyzeAuthReadinessEnvironment } from './authReadinessEnvironment.js';
import { createNativeAuthCallbackDiagnostic } from './authReadinessNativeDiagnostic.js';
import {
  createUnsupportedAuthDiagnostic,
  createUnsupportedAuthReadiness,
} from './authReadinessUnsupported.js';
import type { DoctorDiagnostic } from './diagnostics.js';
import type { DoctorReadiness } from './readiness.js';

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
      transport: 'brokeredRedirect',
      environment,
      targets: input.enabledTargets,
    });
    if (plan === null) {
      unsupported = true;
      readiness.push(
        ...createUnsupportedAuthReadiness({
          environment,
          provider: providerId,
          targets: input.enabledTargets,
        }),
      );
      continue;
    }

    const result = analyzeAuthReadinessEnvironment({
      callbackRoute: input.callbackRoute,
      credentialsRef: input.provider.credentialsRef,
      enabledTargets: input.enabledTargets,
      environment,
      plan,
      provider: providerId,
      targets: input.targets,
    });
    readiness.push(...result.readiness);
    result.missingNativeTargets.forEach((target) => missingNativeTargets.add(target));
  }

  if (unsupported) {
    diagnostics.push(
      createUnsupportedAuthDiagnostic({
        message: `OAuth provider "${providerId}" is not supported by the Supabase brokeredRedirect setup resolver.`,
        path: input.manifestPath,
      }),
    );
  }
  missingNativeTargets.forEach((target) =>
    diagnostics.push(createNativeAuthCallbackDiagnostic(target, input.manifestPath)),
  );
  return { diagnostics, readiness };
}

function unsupportedBackend(
  input: Parameters<typeof analyzeAuthProviderReadiness>[0],
  providerId: string,
) {
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
        provider: providerId,
        targets: input.enabledTargets,
      }),
    ),
  };
}
