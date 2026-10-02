import path from 'node:path';

import { createSourceGraphAsync, type SourceGraph } from '@ankhorage/dependency-graph';
import { evaluateArchitectureProfile } from '@ankhorage/rules-architecture';

import type {
  DoctorDiagnostic,
  DoctorDiagnosticSeverity,
  DoctorPolicyProfile,
  DoctorRuleId,
} from './diagnostics.js';

const ENABLED_ARCHITECTURE_RULES = [
  'package.architecture.domain-outward-import.disallowed',
  'package.architecture.application-outward-import.disallowed',
  'package.architecture.port-outward-import.disallowed',
  'package.architecture.delivery-concrete-adapter-import.disallowed',
] as const satisfies readonly DoctorRuleId[];

const ACTIVE_SOURCE_ROOTS = ['src', 'app', 'apps', 'packages', 'scripts'] as const;
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

interface AnalyzeSourceArchitectureInput {
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}

/***
 * Evaluates Doctor's currently enforced source-architecture subset through rules-architecture.
 */
export async function analyzeSourceArchitecture(
  input: AnalyzeSourceArchitectureInput,
): Promise<DoctorDiagnostic[]> {
  const graph = await createSourceGraphAsync({
    projects: [{ id: 'doctor-target', rootPath: input.targetPath }],
  });
  const result = evaluateArchitectureProfile(filterActiveSourceGraph(graph), 'ankhorage', {
    config: {
      version: 1,
      rules: ENABLED_ARCHITECTURE_RULES.map((id) => ({ enabled: true, id })),
    },
  });

  return result.findings.map((finding) => toDoctorDiagnostic(input, finding));
}

/***
 * Keeps architecture evaluation aligned with Doctor's existing active-source scan contract.
 */
function filterActiveSourceGraph(graph: SourceGraph): SourceGraph {
  const nodeById = new Map(graph.graph.nodes.map((node) => [node.id, node.data]));
  return {
    ...graph,
    graph: {
      nodes: graph.graph.nodes,
      edges: graph.graph.edges.filter((edge) => {
        if (edge.data.kind !== 'imports') return true;
        const source = nodeById.get(edge.source);
        const sourcePath = source?.path ?? source?.filePath;
        return sourcePath === undefined || isActiveSourcePath(sourcePath);
      }),
    },
  };
}

/***
 * Checks whether one portable path belongs to Doctor's active production-source surface.
 */
function isActiveSourcePath(sourcePath: string): boolean {
  const normalized = sourcePath.split(path.sep).join('/');
  const [root, ...segments] = normalized.split('/').filter(Boolean);
  if (root === undefined || !ACTIVE_SOURCE_ROOTS.some((candidate) => candidate === root)) {
    return false;
  }
  if (segments.some((segment) => IGNORED_SOURCE_DIRECTORIES.has(segment))) return false;
  const fileName = segments.at(-1) ?? '';
  return !/(?:^|\.)(?:spec|test)\.[cm]?[jt]sx?$/u.test(fileName);
}

/***
 * Converts one architecture Rule finding into Doctor's stable diagnostic surface.
 */
function toDoctorDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  finding: ReturnType<typeof evaluateArchitectureProfile>['findings'][number],
): DoctorDiagnostic {
  const subjectPath = finding.sourceLocation?.path ?? finding.subjects[0]?.path ?? '.';
  return {
    code: 'field-invalid',
    message: finding.message,
    path: path.resolve(input.targetPath, subjectPath),
    profile: input.profile,
    ruleId: toDoctorRuleId(finding.ruleId),
    severity: toDoctorSeverity(finding.severity),
  };
}

/***
 * Narrows architecture-provider rule ids to the subset Doctor intentionally enforces.
 */
function toDoctorRuleId(ruleId: string): DoctorRuleId {
  const match = ENABLED_ARCHITECTURE_RULES.find((candidate) => candidate === ruleId);
  if (match === undefined) throw new Error('Unexpected Doctor architecture rule: ' + ruleId);
  return match;
}

/***
 * Narrows generic Rules severity to Doctor's diagnostic severity surface.
 */
function toDoctorSeverity(severity: 'error' | 'info' | 'warning'): DoctorDiagnosticSeverity {
  if (severity === 'info') {
    throw new Error('Doctor does not support info-level architecture diagnostics.');
  }
  return severity;
}
