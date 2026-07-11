import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { DoctorDiagnostic, DoctorPolicyProfile, DoctorRuleId } from './diagnostics.js';

export type DoctorTargetCheck = 'manifest' | 'package' | 'repo';
export type DoctorTargetMode = 'fix' | 'package' | 'repo' | 'validate';
export type DoctorPlannedChangeKind =
  'create-directory' | 'create-file' | 'update-json' | 'update-text';

export interface DoctorAnalysisRequest {
  readonly cwd: string;
  readonly inputPath?: string;
  readonly mode: DoctorTargetMode;
}

export interface DoctorPlannedChange {
  readonly description: string;
  readonly filePath: string;
  readonly kind: DoctorPlannedChangeKind;
  readonly ruleId: DoctorRuleId;
  readonly safe: boolean;
}

export interface DoctorFixPlan {
  readonly changes: readonly DoctorPlannedChange[];
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}

export interface DoctorAnalysisResult {
  readonly appliedChecks: readonly DoctorTargetCheck[];
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly fixPlan: DoctorFixPlan | null;
  readonly hasPackageJson: boolean;
  readonly plannedChanges: readonly DoctorPlannedChange[];
  readonly profile: DoctorPolicyProfile;
  readonly repoMarkers: readonly string[];
  readonly targetPath: string;
}

interface ProviderInspectionResult {
  readonly capabilities: readonly string[];
  readonly commandCapabilities: readonly string[];
  readonly commandPaths: readonly string[];
  readonly handlerPaths: readonly string[];
  readonly sourcePath: string;
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

const REQUIRED_PUBLIC_PACKAGE_SCRIPTS = [
  'build',
  'typecheck',
  'lint',
  'lint:fix',
  'format',
  'format:check',
  'test',
  'knip',
  'docs',
  'changeset',
  'changeset:status',
  'version-packages',
] as const;

const PROVIDER_SOURCE_CANDIDATES = [
  path.join('src', 'ankh.provider.ts'),
  path.join('src', 'ankh.provider.tsx'),
  path.join('src', 'ankh.provider.js'),
  path.join('src', 'ankh.provider.mjs'),
] as const;

export async function analyzeDoctorTarget(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  const targetPath = path.resolve(request.cwd, request.inputPath ?? '.');
  const stats = await statOrNull(targetPath);

  if (stats === null) {
    return createEarlyResult(
      targetPath,
      createDiagnostic({
        code: 'target-not-found',
        message: `Target path does not exist: ${targetPath}`,
        path: targetPath,
        profile: 'unknown',
        ruleId: 'target.path.exists',
        severity: 'error',
      }),
    );
  }

  if (!stats.isDirectory()) {
    return createEarlyResult(
      targetPath,
      createDiagnostic({
        code: 'target-not-directory',
        message: `Target path must be a directory: ${targetPath}`,
        path: targetPath,
        profile: 'unknown',
        ruleId: 'target.path.directory',
        severity: 'error',
      }),
    );
  }

  const repoMarkers = await findRepoMarkers(targetPath);
  const packageJsonPath = path.join(targetPath, 'package.json');
  const hasPackageJson = repoMarkers.includes('package.json');
  const appliedChecks: DoctorTargetCheck[] = [];
  const diagnostics: DoctorDiagnostic[] = [];
  const plannedChanges: DoctorPlannedChange[] = [];

  const packageJson = hasPackageJson ? await readPackageJson(packageJsonPath) : null;
  if (packageJson !== null && packageJson.diagnostic !== null) {
    diagnostics.push(packageJson.diagnostic);
  }

  const profile = detectProfile(repoMarkers, packageJson?.parsed ?? null);

  const shouldRunRepoChecks =
    request.mode === 'repo' ||
    ((request.mode === 'validate' || request.mode === 'fix') && repoMarkers.length > 0);
  const shouldRunPackageChecks =
    request.mode === 'package' ||
    ((request.mode === 'validate' || request.mode === 'fix') && hasPackageJson);

  if (request.mode === 'repo' && repoMarkers.length === 0) {
    diagnostics.push(
      createDiagnostic({
        code: 'unsupported-target',
        message:
          'Target is not a repo/workspace-root candidate because no repo markers were found.',
        path: targetPath,
        profile,
        ruleId: 'target.repo-markers.required',
        severity: 'error',
      }),
    );
  }

  if (request.mode === 'package' && !hasPackageJson) {
    diagnostics.push(
      createDiagnostic({
        code: 'unsupported-target',
        message: 'Target does not contain a readable package.json file.',
        path: packageJsonPath,
        profile,
        ruleId: 'target.package-json.required',
        severity: 'error',
      }),
    );
  }

  if (
    (request.mode === 'validate' || request.mode === 'fix') &&
    repoMarkers.length === 0 &&
    !hasPackageJson
  ) {
    diagnostics.push(
      createDiagnostic({
        code: 'unsupported-target',
        message: 'Target is neither a repo/workspace-root candidate nor a package root.',
        path: targetPath,
        profile,
        ruleId: 'target.profile.supported',
        severity: 'error',
      }),
    );
  }

  if (shouldRunRepoChecks && repoMarkers.length > 0) {
    appliedChecks.push('repo');
    diagnostics.push(
      ...(await analyzeRepoPolicy({
        packageJson: packageJson?.parsed ?? null,
        plannedChanges,
        profile,
        repoMarkers,
        targetPath,
      })),
    );
  }

  if (shouldRunPackageChecks && hasPackageJson) {
    appliedChecks.push('package');
    diagnostics.push(
      ...(await analyzePackagePolicy({
        packageJson: packageJson?.parsed ?? null,
        packageJsonPath,
        plannedChanges,
        profile,
        targetPath,
      })),
    );
  }

  const fixPlan =
    request.mode === 'fix'
      ? {
          changes: plannedChanges,
          diagnostics,
          profile,
          targetPath,
        }
      : null;

  return {
    appliedChecks,
    diagnostics,
    fixPlan,
    hasPackageJson,
    plannedChanges,
    profile,
    repoMarkers,
    targetPath,
  };
}

async function analyzeRepoPolicy(request: {
  readonly packageJson: Record<string, unknown> | null;
  readonly plannedChanges: DoctorPlannedChange[];
  readonly profile: DoctorPolicyProfile;
  readonly repoMarkers: readonly string[];
  readonly targetPath: string;
}): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];

  if (request.profile === 'public-package') {
    await maybeRequirePath(
      diagnostics,
      request.plannedChanges,
      request.targetPath,
      'README.md',
      'repo.readme.required',
      'create-file',
    );
    await maybeRequirePath(
      diagnostics,
      request.plannedChanges,
      request.targetPath,
      'CHANGELOG.md',
      'repo.changelog.required',
      'create-file',
    );
    await maybeRequirePath(
      diagnostics,
      request.plannedChanges,
      request.targetPath,
      'LICENSE',
      'repo.license.required',
      'create-file',
    );
    await maybeRequirePath(
      diagnostics,
      request.plannedChanges,
      request.targetPath,
      '.changeset',
      'repo.changeset.required',
      'create-directory',
    );
    await maybeRequirePath(
      diagnostics,
      request.plannedChanges,
      request.targetPath,
      path.join('.github', 'workflows'),
      'repo.workflows.required',
      'create-directory',
    );
  }

  if (request.profile === 'integration-monorepo') {
    if (!request.repoMarkers.includes('package.json')) {
      diagnostics.push(
        createDiagnostic({
          code: 'missing-path',
          message: 'The integration monorepo root must include a package.json file.',
          path: path.join(request.targetPath, 'package.json'),
          profile: request.profile,
          ruleId: 'target.package-json.required',
          severity: 'error',
        }),
      );
    }

    if (request.packageJson !== null) {
      if (request.packageJson.ankh !== undefined) {
        diagnostics.push(
          createDiagnostic({
            code: 'field-invalid',
            message:
              'The integration monorepo root must not publish top-level package.json.ankh metadata.',
            path: path.join(request.targetPath, 'package.json'),
            profile: request.profile,
            ruleId: 'integration.package.ankh.disallowed',
            severity: 'error',
          }),
        );
      }

      if (request.packageJson.private !== true) {
        diagnostics.push(
          createDiagnostic({
            code: 'field-invalid',
            message: 'The integration monorepo root must remain private.',
            path: path.join(request.targetPath, 'package.json'),
            profile: request.profile,
            ruleId: 'integration.package.private.required',
            severity: 'error',
          }),
        );
      }

      if (!Array.isArray(request.packageJson.workspaces)) {
        diagnostics.push(
          createDiagnostic({
            code: 'field-missing',
            message: 'The integration monorepo root must declare workspaces.',
            path: path.join(request.targetPath, 'package.json'),
            profile: request.profile,
            ruleId: 'integration.package.workspaces.required',
            severity: 'error',
          }),
        );
      }
    }
  }

  return diagnostics;
}

async function analyzePackagePolicy(request: {
  readonly packageJson: Record<string, unknown> | null;
  readonly packageJsonPath: string;
  readonly plannedChanges: DoctorPlannedChange[];
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}): Promise<DoctorDiagnostic[]> {
  if (request.packageJson === null) {
    return [];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  const { packageJson } = request;

  if (request.profile === 'public-package') {
    requireNonEmptyStringField({
      diagnostics,
      packageJson,
      packageJsonPath: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'package.json.name.required',
      fieldName: 'name',
    });
    requireNonEmptyStringField({
      diagnostics,
      packageJson,
      packageJsonPath: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'package.json.version.required',
      fieldName: 'version',
    });
    requireNonEmptyStringField({
      diagnostics,
      packageJson,
      packageJsonPath: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'package.json.type.required',
      fieldName: 'type',
    });
  }

  if (request.profile !== 'public-package') {
    return diagnostics.concat(
      await validateAnkhMetadataAndProvider({
        diagnostics,
        packageJson,
        packageJsonPath: request.packageJsonPath,
        plannedChanges: request.plannedChanges,
        profile: request.profile,
        targetPath: request.targetPath,
      }),
    );
  }

  requireNonEmptyStringField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.description.required',
    fieldName: 'description',
  });
  requireRecordField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.repository.required',
    fieldName: 'repository',
  });
  requireNonEmptyStringField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.homepage.required',
    fieldName: 'homepage',
  });
  requireRecordField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.bugs.required',
    fieldName: 'bugs',
  });
  requireNonEmptyStringField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.license.required',
    fieldName: 'license',
  });
  requireStringArrayField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.keywords.required',
    fieldName: 'keywords',
  });
  requireStringArrayField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.files.required',
    fieldName: 'files',
  });
  requireRecordField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.exports.required',
    fieldName: 'exports',
  });
  requireRecordField({
    diagnostics,
    packageJson,
    packageJsonPath: request.packageJsonPath,
    profile: request.profile,
    ruleId: 'package.json.publish-config.required',
    fieldName: 'publishConfig',
  });

  if (packageJson.private === true) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-invalid',
        message: 'Public package profiles must not set private: true.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.json.private.public-package-disallowed',
        severity: 'error',
      }),
    );
  }

  if (packageJson.type !== undefined && packageJson.type !== 'module') {
    diagnostics.push(
      createDiagnostic({
        code: 'field-invalid',
        message: 'package.json "type" must be "module".',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.json.type.module',
        severity: 'error',
      }),
    );
  }

  const { publishConfig } = packageJson;
  if (isRecord(publishConfig) && publishConfig.access !== 'public') {
    diagnostics.push(
      createDiagnostic({
        code: isNonEmptyString(publishConfig.access) ? 'field-invalid' : 'field-missing',
        message: 'package.json publishConfig.access must exist and equal "public".',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.json.publish-config.public',
        severity: 'error',
      }),
    );
  }

  if (!isNonEmptyString(packageJson.packageManager)) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-missing',
        message: 'package.json must define a Bun-aligned packageManager field.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.json.package-manager.required',
        severity: 'error',
      }),
    );
    request.plannedChanges.push(
      createPlannedChange({
        description: `Add packageManager: "bun@${Bun.version}" to package.json.`,
        filePath: request.packageJsonPath,
        kind: 'update-json',
        ruleId: 'package.json.package-manager.required',
      }),
    );
  } else if (!packageJson.packageManager.startsWith('bun@')) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-invalid',
        message: 'package.json packageManager must be Bun-aligned, for example "bun@1.x".',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.json.package-manager.bun',
        severity: 'error',
      }),
    );
  }

  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : null;
  for (const scriptName of REQUIRED_PUBLIC_PACKAGE_SCRIPTS) {
    if (scripts === null || !isNonEmptyString(scripts[scriptName])) {
      diagnostics.push(
        createDiagnostic({
          code: 'missing-script',
          message: `Missing required package script: ${scriptName}`,
          path: request.packageJsonPath,
          profile: request.profile,
          ruleId: mapScriptRule(scriptName),
          severity: 'error',
        }),
      );
    }
  }

  const devDependencies = isRecord(packageJson.devDependencies)
    ? packageJson.devDependencies
    : null;
  if (!hasDependency(devDependencies, 'typescript')) {
    diagnostics.push(
      createDiagnostic({
        code: 'missing-dependency',
        message: 'Public package repos must declare TypeScript in devDependencies.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.typescript.required',
        severity: 'error',
      }),
    );
  }

  if (!hasDependency(devDependencies, '@changesets/cli')) {
    diagnostics.push(
      createDiagnostic({
        code: 'missing-dependency',
        message: 'Public package repos must declare @changesets/cli in devDependencies.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.changesets.required',
        severity: 'error',
      }),
    );
  }

  if (!hasDependency(devDependencies, '@types/bun')) {
    diagnostics.push(
      createDiagnostic({
        code: 'missing-dependency',
        message: 'Public package repos must declare @types/bun in devDependencies.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.types-bun.required',
        severity: 'error',
      }),
    );
  }

  if (!hasDependency(devDependencies, '@types/node')) {
    diagnostics.push(
      createDiagnostic({
        code: 'missing-dependency',
        message: 'Public package repos must declare @types/node in devDependencies.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.types-node.required',
        severity: 'error',
      }),
    );
  }

  if (expectsDevtools(packageJson) && !hasDependency(devDependencies, '@ankhorage/devtools')) {
    diagnostics.push(
      createDiagnostic({
        code: 'missing-dependency',
        message:
          'This package consumes shared Ankhorage lint/format/knip tooling and must declare @ankhorage/devtools.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.devtools.required',
        severity: 'error',
      }),
    );
  }

  if (
    (await expectsParadox(request.targetPath, packageJson)) &&
    !hasDependency(devDependencies, '@ankhorage/paradox')
  ) {
    diagnostics.push(
      createDiagnostic({
        code: 'missing-dependency',
        message: 'This package owns Paradox docs generation and must declare @ankhorage/paradox.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.paradox.required',
        severity: 'error',
      }),
    );
  }

  return diagnostics.concat(
    await validateAnkhMetadataAndProvider({
      diagnostics,
      packageJson,
      packageJsonPath: request.packageJsonPath,
      plannedChanges: request.plannedChanges,
      profile: request.profile,
      targetPath: request.targetPath,
    }),
  );
}

async function validateAnkhMetadataAndProvider(request: {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly packageJson: Record<string, unknown>;
  readonly packageJsonPath: string;
  readonly plannedChanges: DoctorPlannedChange[];
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];
  const providerPackage = await isProviderPackage(request.targetPath);
  const metadata = request.packageJson.ankh;

  if (providerPackage && metadata === undefined) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-missing',
        message: 'Provider packages must define package.json.ankh metadata.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.ankh.required-for-provider',
        severity: 'error',
      }),
    );
    request.plannedChanges.push(
      createPlannedChange({
        description:
          'Add a package.json.ankh block describing the implemented provider category, provider path, and capabilities.',
        filePath: request.packageJsonPath,
        kind: 'update-json',
        ruleId: 'package.ankh.required-for-provider',
      }),
    );
    return diagnostics;
  }

  if (metadata === undefined) {
    return diagnostics;
  }

  const metadataValidation = validateAnkhMetadataShape(metadata, providerPackage);
  if (metadataValidation !== null) {
    diagnostics.push(
      createDiagnostic({
        code: 'invalid-ankh-metadata',
        message: metadataValidation,
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.ankh.present.valid-shape',
        severity: 'error',
      }),
    );
    return diagnostics;
  }

  if (!providerPackage) {
    return diagnostics;
  }

  if (!isRecord(metadata) || !isNonEmptyString(metadata.provider)) {
    diagnostics.push(
      createDiagnostic({
        code: 'invalid-ankh-metadata',
        message: 'Provider package metadata must define a package-relative provider path.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.ankh.provider-path.required',
        severity: 'error',
      }),
    );
    return diagnostics;
  }

  const inspection = await inspectProviderSource({
    metadataProviderPath: metadata.provider,
    packageRoot: request.targetPath,
    profile: request.profile,
  });

  if (inspection.diagnostic !== null) {
    diagnostics.push(inspection.diagnostic);
    return diagnostics;
  }

  if (inspection.result === null) {
    return diagnostics;
  }

  const metadataCapabilities = Array.isArray(metadata.capabilities)
    ? metadata.capabilities.filter(isNonEmptyString)
    : [];
  const providerCapabilities = uniqueSorted(inspection.result.capabilities);
  const commandCapabilities = uniqueSorted(inspection.result.commandCapabilities);

  if (!sameStringSet(metadataCapabilities, commandCapabilities)) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-invalid',
        message:
          'package.json.ankh capabilities must match the implemented provider command capabilities exactly.',
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.ankh.capabilities.match-provider',
        severity: 'error',
      }),
    );
  }

  if (!sameStringSet(providerCapabilities, commandCapabilities)) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-invalid',
        message: 'Provider export capabilities must match the provider command capability surface.',
        path: inspection.result.sourcePath,
        profile: request.profile,
        ruleId: 'provider.commands.match-capabilities',
        severity: 'error',
      }),
    );
  }

  if (!sameStringSet(inspection.result.commandPaths, inspection.result.handlerPaths)) {
    diagnostics.push(
      createDiagnostic({
        code: 'field-invalid',
        message: 'Every provider command descriptor must have a matching handler path.',
        path: inspection.result.sourcePath,
        profile: request.profile,
        ruleId: 'provider.commands.match-handlers',
        severity: 'error',
      }),
    );
  }

  return diagnostics;
}

async function inspectProviderSource(request: {
  readonly metadataProviderPath: string;
  readonly packageRoot: string;
  readonly profile: DoctorPolicyProfile;
}): Promise<{
  readonly diagnostic: DoctorDiagnostic | null;
  readonly result: ProviderInspectionResult | null;
}> {
  const sourcePath = await resolveProviderSourcePath(
    request.packageRoot,
    request.metadataProviderPath,
  );
  if (sourcePath === null) {
    return {
      diagnostic: createDiagnostic({
        code: 'provider-source-missing',
        message:
          'Provider package metadata is present, but no provider source file could be resolved for inspection.',
        path: request.packageRoot,
        profile: request.profile,
        ruleId: 'provider.source.required',
        severity: 'error',
      }),
      result: null,
    };
  }

  try {
    const importedModule: unknown = await import(pathToFileURL(sourcePath).href);
    const provider = isRecord(importedModule) ? importedModule.default : undefined;
    if (!isRecord(provider)) {
      return {
        diagnostic: createDiagnostic({
          code: 'provider-source-import-failed',
          message: 'Provider source default export must be an object.',
          path: sourcePath,
          profile: request.profile,
          ruleId: 'provider.source.importable',
          severity: 'error',
        }),
        result: null,
      };
    }

    const capabilities = readStringArray(provider.capabilities);
    const commands = Array.isArray(provider.commands) ? provider.commands : [];
    const handlers = Array.isArray(provider.handlers) ? provider.handlers : [];

    const commandCapabilities = commands.flatMap((command) =>
      isRecord(command) && isNonEmptyString(command.capability) ? [command.capability] : [],
    );
    const commandPaths = commands.flatMap((command) => {
      const pathValue = isRecord(command) ? command.path : undefined;
      return isStringTuple(pathValue) ? [pathValue.join(' ')] : [];
    });
    const handlerPaths = handlers.flatMap((handler) => {
      const pathValue = isRecord(handler) ? handler.path : undefined;
      const handlerFunction = isRecord(handler) ? handler.handler : undefined;
      return isStringTuple(pathValue) && typeof handlerFunction === 'function'
        ? [pathValue.join(' ')]
        : [];
    });

    return {
      diagnostic: null,
      result: {
        capabilities,
        commandCapabilities,
        commandPaths,
        handlerPaths,
        sourcePath,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      diagnostic: createDiagnostic({
        code: 'provider-source-import-failed',
        message: `Failed to import provider source: ${message}`,
        path: sourcePath,
        profile: request.profile,
        ruleId: 'provider.source.importable',
        severity: 'error',
      }),
      result: null,
    };
  }
}

async function resolveProviderSourcePath(
  packageRoot: string,
  metadataProviderPath: string,
): Promise<string | null> {
  const candidates = new Set<string>();
  candidates.add(path.resolve(packageRoot, metadataProviderPath));

  if (metadataProviderPath.startsWith('./dist/') && metadataProviderPath.endsWith('.js')) {
    const relativeStem = metadataProviderPath.slice('./dist/'.length, -'.js'.length);
    candidates.add(path.resolve(packageRoot, 'src', `${relativeStem}.ts`));
    candidates.add(path.resolve(packageRoot, 'src', `${relativeStem}.tsx`));
    candidates.add(path.resolve(packageRoot, 'src', `${relativeStem}.js`));
    candidates.add(path.resolve(packageRoot, 'src', `${relativeStem}.mjs`));
  }

  for (const providerSourceCandidate of PROVIDER_SOURCE_CANDIDATES) {
    candidates.add(path.resolve(packageRoot, providerSourceCandidate));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function findRepoMarkers(targetPath: string): Promise<readonly string[]> {
  return (
    await Promise.all(
      REPO_MARKERS.map(async (marker) =>
        (await pathExists(path.join(targetPath, marker.relativePath))) ? marker.label : null,
      ),
    )
  ).filter((marker): marker is (typeof REPO_MARKERS)[number]['label'] => marker !== null);
}

async function readPackageJson(packageJsonPath: string): Promise<{
  readonly diagnostic: DoctorDiagnostic | null;
  readonly parsed: Record<string, unknown> | null;
}> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown;
  } catch (error) {
    return {
      diagnostic: createDiagnostic({
        code: 'invalid-package-json',
        message: createInvalidPackageJsonMessage(error),
        path: packageJsonPath,
        profile: 'unknown',
        ruleId: 'target.package-json.required',
        severity: 'error',
      }),
      parsed: null,
    };
  }

  if (!isRecord(parsed)) {
    return {
      diagnostic: createDiagnostic({
        code: 'invalid-package-json',
        message: 'package.json must contain a JSON object.',
        path: packageJsonPath,
        profile: 'unknown',
        ruleId: 'target.package-json.required',
        severity: 'error',
      }),
      parsed: null,
    };
  }

  return {
    diagnostic: null,
    parsed,
  };
}

function detectProfile(
  repoMarkers: readonly string[],
  packageJson: Record<string, unknown> | null,
): DoctorPolicyProfile {
  if (packageJson !== null) {
    if (packageJson.name === 'ankhorage4') {
      return 'integration-monorepo';
    }

    if (isNonEmptyString(packageJson.name) && packageJson.name.startsWith('@ankhorage/')) {
      return packageJson.private === true ? 'unknown' : 'public-package';
    }
  }

  if (repoMarkers.length > 0) {
    return 'unknown';
  }

  return 'unknown';
}

async function isProviderPackage(targetPath: string): Promise<boolean> {
  for (const candidate of PROVIDER_SOURCE_CANDIDATES) {
    if (await pathExists(path.join(targetPath, candidate))) {
      return true;
    }
  }

  return false;
}

async function maybeRequirePath(
  diagnostics: DoctorDiagnostic[],
  plannedChanges: DoctorPlannedChange[],
  rootPath: string,
  relativePath: string,
  ruleId:
    | 'repo.changelog.required'
    | 'repo.changeset.required'
    | 'repo.license.required'
    | 'repo.readme.required'
    | 'repo.workflows.required',
  kind: DoctorPlannedChangeKind,
): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  if (await pathExists(absolutePath)) {
    return;
  }

  diagnostics.push(
    createDiagnostic({
      code: 'missing-path',
      message: `Missing expected repo artifact: ${relativePath}`,
      path: absolutePath,
      profile: 'public-package',
      ruleId,
      severity: 'error',
    }),
  );
  plannedChanges.push(
    createPlannedChange({
      description: `Create missing ${relativePath}.`,
      filePath: absolutePath,
      kind,
      ruleId,
    }),
  );
}

function requireNonEmptyStringField(request: {
  readonly diagnostics: DoctorDiagnostic[];
  readonly fieldName: string;
  readonly packageJson: Record<string, unknown>;
  readonly packageJsonPath: string;
  readonly profile: DoctorPolicyProfile;
  readonly ruleId: DoctorRuleId;
}): void {
  if (isNonEmptyString(request.packageJson[request.fieldName])) {
    return;
  }

  request.diagnostics.push(
    createDiagnostic({
      code: 'field-missing',
      message: `package.json must define a non-empty "${request.fieldName}" field.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: request.ruleId,
      severity: 'error',
    }),
  );
}

function requireRecordField(request: {
  readonly diagnostics: DoctorDiagnostic[];
  readonly fieldName: string;
  readonly packageJson: Record<string, unknown>;
  readonly packageJsonPath: string;
  readonly profile: DoctorPolicyProfile;
  readonly ruleId: DoctorRuleId;
}): void {
  if (isRecord(request.packageJson[request.fieldName])) {
    return;
  }

  request.diagnostics.push(
    createDiagnostic({
      code: 'field-missing',
      message: `package.json must define an object "${request.fieldName}" field.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: request.ruleId,
      severity: 'error',
    }),
  );
}

function requireStringArrayField(request: {
  readonly diagnostics: DoctorDiagnostic[];
  readonly fieldName: string;
  readonly packageJson: Record<string, unknown>;
  readonly packageJsonPath: string;
  readonly profile: DoctorPolicyProfile;
  readonly ruleId: DoctorRuleId;
}): void {
  if (readStringArray(request.packageJson[request.fieldName]).length > 0) {
    return;
  }

  request.diagnostics.push(
    createDiagnostic({
      code: 'field-missing',
      message: `package.json must define a non-empty string array "${request.fieldName}" field.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: request.ruleId,
      severity: 'error',
    }),
  );
}

async function expectsParadox(
  targetPath: string,
  packageJson: Record<string, unknown>,
): Promise<boolean> {
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : null;
  const docsScript = scripts?.docs;
  if (
    isNonEmptyString(docsScript) &&
    (docsScript.includes('paradox') || docsScript.includes('@ankhorage/paradox'))
  ) {
    return true;
  }

  return (
    (await pathExists(path.join(targetPath, 'paradox.config.ts'))) ||
    (await pathExists(path.join(targetPath, 'src', 'readme-usage.ts')))
  );
}

function expectsDevtools(packageJson: Record<string, unknown>): boolean {
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : null;
  if (scripts === null) {
    return false;
  }

  return Object.values(scripts).some(
    (scriptValue) =>
      isNonEmptyString(scriptValue) &&
      (scriptValue.includes('ankhorage-eslint') ||
        scriptValue.includes('ankhorage-prettier') ||
        scriptValue.includes('ankhorage-knip')),
  );
}

function hasDependency(
  dependencyMap: Record<string, unknown> | null,
  dependencyName: string,
): boolean {
  return dependencyMap !== null && isNonEmptyString(dependencyMap[dependencyName]);
}

function validateAnkhMetadataShape(value: unknown, providerPackage: boolean): string | null {
  if (!isRecord(value)) {
    return 'package.json "ankh" metadata must be an object when present.';
  }

  if (!isNonEmptyString(value.category)) {
    return 'package.json "ankh.category" must be a non-empty string.';
  }

  if (
    providerPackage &&
    !(isNonEmptyString(value.provider) && isPackageRelativeProviderPath(value.provider))
  ) {
    return 'Provider package metadata must define a package-relative "./..." provider path.';
  }

  if (
    !providerPackage &&
    value.provider !== undefined &&
    !(value.provider === null || isPackageRelativeProviderPath(value.provider))
  ) {
    return 'Non-provider package metadata, when present, must use null or a package-relative "./..." provider value.';
  }

  if (
    !Array.isArray(value.capabilities) ||
    value.capabilities.some((capability) => !isNonEmptyString(capability))
  ) {
    return 'package.json "ankh.capabilities" must be an array of non-empty strings.';
  }

  return null;
}

function mapScriptRule(scriptName: (typeof REQUIRED_PUBLIC_PACKAGE_SCRIPTS)[number]): DoctorRuleId {
  switch (scriptName) {
    case 'build':
      return 'package.scripts.build.required';
    case 'typecheck':
      return 'package.scripts.typecheck.required';
    case 'lint':
      return 'package.scripts.lint.required';
    case 'lint:fix':
      return 'package.scripts.lint-fix.required';
    case 'format':
      return 'package.scripts.format.required';
    case 'format:check':
      return 'package.scripts.format-check.required';
    case 'test':
      return 'package.scripts.test.required';
    case 'knip':
      return 'package.scripts.knip.required';
    case 'docs':
      return 'package.scripts.docs.required';
    case 'changeset':
      return 'package.scripts.changeset.required';
    case 'changeset:status':
      return 'package.scripts.changeset-status.required';
    case 'version-packages':
      return 'package.scripts.version-packages.required';
  }
}

function createEarlyResult(targetPath: string, diagnostic: DoctorDiagnostic): DoctorAnalysisResult {
  return {
    appliedChecks: [],
    diagnostics: [diagnostic],
    fixPlan: null,
    hasPackageJson: false,
    plannedChanges: [],
    profile: 'unknown',
    repoMarkers: [],
    targetPath,
  };
}

function createDiagnostic(diagnostic: DoctorDiagnostic): DoctorDiagnostic {
  return diagnostic;
}

function createPlannedChange(change: Omit<DoctorPlannedChange, 'safe'>): DoctorPlannedChange {
  return {
    ...change,
    safe: true,
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

function isStringTuple(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = uniqueSorted(left);
  const rightSet = uniqueSorted(right);
  return (
    leftSet.length === rightSet.length && leftSet.every((value, index) => value === rightSet[index])
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
