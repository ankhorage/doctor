import { promises as fs } from 'node:fs';
import path from 'node:path';

import { AUTHZ_ENGINES, AUTHZ_KINDS } from '@ankhorage/contracts';
import { type AuthFlowConfig, resolveAuthFlow } from '@ankhorage/contracts/auth';

import type {
  DoctorAnalysisRequest,
  DoctorAnalysisResult,
  DoctorFixPlan,
  DoctorPlannedChange,
} from './analysis.js';
import { analyzeAuthReadinessFile } from './authReadinessFileAnalysis.js';
import type {
  DoctorDiagnostic,
  DoctorDiagnosticCode,
  DoctorPolicyProfile,
  DoctorRuleId,
} from './diagnostics.js';
import { analyzeSecretStoreManifest } from './secretManifestAnalysis.js';

const MANIFEST_PROFILE = 'app-manifest' satisfies DoctorPolicyProfile;
const AUTH_ACTION_ROUTE_KEYS = [
  'signInRoute',
  'signUpRoute',
  'signOutRoute',
  'forgotPasswordRoute',
  'otpRoute',
] as const satisfies readonly (keyof AuthFlowConfig)[];
const OPTIONAL_ROUTE_KEYS = [
  'signUpRoute',
  'signOutRoute',
  'forgotPasswordRoute',
  'otpRoute',
  'unauthorizedRoute',
] as const satisfies readonly (keyof AuthFlowConfig)[];

type AuthActionRouteKey = (typeof AUTH_ACTION_ROUTE_KEYS)[number];
type OptionalRouteKey = (typeof OPTIONAL_ROUTE_KEYS)[number];

export async function analyzeAppManifestTarget(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult | null> {
  const targetPath = path.resolve(request.cwd, request.inputPath ?? '.');
  const stats = await statOrNull(targetPath);

  if (
    stats === null ||
    !stats.isFile() ||
    path.extname(targetPath).toLowerCase() !== '.json' ||
    (request.mode !== 'validate' && request.mode !== 'fix')
  ) {
    return null;
  }

  const authReadiness = await analyzeAuthReadinessFile(targetPath);
  const diagnostics = [
    ...(await analyzeAppManifestFile(targetPath)),
    ...authReadiness.diagnostics,
  ];
  const plannedChanges: DoctorPlannedChange[] = [];
  const fixPlan: DoctorFixPlan | null =
    request.mode === 'fix'
      ? {
          changes: plannedChanges,
          diagnostics,
          profile: MANIFEST_PROFILE,
          targetPath,
        }
      : null;

  return {
    appliedChecks: ['manifest'],
    diagnostics,
    fixPlan,
    hasPackageJson: false,
    plannedChanges,
    profile: MANIFEST_PROFILE,
    readiness: authReadiness.readiness,
    repoMarkers: [],
    targetPath,
  };
}

export async function analyzeAppManifestFile(filePath: string): Promise<DoctorDiagnostic[]> {
  let source: string;

  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    return [
      createManifestDiagnostic({
        code: 'invalid-app-manifest-json',
        message: `Could not read app manifest JSON: ${toErrorMessage(error)}`,
        path: filePath,
        ruleId: 'manifest.json.readable',
      }),
    ];
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(source) as unknown;
  } catch (error) {
    return [
      createManifestDiagnostic({
        code: 'invalid-app-manifest-json',
        message: `App manifest JSON is invalid: ${toErrorMessage(error)}`,
        path: filePath,
        ruleId: 'manifest.json.valid',
      }),
    ];
  }

  return analyzeAppManifest(manifest, filePath);
}

export function analyzeAppManifest(
  manifest: unknown,
  manifestPath = 'manifest.json',
): DoctorDiagnostic[] {
  if (!isRecord(manifest)) {
    return [
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'App manifest root must be an object.',
        path: manifestPath,
        ruleId: 'manifest.root.valid-shape',
      }),
    ];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  diagnostics.push(...analyzeAuthFlowOwnership(manifest, manifestPath));
  diagnostics.push(...analyzeInfraAuth(manifest.infra, manifestPath));
  diagnostics.push(...analyzeSecretStoreManifest(manifest, manifestPath));
  return diagnostics;
}

function analyzeAuthFlowOwnership(
  manifest: Record<string, unknown>,
  manifestPath: string,
): DoctorDiagnostic[] {
  const settings = manifest.settings;
  if (!isRecord(settings) || !Object.prototype.hasOwnProperty.call(settings, 'authFlow')) return [];

  return [
    createManifestDiagnostic({
      code: 'field-invalid',
      message: 'settings.authFlow was removed. Move authentication flow to infra.auth.flow.',
      path: manifestPath,
      ruleId: 'manifest.settings.auth-flow.removed',
    }),
  ];
}

function analyzeInfraAuth(infraValue: unknown, manifestPath: string): DoctorDiagnostic[] {
  if (infraValue === undefined) return [];
  if (!isRecord(infraValue)) {
    return [
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'manifest.infra must be an object.',
        path: manifestPath,
        ruleId: 'manifest.infra.valid-shape',
      }),
    ];
  }

  const authValue = infraValue.auth;
  if (authValue === undefined) return [];
  if (!isRecord(authValue)) {
    return [
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'manifest.infra.auth must be an object.',
        path: manifestPath,
        ruleId: 'manifest.auth.valid-shape',
      }),
    ];
  }

  return [
    ...analyzeAuthFlow(authValue.flow, manifestPath),
    ...analyzeAuthorization(authValue.authorization, manifestPath),
  ];
}

function analyzeAuthFlow(flowValue: unknown, manifestPath: string): DoctorDiagnostic[] {
  if (flowValue === undefined) return [];
  if (!isRecord(flowValue)) {
    return [
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'infra.auth.flow must be an object.',
        path: manifestPath,
        ruleId: 'manifest.auth.flow.valid-shape',
      }),
    ];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  const resolvedFlow = resolveAuthFlow(flowValue as Partial<AuthFlowConfig>);
  for (const key of AUTH_ACTION_ROUTE_KEYS) {
    if (!isNonEmptyString(resolvedFlow[key])) {
      diagnostics.push(
        createManifestDiagnostic({
          code: 'field-missing',
          message: `infra.auth.flow.${key} must be a non-empty route string.`,
          path: manifestPath,
          ruleId: 'manifest.auth.flow.route.required',
        }),
      );
    }
  }

  for (const key of OPTIONAL_ROUTE_KEYS) {
    const value = resolvedFlow[key];
    if (value !== undefined && !isValidAbsoluteRoute(value)) {
      diagnostics.push(
        createManifestDiagnostic({
          code: 'field-invalid',
          message: `infra.auth.flow.${key} must be an absolute app route when configured.`,
          path: manifestPath,
          ruleId: 'manifest.auth.flow.route.valid',
        }),
      );
    }
  }

  if (!isValidAbsoluteRoute(resolvedFlow.signInRoute)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'infra.auth.flow.signInRoute must be an absolute app route.',
        path: manifestPath,
        ruleId: 'manifest.auth.flow.route.valid',
      }),
    );
  }

  if (!isValidAbsoluteRoute(resolvedFlow.postSignInRoute)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'infra.auth.flow.postSignInRoute must be an absolute app route.',
        path: manifestPath,
        ruleId: 'manifest.auth.flow.route.valid',
      }),
    );
  }

  diagnostics.push(...analyzeRouteUniqueness(resolvedFlow, manifestPath));
  return diagnostics;
}

function analyzeRouteUniqueness(
  flow: AuthFlowConfig,
  manifestPath: string,
): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];
  const routes = [
    ...AUTH_ACTION_ROUTE_KEYS.map((key) => [key, flow[key]] as const),
    ['unauthorizedRoute', flow.unauthorizedRoute] as const,
  ].filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string');

  const ownersByRoute = new Map<string, string[]>();
  for (const [key, route] of routes) {
    const owners = ownersByRoute.get(route) ?? [];
    owners.push(key);
    ownersByRoute.set(route, owners);
  }

  for (const [route, owners] of ownersByRoute) {
    if (owners.length <= 1) continue;
    const allowedUnauthorizedAlias =
      route === flow.signInRoute &&
      owners.length === 2 &&
      owners.includes('signInRoute') &&
      owners.includes('unauthorizedRoute');
    if (allowedUnauthorizedAlias) continue;

    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: `Auth action route ${route} is assigned to multiple flow actions: ${owners.join(', ')}.`,
        path: manifestPath,
        ruleId: 'manifest.auth.flow.route.unique',
      }),
    );
  }

  if (routes.some(([, route]) => route === flow.postSignInRoute)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'infra.auth.flow.postSignInRoute must differ from every auth action route.',
        path: manifestPath,
        ruleId: 'manifest.auth.flow.post-sign-in.distinct',
      }),
    );
  }

  return diagnostics;
}

function analyzeAuthorization(
  authorizationValue: unknown,
  manifestPath: string,
): DoctorDiagnostic[] {
  if (authorizationValue === undefined) return [];
  if (!isRecord(authorizationValue)) {
    return [
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'infra.auth.authorization must be an object.',
        path: manifestPath,
        ruleId: 'manifest.auth.authorization.valid-shape',
      }),
    ];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  if (!AUTHZ_KINDS.some((kind) => kind === authorizationValue.kind)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: `infra.auth.authorization.kind must be one of: ${AUTHZ_KINDS.join(', ')}.`,
        path: manifestPath,
        ruleId: 'manifest.auth.authorization.kind.valid',
      }),
    );
  }
  if (!AUTHZ_ENGINES.some((engine) => engine === authorizationValue.engine)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: `infra.auth.authorization.engine must be one of: ${AUTHZ_ENGINES.join(', ')}.`,
        path: manifestPath,
        ruleId: 'manifest.auth.authorization.engine.valid',
      }),
    );
  }
  return diagnostics;
}

function createManifestDiagnostic(input: {
  readonly code: DoctorDiagnosticCode;
  readonly message: string;
  readonly path: string;
  readonly ruleId: DoctorRuleId;
}): DoctorDiagnostic {
  return {
    code: input.code,
    message: input.message,
    path: input.path,
    profile: MANIFEST_PROFILE,
    ruleId: input.ruleId,
    severity: 'error',
  };
}

function isValidAbsoluteRoute(value: string): boolean {
  return value.startsWith('/') && !value.includes('://') && !value.includes('?') && !value.includes('#');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
