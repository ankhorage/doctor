import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DoctorDiagnostic } from './diagnostics.js';

export type DoctorTargetCheck = 'package' | 'repo';
export type DoctorTargetMode = 'fix' | 'package' | 'repo' | 'validate';

export interface DoctorAnalysisRequest {
  readonly cwd: string;
  readonly inputPath?: string;
  readonly mode: DoctorTargetMode;
}

export interface DoctorAnalysisResult {
  readonly appliedChecks: readonly DoctorTargetCheck[];
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly hasPackageJson: boolean;
  readonly repoMarkers: readonly string[];
  readonly targetPath: string;
}

const REPO_MARKERS = [
  { label: '.git', relativePath: '.git' },
  { label: '.github/workflows', relativePath: path.join('.github', 'workflows') },
  { label: '.changeset', relativePath: '.changeset' },
  { label: 'package.json', relativePath: 'package.json' },
  { label: 'pnpm-workspace.yaml', relativePath: 'pnpm-workspace.yaml' },
  { label: 'bun.lock', relativePath: 'bun.lock' },
  { label: 'bun.lockb', relativePath: 'bun.lockb' },
  { label: 'package-lock.json', relativePath: 'package-lock.json' },
  { label: 'yarn.lock', relativePath: 'yarn.lock' },
] as const;

export async function analyzeDoctorTarget(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  const targetPath = path.resolve(request.cwd, request.inputPath ?? '.');
  const stats = await statOrNull(targetPath);

  if (stats === null) {
    return {
      appliedChecks: [],
      diagnostics: [
        createDiagnostic(
          'error',
          'target-not-found',
          targetPath,
          `Target path does not exist: ${targetPath}`,
        ),
      ],
      hasPackageJson: false,
      repoMarkers: [],
      targetPath,
    };
  }

  if (!stats.isDirectory()) {
    return {
      appliedChecks: [],
      diagnostics: [
        createDiagnostic(
          'error',
          'target-not-directory',
          targetPath,
          `Target path must be a directory: ${targetPath}`,
        ),
      ],
      hasPackageJson: false,
      repoMarkers: [],
      targetPath,
    };
  }

  const repoMarkers = (
    await Promise.all(
      REPO_MARKERS.map(async (marker) =>
        (await pathExists(path.join(targetPath, marker.relativePath))) ? marker.label : null,
      ),
    )
  ).filter((marker): marker is (typeof REPO_MARKERS)[number]['label'] => marker !== null);

  const packageJsonPath = path.join(targetPath, 'package.json');
  const hasPackageJson = repoMarkers.includes('package.json');
  const appliedChecks: DoctorTargetCheck[] = [];
  const diagnostics: DoctorDiagnostic[] = [];

  const shouldRunRepoChecks =
    request.mode === 'repo' ||
    ((request.mode === 'validate' || request.mode === 'fix') && repoMarkers.length > 0);
  const shouldRunPackageChecks =
    request.mode === 'package' ||
    ((request.mode === 'validate' || request.mode === 'fix') && hasPackageJson);

  if (request.mode === 'repo' && repoMarkers.length === 0) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'repo-markers-missing',
        targetPath,
        'Target is not a repo/workspace-root candidate because no repo markers were found.',
      ),
    );
  }

  if (request.mode === 'package' && !hasPackageJson) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'package-json-missing',
        packageJsonPath,
        'Target does not contain a readable package.json file.',
      ),
    );
  }

  if (
    (request.mode === 'validate' || request.mode === 'fix') &&
    repoMarkers.length === 0 &&
    !hasPackageJson
  ) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'unsupported-target',
        targetPath,
        'Target is neither a repo/workspace-root candidate nor a package root.',
      ),
    );
  }

  if (shouldRunRepoChecks && repoMarkers.length > 0) {
    appliedChecks.push('repo');
    diagnostics.push(...(await analyzeRepoLight(targetPath)));
  }

  if (shouldRunPackageChecks && hasPackageJson) {
    appliedChecks.push('package');
    diagnostics.push(...(await analyzePackageLight(targetPath, packageJsonPath)));
  }

  return {
    appliedChecks,
    diagnostics,
    hasPackageJson,
    repoMarkers,
    targetPath,
  };
}

async function analyzeRepoLight(targetPath: string): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];

  await maybeWarnForMissingPath(diagnostics, targetPath, 'README.md', 'missing-readme');
  await maybeWarnForMissingPath(diagnostics, targetPath, 'CHANGELOG.md', 'missing-changelog');
  await maybeWarnForMissingPath(diagnostics, targetPath, 'LICENSE', 'missing-license');
  await maybeWarnForMissingPath(
    diagnostics,
    targetPath,
    '.changeset',
    'missing-changeset-directory',
  );
  await maybeWarnForMissingPath(
    diagnostics,
    targetPath,
    path.join('.github', 'workflows'),
    'missing-workflows-directory',
  );

  return diagnostics;
}

async function analyzePackageLight(
  targetPath: string,
  packageJsonPath: string,
): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown;
  } catch (error) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'invalid-package-json',
        packageJsonPath,
        createInvalidPackageJsonMessage(error),
      ),
    );
    return diagnostics;
  }

  if (!isRecord(parsed)) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'invalid-package-json',
        packageJsonPath,
        'package.json must contain a JSON object.',
      ),
    );
    return diagnostics;
  }

  if (!isNonEmptyString(parsed.name)) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'package-name-missing',
        packageJsonPath,
        'package.json must define a non-empty "name" field.',
      ),
    );
  }

  if (!isNonEmptyString(parsed.version)) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'package-version-missing',
        packageJsonPath,
        'package.json must define a non-empty "version" field.',
      ),
    );
  }

  if (!isNonEmptyString(parsed.type)) {
    diagnostics.push(
      createDiagnostic(
        'error',
        'package-type-missing',
        packageJsonPath,
        'package.json must define a non-empty "type" field.',
      ),
    );
  }

  if ('ankh' in parsed) {
    const validationError = validateAnkhMetadataShape(parsed.ankh);
    if (validationError !== null) {
      diagnostics.push(
        createDiagnostic('error', 'invalid-ankh-metadata', targetPath, validationError),
      );
    }
  }

  return diagnostics;
}

async function maybeWarnForMissingPath(
  diagnostics: DoctorDiagnostic[],
  rootPath: string,
  relativePath: string,
  code:
    | 'missing-changelog'
    | 'missing-changeset-directory'
    | 'missing-license'
    | 'missing-readme'
    | 'missing-workflows-directory',
): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  if (await pathExists(absolutePath)) {
    return;
  }

  diagnostics.push(
    createDiagnostic(
      'warning',
      code,
      absolutePath,
      `Missing expected repo artifact: ${relativePath}`,
    ),
  );
}

function validateAnkhMetadataShape(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'package.json "ankh" metadata must be an object when present.';
  }

  if (!isNonEmptyString(value.category)) {
    return 'package.json "ankh.category" must be a non-empty string.';
  }

  if (!(value.provider === null || isPackageRelativeProviderPath(value.provider))) {
    return 'package.json "ankh.provider" must be null or a package-relative "./..." string.';
  }

  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.some((capability) => !isNonEmptyString(capability))
  ) {
    return 'package.json "ankh.capabilities" must be an array of non-empty strings.';
  }

  return null;
}

function createDiagnostic(
  severity: DoctorDiagnostic['severity'],
  code: DoctorDiagnostic['code'],
  diagnosticPath: string,
  message: string,
): DoctorDiagnostic {
  return {
    code,
    message,
    path: diagnosticPath,
    severity,
  };
}

function createInvalidPackageJsonMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `package.json contains invalid JSON: ${message}`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return (await statOrNull(targetPath)) !== null;
}

async function statOrNull(targetPath: string) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === 'ENOENT'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPackageRelativeProviderPath(value: unknown): value is string {
  return isNonEmptyString(value) && value.startsWith('./');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
