import type { AuthOAuthSetupPlan } from '@ankhorage/contracts/auth';
import type { AppDeployTargetId, AppDeployTargets } from '@ankhorage/contracts/deploy';
import { normalizeSecretRef } from '@ankhorage/contracts/secrets';

export function collectMissingAuthReadinessRequirements(input: {
  readonly callbackRoute: unknown;
  readonly credentialsRef: unknown;
  readonly plan: AuthOAuthSetupPlan;
  readonly target: AppDeployTargetId;
  readonly targets: AppDeployTargets;
}): readonly string[] {
  const missing: string[] = [];
  if (requiresTrustedCredential(input.plan) && !hasCanonicalCredentialRef(input.credentialsRef)) {
    missing.push('credential reference');
  }

  const callbackRequired = input.plan.requirements.some(
    (requirement) =>
      requirement.kind === 'callback' &&
      requirement.role === 'app' &&
      requirement.required &&
      requirement.target === input.target,
  );
  if (!callbackRequired) return missing;

  if (!isAbsoluteRoute(input.callbackRoute)) missing.push('callback route');
  if (input.target !== 'web' && input.targets[input.target]?.scheme === undefined) {
    missing.push(`${input.target} deep-link scheme`);
  }
  return missing;
}

function requiresTrustedCredential(plan: AuthOAuthSetupPlan): boolean {
  return plan.requirements.some(
    (requirement) =>
      requirement.kind === 'field' &&
      requirement.required &&
      requirement.persistence === 'trustedCredential',
  );
}

function hasCanonicalCredentialRef(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const result = normalizeSecretRef(value);
  return result.ok && result.data === value;
}

function isAbsoluteRoute(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('/') && value.trim().length > 0;
}
