import type {
  AppDeployEnvironmentId,
  AppDeployTargetId,
  AppDeployTargets,
} from '@ankhorage/contracts/deploy';
import { resolveSupabaseOAuthSetupPlan } from '@ankhorage/supabase-auth';

import { analyzeAuthReadinessEnvironment } from './authReadinessEnvironment.js';
import { createUnsupportedAuthReadiness } from './authReadinessUnsupported.js';
import type { DoctorReadiness } from './readiness.js';

export function analyzeAuthProviderEnvironment(input: {
  readonly callbackRoute: unknown;
  readonly credentialsRef: unknown;
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly environment: AppDeployEnvironmentId;
  readonly provider: string;
  readonly targets: AppDeployTargets;
}): {
  readonly missingNativeTargets: readonly AppDeployTargetId[];
  readonly readiness: readonly DoctorReadiness[];
  readonly unsupported: boolean;
} {
  const plan = resolveSupabaseOAuthSetupPlan({
    provider: input.provider,
    transport: 'brokeredRedirect',
    environment: input.environment,
    targets: input.enabledTargets,
  });
  if (plan === null) {
    return {
      missingNativeTargets: [],
      readiness: createUnsupportedAuthReadiness({
        environment: input.environment,
        provider: input.provider,
        targets: input.enabledTargets,
      }),
      unsupported: true,
    };
  }

  return {
    ...analyzeAuthReadinessEnvironment({
      callbackRoute: input.callbackRoute,
      credentialsRef: input.credentialsRef,
      enabledTargets: input.enabledTargets,
      environment: input.environment,
      plan,
      provider: input.provider,
      targets: input.targets,
    }),
    unsupported: false,
  };
}
