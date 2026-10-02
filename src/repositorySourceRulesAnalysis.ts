import path from 'node:path';

import {
  evaluateRepository,
  REPOSITORY_RULE_IDS,
  type RepositoryImportFact,
  type RepositoryPathFact,
} from '@ankhorage/rules-repository';

import type {
  DoctorDiagnostic,
  DoctorDiagnosticSeverity,
  DoctorPolicyProfile,
  DoctorRuleId,
} from './diagnostics.js';

const ENABLED_REPOSITORY_SOURCE_RULES = [
  REPOSITORY_RULE_IDS.catchAllDirectory,
  REPOSITORY_RULE_IDS.importOutsideRoot,
] as const satisfies readonly DoctorRuleId[];

interface RepositorySourceRulesInput {
  readonly files: readonly string[];
  readonly imports: readonly {
    readonly filePath: string;
    readonly specifier: string;
  }[];
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}

/***
 * Evaluates repository-owned source rules from Doctor's normalized active-source snapshot.
 */
export function analyzeRepositorySourceRules(
  input: RepositorySourceRulesInput,
): readonly DoctorDiagnostic[] {
  const result = evaluateRepository(
    {
      cliCommands: [],
      imports: input.imports.map((sourceImport) => toImportFact(input.targetPath, sourceImport)),
      packageJson: {
        dependencies: [],
        exports: [],
        fields: {},
        scripts: {},
      },
      paths: collectDirectoryFacts(input.targetPath, input.files),
      workflowBunVersions: {},
    },
    {
      config: {
        version: 1,
        rules: ENABLED_REPOSITORY_SOURCE_RULES.map((id) => ({ enabled: true, id })),
      },
    },
  );

  return result.findings.map((finding) => toDoctorDiagnostic(input, finding));
}

/***
 * Converts one active source import into portable repository-boundary evidence.
 */
function toImportFact(
  targetPath: string,
  sourceImport: RepositorySourceRulesInput['imports'][number],
): RepositoryImportFact {
  return {
    path: toPortableRelativePath(targetPath, sourceImport.filePath),
    specifier: sourceImport.specifier,
    ...(sourceImport.specifier.startsWith('.')
      ? { escapesRepositoryRoot: importEscapesRepository(targetPath, sourceImport) }
      : {}),
  };
}

/***
 * Determines whether one relative source import resolves outside the standalone repository root.
 */
function importEscapesRepository(
  targetPath: string,
  sourceImport: RepositorySourceRulesInput['imports'][number],
): boolean {
  const resolvedTarget = path.resolve(path.dirname(sourceImport.filePath), sourceImport.specifier);
  const relativeTarget = path.relative(targetPath, resolvedTarget);
  return relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget);
}

/***
 * Derives unique directory facts from active production source files.
 */
function collectDirectoryFacts(
  targetPath: string,
  files: readonly string[],
): readonly RepositoryPathFact[] {
  const directories = new Set<string>();

  for (const filePath of files) {
    const segments = toPortableRelativePath(targetPath, filePath).split('/').filter(Boolean);
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join('/'));
    }
  }

  return [...directories]
    .sort((left, right) => left.localeCompare(right))
    .map((directoryPath) => ({ kind: 'directory' as const, path: directoryPath }));
}

/***
 * Converts one repository path into stable forward-slash relative form.
 */
function toPortableRelativePath(targetPath: string, filePath: string): string {
  return path.relative(targetPath, filePath).split(path.sep).join('/');
}

/***
 * Converts one repository Rule finding into Doctor's stable diagnostic surface.
 */
function toDoctorDiagnostic(
  input: RepositorySourceRulesInput,
  finding: ReturnType<typeof evaluateRepository>['findings'][number],
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
 * Narrows repository-provider ids to the source rules Doctor intentionally evaluates here.
 */
function toDoctorRuleId(ruleId: string): DoctorRuleId {
  const match = ENABLED_REPOSITORY_SOURCE_RULES.find((candidate) => candidate === ruleId);
  if (match === undefined) throw new Error('Unexpected Doctor repository source rule: ' + ruleId);
  return match;
}

/***
 * Narrows generic Rules severity to Doctor's diagnostic severity surface.
 */
function toDoctorSeverity(severity: 'error' | 'info' | 'warning'): DoctorDiagnosticSeverity {
  if (severity === 'info') {
    throw new Error('Doctor does not support info-level repository diagnostics.');
  }
  return severity;
}
