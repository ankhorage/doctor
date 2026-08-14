import type { AuthOAuthSetupPlan } from '@ankhorage/contracts/auth';
import type {
  AppDeployEnvironmentId,
  AppDeployTargetId,
  AppDeployTargets,
} from '@ankhorage/contracts/deploy';

import { collectMissingAuthReadinessRequirements } from './authReadinessRequirements.js';
import type { DoctorReadiness } from './readiness.js';

export function analyzeAuthReadinessEnvironment(input: {
  readonly callbackRoute: unknown;
  readonly credentialsRef: unknown;
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly environment: AppDeployEnvironmentId;
  readonly plan: AuthOAuthSetupPlan;
  readonly provider: string;
  readonly targets: AppDeployTargets;
}): {
  readonly missingNativeTargets: readonly AppDeployTargetId[];
  readonly readiness: readonly DoctorReadiness[];
} {
  const missingNativeTargets = new Set<AppDeployTargetId>();
  const readiness = input.enabledTargets.map((target): DoctorReadiness => {
    const missing = collectMissingAuthReadinessRequirements({
      callbackRoute: input.callbackRoute,
      credentialsRef: input.credentialsRef,
      plan: input.plan,
      target,
      targets: input.targets,
    });
    if (target !== 'web' && missing.includes(`${target} deep-link scheme`)) {
      missingNativeTargets.add(target);
    }

    return {
      category: 'auth-oauth',
      environment: input.environment,
      message:
        missing.length === 0
          ? 'Manifest and adapter setup requirements are satisfiable; concrete callback URLs remain Infra/runtime-owned.'
          : `Missing ${missing.join(' and ')}.`,
      provider: input.provider,
      status: missing.length === 0 ? 'ready' : 'missing',
      target,
      transport: 'brokeredRedirect',
    };
  });

  return { missingNativeTargets: [...missingNativeTargets], readiness };
}
