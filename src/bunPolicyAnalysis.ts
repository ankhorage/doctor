import { promises as fs } from 'node:fs';
import path from 'node:path';

import { bunRuntimePolicy } from '@ankhorage/devtools/policy';

import type { DoctorAnalysisResult } from './analysis.js';
import type { DoctorDiagnostic, DoctorRuleId } from './diagnostics.js';

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

  const packageJsonPath = path.join(result.targetPath, 'package.json');
  const packageJson = await readPackageJson(packageJsonPath);
  if (packageJson === null) {
    return result;
  }

  const diagnostics = [
    ...result.diagnostics,
    ...analyzePackageBunPolicy(packageJson, packageJsonPath, result),
    ...(await analyzeWorkflowBunPolicy(result)),
  ];

  return {
    ...result,
    diagnostics,
    fixPlan: result.fixPlan === null ? null : { ...result.fixPlan, diagnostics },
  };
}

function analyzePackageBunPolicy(
  packageJson: Record<string, unknown>,
  packageJsonPath: string,
  result: DoctorAnalysisResult,
): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];
  const packageManager = packageJson.packageManager;
  if (isNonEmptyString(packageManager) && packageManager.startsWith('bun@')) {
    pushMismatch(diagnostics, {
      actual: packageManager,
      expected: bunRuntimePolicy.packageManager,
      location: 'package.json#packageManager',
      path: packageJsonPath,
      profile: result.profile,
      ruleId: 'package.json.package-manager.policy',
    });
  }

  const devDependencies = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : null;
  const bunTypes = devDependencies?.['@types/bun'];
  if (isNonEmptyString(bunTypes)) {
    pushMismatch(diagnostics, {
      actual: bunTypes,
      expected: bunRuntimePolicy.typesRange,
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
): Promise<DoctorDiagnostic[]> {
  return (
    await Promise.all(
      WORKFLOWS.map(async (workflow) => await analyzeWorkflow(result, workflow)),
    )
  ).flat();
}

async function analyzeWorkflow(
  result: DoctorAnalysisResult,
  workflow: (typeof WORKFLOWS)[number],
): Promise<DoctorDiagnostic[]> {
  const workflowPath = path.join(result.targetPath, workflow.relativePath);
  const contents = await readTextOrNull(workflowPath);
  if (contents === null) {
    return [
      createWorkflowDiagnostic(
        result,
        workflow.ruleId,
        workflowPath,
        `Managed workflow is missing: ${workflow.relativePath}.`,
        'missing-path',
      ),
    ];
  }

  const match = contents.match(BUN_VERSION_PATTERN);
  const actual = match?.[1];
  if (!isNonEmptyString(actual)) {
    return [
      createWorkflowDiagnostic(
        result,
        workflow.ruleId,
        workflowPath,
        `${workflow.relativePath} does not define bun-version.`,
        'field-missing',
      ),
    ];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  pushMismatch(diagnostics, {
    actual,
    expected: bunRuntimePolicy.version,
    location: `${workflow.relativePath}#bun-version`,
    path: workflowPath,
    profile: result.profile,
    ruleId: workflow.ruleId,
  });
  return diagnostics;
}

function createWorkflowDiagnostic(
  result: DoctorAnalysisResult,
  ruleId: DoctorRuleId,
  workflowPath: string,
  detail: string,
  code: DoctorDiagnostic['code'],
): DoctorDiagnostic {
  return {
    code,
    message: `${detail} Expected Bun ${bunRuntimePolicy.version}. ${REPAIR_HINT}`,
    path: workflowPath,
    profile: result.profile,
    ruleId,
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
