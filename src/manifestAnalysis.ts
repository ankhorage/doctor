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

  const diagnostics = await analyzeAppManifestFile(targetPath);
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
        message: `App manifest must contain valid JSON: ${toErrorMessage(error)}`,
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
        message: 'App manifest root must be a JSON object.',
        path: manifestPath,
        ruleId: 'manifest.root.valid-shape',
      }),
    ];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  const { settings } = manifest;

  if (isRecord(settings) && hasOwn(settings, 'authFlow')) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message:
          'settings.authFlow was removed. Move this configuration manually to infra.auth.flow; Doctor will not migrate it automatically.',
        path: manifestPath,
        ruleId: 'manifest.settings.auth-flow.removed',
      }),
    );
  }

  const { infra } = manifest;
  if (infra === undefined) {
    return diagnostics;
  }

  if (!isRecord(infra)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'manifest.infra must be a JSON object when present.',
        path: manifestPath,
        ruleId: 'manifest.infra.valid-shape',
      }),
    );
    return diagnostics;
  }

  diagnostics.push(...analyzeSecretStoreManifest(infra, manifestPath));

  const { auth } = infra;
  if (auth === undefined) {
    return diagnostics;
  }

  if (!isRecord(auth)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'manifest.infra.auth must be a JSON object when present.',
        path: manifestPath,
        ruleId: 'manifest.auth.valid-shape',
      }),
    );
    return diagnostics;
  }

  const flow = parseAuthFlow(auth.flow, manifestPath, diagnostics);
  if (flow !== null) {
    validateAuthFlowRelationships(flow, manifestPath, diagnostics);
  }

  validateAuthorization(auth.authorization, manifestPath, diagnostics);

  return diagnostics;
}

function parseAuthFlow(
  value: unknown,
  manifestPath: string,
  diagnostics: DoctorDiagnostic[],
): AuthFlowConfig | null {
  if (value === undefined) {
    return resolveAuthFlow();
  }

  if (!isRecord(value)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'manifest.infra.auth.flow must be a JSON object when present.',
        path: manifestPath,
        ruleId: 'manifest.auth.flow.valid-shape',
      }),
    );
    return null;
  }

  const signInRoute = readRequiredRoute(value, 'signInRoute', manifestPath, diagnostics);
  const postSignInRoute = readRequiredRoute(value, 'postSignInRoute', manifestPath, diagnostics);
  const optionalRoutes = readOptionalRoutes(value, manifestPath, diagnostics);

  if (signInRoute === null || postSignInRoute === null || optionalRoutes === null) {
    return null;
  }

  return resolveAuthFlow({
    signInRoute,
    postSignInRoute,
    ...optionalRoutes,
  });
}

function readRequiredRoute(
  flow: Record<string, unknown>,
  key: 'postSignInRoute' | 'signInRoute',
  manifestPath: string,
  diagnostics: DoctorDiagnostic[],
): string | null {
  const value = flow[key];

  if (typeof value !== 'string' || value.trim() === '') {
    diagnostics.push(
      createManifestDiagnostic({
        code: value === undefined ? 'field-missing' : 'field-invalid',
        message: `manifest.infra.auth.flow.${key} must be a non-empty string.`,
        path: manifestPath,
        ruleId: 'manifest.auth.flow.route.required',
      }),
    );
    return null;
  }

  return value;
}

function readOptionalRoutes(
  flow: Record<string, unknown>,
  manifestPath: string,
  diagnostics: DoctorDiagnostic[],
): Pick<AuthFlowConfig, OptionalRouteKey> | null {
  const routes: Partial<Pick<AuthFlowConfig, OptionalRouteKey>> = {};
  let valid = true;

  for (const key of OPTIONAL_ROUTE_KEYS) {
    const value = flow[key];
    if (value === undefined) {
      continue;
    }

    if (typeof value !== 'string' || value.trim() === '') {
      valid = false;
      diagnostics.push(
        createManifestDiagnostic({
          code: 'field-invalid',
          message: `manifest.infra.auth.flow.${key} must be a non-empty string when present.`,
          path: manifestPath,
          ruleId: 'manifest.auth.flow.route.valid',
        }),
      );
      continue;
    }

    routes[key] = value;
  }

  return valid ? routes : null;
}

function validateAuthFlowRelationships(
  flow: AuthFlowConfig,
  manifestPath: string,
  diagnostics: DoctorDiagnostic[],
): void {
  const actionRoutes = AUTH_ACTION_ROUTE_KEYS.flatMap((key) => {
    const value = flow[key];
    return typeof value === 'string' ? [{ key, route: normalizeRoute(value) }] : [];
  });
  const routesByName = new Map<string, AuthActionRouteKey[]>();

  for (const entry of actionRoutes) {
    const keys = routesByName.get(entry.route) ?? [];
    keys.push(entry.key);
    routesByName.set(entry.route, keys);
  }

  for (const [route, keys] of routesByName) {
    if (keys.length < 2) {
      continue;
    }

    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: `Auth action routes must be unique; ${keys.join(', ')} all resolve to "${route}".`,
        path: manifestPath,
        ruleId: 'manifest.auth.flow.route.unique',
      }),
    );
  }

  const postSignInRoute = normalizeRoute(flow.postSignInRoute);
  const collidingAction = actionRoutes.find((entry) => entry.route === postSignInRoute);
  if (collidingAction !== undefined) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: `postSignInRoute must resolve outside the auth action routes; it collides with ${collidingAction.key}.`,
        path: manifestPath,
        ruleId: 'manifest.auth.flow.post-sign-in.distinct',
      }),
    );
  }

  if (flow.unauthorizedRoute === undefined) {
    return;
  }

  const unauthorizedRoute = normalizeRoute(flow.unauthorizedRoute);
  const signInRoute = normalizeRoute(flow.signInRoute);

  if (unauthorizedRoute === postSignInRoute) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: 'unauthorizedRoute must not resolve to postSignInRoute.',
        path: manifestPath,
        ruleId: 'manifest.auth.flow.unauthorized-route.valid',
      }),
    );
  }

  if (unauthorizedRoute === signInRoute) {
    return;
  }

  const collidingActionRoute = actionRoutes.find(
    (entry) => entry.key !== 'signInRoute' && entry.route === unauthorizedRoute,
  );
  if (collidingActionRoute !== undefined) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message: `unauthorizedRoute may alias signInRoute, but it must not collide with ${collidingActionRoute.key}.`,
        path: manifestPath,
        ruleId: 'manifest.auth.flow.unauthorized-route.valid',
      }),
    );
  }
}

function validateAuthorization(
  value: unknown,
  manifestPath: string,
  diagnostics: DoctorDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    diagnostics.push(
      createManifestDiagnostic({
        code: 'field-invalid',
        message:
          'manifest.infra.auth.authorization must be a JSON object when explicitly configured.',
        path: manifestPath,
        ruleId: 'manifest.auth.authorization.valid-shape',
      }),
    );
    return;
  }

  validateAuthorizationField({
    allowed: AUTHZ_KINDS,
    diagnostics,
    fieldName: 'kind',
    manifestPath,
    value: value.kind,
    ruleId: 'manifest.auth.authorization.kind.valid',
  });
  validateAuthorizationField({
    allowed: AUTHZ_ENGINES,
    diagnostics,
    fieldName: 'engine',
    manifestPath,
    value: value.engine,
    ruleId: 'manifest.auth.authorization.engine.valid',
  });
}

function validateAuthorizationField(request: {
  readonly allowed: readonly string[];
  readonly diagnostics: DoctorDiagnostic[];
  readonly fieldName: 'engine' | 'kind';
  readonly manifestPath: string;
  readonly ruleId: DoctorRuleId;
  readonly value: unknown;
}): void {
  if (typeof request.value === 'string' && request.allowed.includes(request.value)) {
    return;
  }

  request.diagnostics.push(
    createManifestDiagnostic({
      code: request.value === undefined ? 'field-missing' : 'field-invalid',
      message: `Explicit authorization.${request.fieldName} must be one of: ${request.allowed.join(', ')}.`,
      path: request.manifestPath,
      ruleId: request.ruleId,
    }),
  );
}

function createManifestDiagnostic(request: {
  readonly code: DoctorDiagnosticCode;
  readonly message: string;
  readonly path: string;
  readonly ruleId: DoctorRuleId;
}): DoctorDiagnostic {
  return {
    ...request,
    profile: MANIFEST_PROFILE,
    severity: 'error',
  };
}

function normalizeRoute(route: string): string {
  const normalized = route.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized === '' ? 'index' : normalized;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
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
