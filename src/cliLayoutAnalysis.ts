import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  analyzeDoctorTarget,
  type DoctorAnalysisRequest,
  type DoctorAnalysisResult,
} from './analysis.js';
import type { DoctorDiagnostic, DoctorPolicyProfile } from './diagnostics.js';

const LEGACY_ROOT_CLI_SOURCE = path.join('src', 'cli.ts');
const CANONICAL_CLI_INDEX_SOURCE = path.join('src', 'cli', 'index.ts');
const ACTIVE_SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'scripts'] as const;
const ACTIVE_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const IGNORED_SOURCE_DIRECTORIES = new Set([
  '.expo',
  '.git',
  '.next',
  '__fixtures__',
  '__tests__',
  'build',
  'coverage',
  'dist',
  'docs',
  'fixtures',
  'node_modules',
  'paradox',
  'test',
  'tests',
]);
const COMPATIBILITY_PACKAGE_PREFIX = '@ankh/';
const STUDIO_PACKAGE_NAME = '@ankhorage/studio';
const STUDIO_DND_PACKAGE_NAME = '@ankhorage/react-native-reanimated-dnd-web';
const STUDIO_RUNTIME_PACKAGE_NAME = '@ankhorage/runtime';
const DEPENDENCY_FIELD_NAMES = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

interface ActiveSourceImport {
  readonly filePath: string;
  readonly specifier: string;
}

interface DependencyEntry {
  readonly fieldName: (typeof DEPENDENCY_FIELD_NAMES)[number];
  readonly packageName: string;
  readonly version: string;
}

export async function analyzeDoctorTargetWithCliLayout(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  const result = await analyzeDoctorTarget(request);
  if (!result.hasPackageJson) {
    return result;
  }

  const packageJsonPath = path.join(result.targetPath, 'package.json');
  const packageJson = await readPackageJson(packageJsonPath);
  if (packageJson === null) {
    return result;
  }

  const architectureDiagnostics = await analyzeTargetArchitecture({
    packageJson,
    packageJsonPath,
    profile: result.profile,
    targetPath: result.targetPath,
  });
  if (architectureDiagnostics.length === 0) {
    return result;
  }

  const diagnostics = [...result.diagnostics, ...architectureDiagnostics];

  return {
    ...result,
    diagnostics,
    fixPlan: result.fixPlan === null ? null : { ...result.fixPlan, diagnostics },
  };
}

async function analyzeTargetArchitecture(request: {
  readonly packageJson: Record<string, unknown>;
  readonly packageJsonPath: string;
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];
  const legacyRootCliPath = path.join(request.targetPath, LEGACY_ROOT_CLI_SOURCE);
  const canonicalCliIndexPath = path.join(request.targetPath, CANONICAL_CLI_INDEX_SOURCE);
  const exportsField = isRecord(request.packageJson.exports) ? request.packageJson.exports : null;
  const cliCapable =
    hasAnkhProvider(request.packageJson) ||
    exportsField?.['./cli'] !== undefined ||
    (await pathExists(canonicalCliIndexPath));

  if (await pathExists(legacyRootCliPath)) {
    diagnostics.push({
      code: 'field-invalid',
      message: 'Package CLI code must live under src/cli/; root src/cli.ts is not allowed.',
      path: legacyRootCliPath,
      profile: request.profile,
      ruleId: 'package.cli.root-file.disallowed',
      severity: 'error',
    });
  }

  if (cliCapable && !(await pathExists(canonicalCliIndexPath))) {
    diagnostics.push({
      code: 'missing-path',
      message: 'CLI-capable packages must expose their provider from src/cli/index.ts.',
      path: canonicalCliIndexPath,
      profile: request.profile,
      ruleId: 'package.cli.index.required',
      severity: 'error',
    });
  }

  if (cliCapable && exportsField?.['./cli'] === undefined) {
    diagnostics.push({
      code: 'field-missing',
      message:
        'CLI-capable packages must export "./cli" from package.json and point it at the owning src/cli/index.ts build output.',
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'package.cli.export.required',
      severity: 'error',
    });
  }

  const dependencyEntries = collectDependencyEntries(request.packageJson);
  diagnostics.push(
    ...validateDependencyArchitecture({
      dependencyEntries,
      packageJsonPath: request.packageJsonPath,
      profile: request.profile,
    }),
  );

  const activeSourceImports = await collectActiveSourceImports(request.targetPath);
  diagnostics.push(
    ...validateActiveSourceImports({
      activeSourceImports,
      profile: request.profile,
    }),
  );

  if (request.packageJson.name === STUDIO_PACKAGE_NAME) {
    diagnostics.push(
      ...validateStudioOwnership({
        activeSourceImports,
        dependencyEntries,
        packageJsonPath: request.packageJsonPath,
        profile: request.profile,
      }),
    );
  }

  return diagnostics;
}

function validateDependencyArchitecture(request: {
  readonly dependencyEntries: readonly DependencyEntry[];
  readonly packageJsonPath: string;
  readonly profile: DoctorPolicyProfile;
}): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];

  for (const dependency of request.dependencyEntries) {
    if (dependency.packageName.startsWith(COMPATIBILITY_PACKAGE_PREFIX)) {
      diagnostics.push({
        code: 'field-invalid',
        message: `Dependency "${dependency.packageName}" in package.json.${dependency.fieldName} is an old ankhorage4 workspace alias. Depend on "${toOwningPackageSpecifier(dependency.packageName)}" directly.`,
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.ankh-workspace-alias.disallowed',
        severity: 'error',
      });
    }

    if (
      dependency.packageName.includes('ankhorage4') ||
      dependency.version.includes('ankhorage4')
    ) {
      diagnostics.push({
        code: 'field-invalid',
        message: `Dependency "${dependency.packageName}" references ankhorage4 as active source. Depend on the extracted owning @ankhorage/* package instead.`,
        path: request.packageJsonPath,
        profile: request.profile,
        ruleId: 'package.dependencies.ankhorage4-source.disallowed',
        severity: 'error',
      });
    }
  }

  return diagnostics;
}

function validateActiveSourceImports(request: {
  readonly activeSourceImports: readonly ActiveSourceImport[];
  readonly profile: DoctorPolicyProfile;
}): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];

  for (const sourceImport of request.activeSourceImports) {
    if (sourceImport.specifier.startsWith(COMPATIBILITY_PACKAGE_PREFIX)) {
      diagnostics.push({
        code: 'field-invalid',
        message: `Import "${sourceImport.specifier}" is an old ankhorage4 compatibility boundary. Import "${toOwningPackageSpecifier(sourceImport.specifier)}" directly from the owning package.`,
        path: sourceImport.filePath,
        profile: request.profile,
        ruleId: 'package.imports.ankh-workspace-alias.disallowed',
        severity: 'error',
      });
    }

    if (sourceImport.specifier.includes('ankhorage4')) {
      diagnostics.push({
        code: 'field-invalid',
        message: `Import "${sourceImport.specifier}" references ankhorage4 as active source. Import the extracted owning @ankhorage/* package instead.`,
        path: sourceImport.filePath,
        profile: request.profile,
        ruleId: 'package.imports.ankhorage4-source.disallowed',
        severity: 'error',
      });
    }
  }

  return diagnostics;
}

function validateStudioOwnership(request: {
  readonly activeSourceImports: readonly ActiveSourceImport[];
  readonly dependencyEntries: readonly DependencyEntry[];
  readonly packageJsonPath: string;
  readonly profile: DoctorPolicyProfile;
}): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];
  const directDependencies = new Set(
    request.dependencyEntries
      .filter((dependency) => dependency.fieldName === 'dependencies')
      .map((dependency) => dependency.packageName),
  );
  const importedSpecifiers = request.activeSourceImports.map((sourceImport) => sourceImport.specifier);

  if (!directDependencies.has(STUDIO_DND_PACKAGE_NAME)) {
    diagnostics.push({
      code: 'missing-dependency',
      message: `@ankhorage/studio must depend directly on "${STUDIO_DND_PACKAGE_NAME}" for Studio drag-and-drop ownership.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'studio.dependencies.dnd.required',
      severity: 'error',
    });
  }

  if (!directDependencies.has(STUDIO_RUNTIME_PACKAGE_NAME)) {
    diagnostics.push({
      code: 'missing-dependency',
      message: `@ankhorage/studio must depend directly on "${STUDIO_RUNTIME_PACKAGE_NAME}" for runtime ownership.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'studio.dependencies.runtime.required',
      severity: 'error',
    });
  }

  if (!importedSpecifiers.some((specifier) => isPackageImport(specifier, STUDIO_DND_PACKAGE_NAME))) {
    diagnostics.push({
      code: 'field-missing',
      message: `@ankhorage/studio must import "${STUDIO_DND_PACKAGE_NAME}" directly from its Studio DnD boundary.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'studio.imports.dnd.required',
      severity: 'error',
    });
  }

  if (
    !importedSpecifiers.some((specifier) => isPackageImport(specifier, STUDIO_RUNTIME_PACKAGE_NAME))
  ) {
    diagnostics.push({
      code: 'field-missing',
      message: `@ankhorage/studio must import "${STUDIO_RUNTIME_PACKAGE_NAME}" directly from the owning runtime package.`,
      path: request.packageJsonPath,
      profile: request.profile,
      ruleId: 'studio.imports.runtime.required',
      severity: 'error',
    });
  }

  return diagnostics;
}

async function collectActiveSourceImports(targetPath: string): Promise<ActiveSourceImport[]> {
  const imports: ActiveSourceImport[] = [];

  for (const sourceRoot of ACTIVE_SOURCE_ROOTS) {
    const sourceRootPath = path.join(targetPath, sourceRoot);
    if (!(await pathExists(sourceRootPath))) {
      continue;
    }

    for (const filePath of await listActiveSourceFiles(sourceRootPath)) {
      const source = await fs.readFile(filePath, 'utf8');
      for (const specifier of extractImportSpecifiers(source)) {
        imports.push({ filePath, specifier });
      }
    }
  }

  return imports;
}

async function listActiveSourceFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];
  await visit(rootPath);
  return files.sort((left, right) => left.localeCompare(right));

  async function visit(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_SOURCE_DIRECTORIES.has(entry.name)) {
          await visit(path.join(currentPath, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(currentPath, entry.name);
      if (isActiveSourceFile(filePath)) {
        files.push(filePath);
      }
    }
  }
}

function isActiveSourceFile(filePath: string): boolean {
  if (!ACTIVE_SOURCE_EXTENSIONS.has(path.extname(filePath))) {
    return false;
  }

  return !/(?:^|\.)(?:spec|test)\.[cm]?[jt]sx?$/.test(path.basename(filePath));
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\sfrom\s*)?['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers].sort((left, right) => left.localeCompare(right));
}

function collectDependencyEntries(packageJson: Record<string, unknown>): DependencyEntry[] {
  const entries: DependencyEntry[] = [];

  for (const fieldName of DEPENDENCY_FIELD_NAMES) {
    const dependencies = isRecord(packageJson[fieldName]) ? packageJson[fieldName] : null;
    if (dependencies === null) {
      continue;
    }

    for (const [packageName, version] of Object.entries(dependencies)) {
      if (isNonEmptyString(version)) {
        entries.push({ fieldName, packageName, version });
      }
    }
  }

  return entries.sort((left, right) => {
    const fieldComparison = left.fieldName.localeCompare(right.fieldName);
    return fieldComparison !== 0
      ? fieldComparison
      : left.packageName.localeCompare(right.packageName);
  });
}

function hasAnkhProvider(packageJson: Record<string, unknown>): boolean {
  const ankh = isRecord(packageJson.ankh) ? packageJson.ankh : null;
  return isNonEmptyString(ankh?.provider);
}

function isPackageImport(specifier: string, packageName: string): boolean {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function toOwningPackageSpecifier(specifier: string): string {
  return `@ankhorage/${specifier.slice(COMPATIBILITY_PACKAGE_PREFIX.length)}`;
}

async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
