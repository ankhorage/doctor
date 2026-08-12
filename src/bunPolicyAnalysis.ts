import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { DoctorAnalysisResult } from './analysis.js';
import type { DoctorDiagnostic, DoctorRuleId } from './diagnostics.js';

interface BunRuntimePolicySnapshot {
  readonly packageManager: string;
  readonly typesRange: string;
  readonly version: string;
}

const DEVTOOLS_POLICY_SPECIFIER = '@ankhorage/devtools/policy';
const REPAIR_HINT = 'Run "ankh devtools sync" to repair the managed Bun state.';
const BUN_VERSION_PATTERN = /^\s*bun-version:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/mu;
const WORKFLOWS = [
  {
    relativePath: path.join('.github', 'workflows', 'ci.yml'),
    ruleId: 'repo.workflows.ci.bun-policy',
  },
  {
    relativePath: path.join('.github', 'workflows', 'release.yml'),
    ruleId: 'repo.workflows.release.bun-policy',
  },
] as const satisfies readonly { readonly relativePath: string; readonly ruleId: DoctorRuleId }[];

export async function applyBunRuntimePolicy(
  result: DoctorAnalysisResult,
): Promise<DoctorAnalysisResult> {
  if (result.profile !== 'public-package' || !result.hasPackageJson) {
    return result;
  }

  const policy = await loadTargetBunRuntimePolicy(result.targetPath);
  const packageJsonPath = path.join(result.targetPath, 'package.json');
  const packageJson = await readPackageJson(packageJsonPath);
  if (policy === null || packageJson === null) {
    return result;
  }

  const diagnostics = [
    ...result.diagnostics,
    ...analyzePackageBunPolicy(packageJson, packageJsonPath, result, policy),
    ...(await analyzeWorkflowBunPolicy(result, policy)),
  ];

  return withDiagnostics(result, diagnostics);
}

async function loadTargetBunRuntimePolicy(
  targetPath: string,
): Promise<BunRuntimePolicySnapshot | null> {
  const requireFromTarget = createRequire(path.join(targetPath, 'package.json'));
  try {
    const modulePath = requireFromTarget.resolve(DEVTOOLS_POLICY_SPECIFIER);
    const importedModule = (await import(pathToFileURL(modulePath).href)) as unknown;
    return parseBunRuntimePolicy(importedModule);
  } catch (error) {
    if (isUnavailablePolicyError(error)) {
      return null;
    }
    throw error;
  }
}

function analyzePackageBunPolicy(
  packageJson: Record<string, unknown>,
  packageJsonPath: string,
  result: DoctorAnalysisResult,
  policy: BunRuntimePolicySnapshot,
): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];
  const { packageManager } = packageJson;
  if (isNonEmptyString(packageManager) && packageManager.startsWith('bun@')) {
    pushMismatch(diagnostics, {
      actual: packageManager,
      expected: policy.packageManager,
      location: 'package.json#packageManager',
      path: packageJsonPath,
      profile: result.profile,
      ruleId: 'package.json.package-manager.policy',
    });
  }

  const devDependencies = isRecord(packageJson.devDependencies)
    ? packageJson.devDependencies
    : null;
  const bunTypes = devDependencies?.['@types/bun'];
  if (isNonEmptyString(bunTypes)) {
    pushMismatch(diagnostics, {
      actual: bunTypes,
      expected: policy.typesRange,
      location: 'package.json#devDependencies.@types/bun',
      path: packageJsonPath,
      profile: result.profile,
      ruleId: 'package.dependencies.types-bun.policy',
    });
  }

  return diagnostics;
}

async function analyzeWorkflowBunPolicy(
  result: DoctorAnalysisResult,
  policy: BunRuntimePolicySnapshot,
): Promise<DoctorDiagnostic[]> {
  const diagnostics = await Promise.all(
    WORKFLOWS.map(async (workflow) => await analyzeWorkflow(result, workflow, policy)),
  );
  return diagnostics.flat();
}

async function analyzeWorkflow(
  result: DoctorAnalysisResult,
  workflow: (typeof WORKFLOWS)[number],
  policy: BunRuntimePolicySnapshot,
): Promise<DoctorDiagnostic[]> {
  const workflowPath = path.join(result.targetPath, workflow.relativePath);
  const contents = await readTextOrNull(workflowPath);
  if (contents === null) {
    return [
      createWorkflowDiagnostic(result, workflow, policy, workflowPath, 'missing-path'),
    ];
  }

  const match = BUN_VERSION_PATTERN.exec(contents);
  const actual = match?.[1];
  if (!isNonEmptyString(actual)) {
    return [
      createWorkflowDiagnostic(result, workflow, policy, workflowPath, 'field-missing'),
    ];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  pushMismatch(diagnostics, {
    actual,
    expected: policy.version,
    location: `${workflow.relativePath}#bun-version`,
    path: workflowPath,
    profile: result.profile,
    ruleId: workflow.ruleId,
  });
  return diagnostics;
}

function createWorkflowDiagnostic(
  result: DoctorAnalysisResult,
  workflow: (typeof WORKFLOWS)[number],
  policy: BunRuntimePolicySnapshot,
  workflowPath: string,
  code: DoctorDiagnostic['code'],
): DoctorDiagnostic {
  const detail =
    code === 'missing-path'
      ? `Managed workflow is missing: ${workflow.relativePath}.`
      : `${workflow.relativePath} does not define bun-version.`;
  return {
    code,
    message: `${detail} Expected Bun ${policy.version}. ${REPAIR_HINT}`,
    path: workflowPath,
    profile: result.profile,
    ruleId: workflow.ruleId,
    severity: 'error',
  };
}

function pushMismatch(
  diagnostics: DoctorDiagnostic[],
  input: {
    readonly actual: string;
    readonly expected: string;
    readonly location: string;
    readonly path: string;
    readonly profile: DoctorAnalysisResult['profile'];
    readonly ruleId: DoctorRuleId;
  },
): void {
  if (input.actual === input.expected) {
    return;
  }
  diagnostics.push({
    code: 'field-invalid',
    message: `Bun policy drift at ${input.location}: expected "${input.expected}", found "${input.actual}". ${REPAIR_HINT}`,
    path: input.path,
    profile: input.profile,
    ruleId: input.ruleId,
    severity: 'error',
  });
}

function parseBunRuntimePolicy(importedModule: unknown): BunRuntimePolicySnapshot | null {
  if (!isRecord(importedModule) || !isRecord(importedModule.bunRuntimePolicy)) {
    return null;
  }
  const { packageManager, typesRange, version } = importedModule.bunRuntimePolicy;
  return isNonEmptyString(packageManager) && isNonEmptyString(typesRange) && isNonEmptyString(version)
    ? { packageManager, typesRange, version }
    : null;
}

function withDiagnostics(
  result: DoctorAnalysisResult,
  diagnostics: readonly DoctorDiagnostic[],
): DoctorAnalysisResult {
  return {
    ...result,
    diagnostics,
    fixPlan: result.fixPlan === null ? null : { ...result.fixPlan, diagnostics },
  };
}

async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function isUnavailablePolicyError(error: unknown): boolean {
  if (
    isNodeError(error) &&
    (error.code === 'MODULE_NOT_FOUND' ||
      error.code === 'ERR_MODULE_NOT_FOUND' ||
      error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes(DEVTOOLS_POLICY_SPECIFIER) &&
    (message.includes('Cannot find module') ||
      message.includes('not exported') ||
      message.includes('Package subpath'))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
