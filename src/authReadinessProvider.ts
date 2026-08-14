import type { AppDeployTargetId, AppDeployTargets } from '@ankhorage/contracts/deploy';
import { APP_DEPLOY_ENVIRONMENT_IDS } from '@ankhorage/contracts/deploy';

import { createNativeAuthCallbackDiagnostic } from './authReadinessNativeDiagnostic.js';
import { analyzeAuthProviderEnvironment } from './authReadinessProviderEnvironment.js';
import { createUnsupportedAuthDiagnostic } from './authReadinessUnsupported.js';
import { analyzeUnsupportedAuthBackend } from './authReadinessUnsupportedBackend.js';
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
  if (input.authProvider !== 'supabase') {
    const result = analyzeUnsupportedAuthBackend({
      enabledTargets: input.enabledTargets,
      manifestPath: input.manifestPath,
      provider: providerId,
    });
    return { diagnostics: [...result.diagnostics], readiness: [...result.readiness] };
  }

  const diagnostics: DoctorDiagnostic[] = [];
  const readiness: DoctorReadiness[] = [];
  const missingNativeTargets = new Set<AppDeployTargetId>();
  let unsupported = false;

  for (const environment of APP_DEPLOY_ENVIRONMENT_IDS) {
    const result = analyzeAuthProviderEnvironment({
      callbackRoute: input.callbackRoute,
      credentialsRef: input.provider.credentialsRef,
      enabledTargets: input.enabledTargets,
      environment,
      provider: providerId,
      targets: input.targets,
    });
    readiness.push(...result.readiness);
    unsupported ||= result.unsupported;
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
