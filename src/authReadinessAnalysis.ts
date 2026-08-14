import { promises as fs } from 'node:fs';

import type { AuthOAuthSetupPlan } from '@ankhorage/contracts/auth';
import {
  APP_DEPLOY_ENVIRONMENT_IDS,
  APP_DEPLOY_TARGET_IDS,
  type AppDeployTargetId,
  type AppDeployTargets,
  isAppDeployManifest,
} from '@ankhorage/contracts/deploy';
import { normalizeSecretRef } from '@ankhorage/contracts/secrets';
import { resolveSupabaseOAuthSetupPlan } from '@ankhorage/supabase-auth';

import type { DoctorDiagnostic } from './diagnostics.js';
import type { DoctorReadiness } from './readiness.js';

const PROFILE = 'app-manifest' as const;
const TRANSPORT = 'brokeredRedirect' as const;

export interface DoctorAuthReadinessAnalysis {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly readiness: readonly DoctorReadiness[];
}

export async function analyzeAuthReadinessFile(
  filePath: string,
): Promise<DoctorAuthReadinessAnalysis> {
  try {
    const manifest = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    return analyzeAuthReadiness(manifest, filePath);
  } catch {
    return { diagnostics: [], readiness: [] };
  }
}

export function analyzeAuthReadiness(
  manifest: unknown,
  manifestPath = 'manifest.json',
): DoctorAuthReadinessAnalysis {
  if (!isRecord(manifest)) return { diagnostics: [], readiness: [] };

  const infra = isRecord(manifest.infra) ? manifest.infra : null;
  const auth = infra !== null && isRecord(infra.auth) ? infra.auth : null;
  const oauth = auth !== null && isRecord(auth.oauth) ? auth.oauth : null;
  if (oauth?.enabled !== true || !Array.isArray(oauth.providers)) {
    return { diagnostics: [], readiness: [] };
  }

  const targetResult = resolveTargets(manifest.deploy, manifestPath);
  const diagnostics = [...targetResult.diagnostics];
  if (targetResult.targets === null) return { diagnostics, readiness: [] };

  const providers = oauth.providers.filter(
    (provider): provider is Record<string, unknown> =>
      isRecord(provider) && provider.enabled !== false,
  );
  const readiness: DoctorReadiness[] = [];

  for (const provider of providers) {
    const providerId = typeof provider.id === 'string' ? provider.id : '';
    if (providerId === '') continue;

    if (auth?.provider !== 'supabase') {
      diagnostics.push(
        diagnostic(
          'field-invalid',
          'Configured OAuth backend has no Doctor setup resolver.',
          manifestPath,
          'manifest.auth.oauth.setup.supported',
        ),
      );
      readiness.push(...unsupportedReadiness(providerId, targetResult.enabledTargets));
      continue;
    }

    const plan = resolveSupabaseOAuthSetupPlan({
      provider: providerId,
      transport: TRANSPORT,
      environment: 'local',
      targets: targetResult.enabledTargets,
    });
    if (plan === null) {
      diagnostics.push(
        diagnostic(
          'field-invalid',
          `OAuth provider "${providerId}" is not supported by the Supabase ${TRANSPORT} setup resolver.`,
          manifestPath,
          'manifest.auth.oauth.setup.supported',
        ),
      );
      readiness.push(...unsupportedReadiness(providerId, targetResult.enabledTargets));
      continue;
    }

    const credentialRefReady = hasCanonicalCredentialRef(provider.credentialsRef);
    const callbackRouteReady = isAbsoluteRoute(oauth.callbackRoute);
    const requiredCredentialRef = requiresTrustedCredential(plan);

    for (const environment of APP_DEPLOY_ENVIRONMENT_IDS) {
      for (const target of targetResult.enabledTargets) {
        const missing = collectMissingRequirements({
          callbackRouteReady,
          credentialRefReady,
          requiredCredentialRef,
          target,
          targets: targetResult.targets,
        });
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

    addNativeCallbackDiagnostics({
      diagnostics,
      manifestPath,
      plan,
      targets: targetResult.targets,
    });
  }

  return { diagnostics, readiness };
}

function resolveTargets(
  deploy: unknown,
  manifestPath: string,
): {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly enabledTargets: readonly AppDeployTargetId[];
  readonly targets: AppDeployTargets | null;
} {
  if (deploy === undefined) {
    return {
      diagnostics: [
        warning(
          'deploy.targets is missing; Doctor evaluates legacy Web-only readiness until canonical targets are persisted.',
          manifestPath,
          'manifest.deploy.targets.legacy-web',
        ),
      ],
      enabledTargets: ['web'],
      targets: { web: { enabled: true } },
    };
  }

  if (!isAppDeployManifest(deploy)) {
    return {
      diagnostics: [
        diagnostic(
          'field-invalid',
          'manifest.deploy must match the canonical Contracts deploy target model.',
          manifestPath,
          'manifest.deploy.valid-shape',
        ),
      ],
      enabledTargets: [],
      targets: null,
    };
  }

  const enabledTargets = APP_DEPLOY_TARGET_IDS.filter(
    (target) => deploy.targets[target]?.enabled === true,
  );
  if (enabledTargets.length === 0) {
    return {
      diagnostics: [
        diagnostic(
          'field-missing',
          'manifest.deploy.targets must enable at least one application target.',
          manifestPath,
          'manifest.deploy.targets.enabled',
        ),
      ],
      enabledTargets,
      targets: deploy.targets,
    };
  }

  return { diagnostics: [], enabledTargets, targets: deploy.targets };
}

function collectMissingRequirements(input: {
  readonly callbackRouteReady: boolean;
  readonly credentialRefReady: boolean;
  readonly requiredCredentialRef: boolean;
  readonly target: AppDeployTargetId;
  readonly targets: AppDeployTargets;
}): string[] {
  const missing: string[] = [];
  if (input.requiredCredentialRef && !input.credentialRefReady)
    missing.push('credential reference');
  if (!input.callbackRouteReady) missing.push('callback route');
  if (input.target !== 'web' && input.targets[input.target]?.scheme === undefined) {
    missing.push(`${input.target} deep-link scheme`);
  }
  return missing;
}

function addNativeCallbackDiagnostics(input: {
  readonly diagnostics: DoctorDiagnostic[];
  readonly manifestPath: string;
  readonly plan: AuthOAuthSetupPlan;
  readonly targets: AppDeployTargets;
}): void {
  for (const requirement of input.plan.requirements) {
    if (
      requirement.kind !== 'callback' ||
      requirement.role !== 'app' ||
      requirement.required !== true ||
      requirement.target === undefined ||
      requirement.target === 'web'
    ) {
      continue;
    }
    if (input.targets[requirement.target]?.scheme !== undefined) continue;

    input.diagnostics.push(
      diagnostic(
        'field-missing',
        `Enabled ${requirement.target} brokered OAuth requires deploy.targets.${requirement.target}.scheme for the app callback.`,
        input.manifestPath,
        'manifest.auth.oauth.callback-target.configured',
      ),
    );
  }
}

function unsupportedReadiness(
  provider: string,
  targets: readonly AppDeployTargetId[],
): DoctorReadiness[] {
  return APP_DEPLOY_ENVIRONMENT_IDS.flatMap((environment) =>
    targets.map((target) => ({
      category: 'auth-oauth' as const,
      environment,
      message: 'The selected backend/provider/transport combination has no setup capability.',
      provider,
      status: 'unsupported' as const,
      target,
      transport: TRANSPORT,
    })),
  );
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

function diagnostic(
  code: DoctorDiagnostic['code'],
  message: string,
  path: string,
  ruleId: DoctorDiagnostic['ruleId'],
): DoctorDiagnostic {
  return { code, message, path, profile: PROFILE, ruleId, severity: 'error' };
}

function warning(
  message: string,
  path: string,
  ruleId: DoctorDiagnostic['ruleId'],
): DoctorDiagnostic {
  return { code: 'field-missing', message, path, profile: PROFILE, ruleId, severity: 'warning' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
