import type { AppDeployTargetId, AppDeployTargets } from '@ankhorage/contracts/deploy';

import type { DoctorReadiness } from './readiness.js';

export type NativeAuthReadinessContext = Pick<
  DoctorReadiness,
  'callbackScheme' | 'hostRequirement'
>;

export function resolveNativeAuthReadinessContext(input: {
  readonly target: AppDeployTargetId;
  readonly targets: AppDeployTargets;
}): NativeAuthReadinessContext {
  if (input.target === 'web') return {};

  const callbackScheme = input.targets[input.target]?.scheme;
  return {
    ...(callbackScheme === undefined ? {} : { callbackScheme }),
    hostRequirement: 'development-or-standalone-build',
  };
}

export function createAuthReadinessMessage(input: {
  readonly callbackScheme?: string;
  readonly missing: readonly string[];
  readonly target: AppDeployTargetId;
}): string {
  const base =
    input.missing.length === 0
      ? 'Manifest and adapter setup requirements are satisfiable; concrete callback URLs remain Infra/runtime-owned.'
      : `Missing ${input.missing.join(' and ')}.`;
  if (input.target === 'web') return base;

  const scheme =
    input.callbackScheme === undefined ? '' : ` Callback scheme: ${input.callbackScheme}.`;
  return `${base}${scheme} Native OAuth requires a development or standalone app build; runtime host compatibility remains runtime-owned.`;
}
