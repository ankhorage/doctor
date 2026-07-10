export type DoctorDiagnosticCode =
  | 'field-invalid'
  | 'field-missing'
  | 'invalid-ankh-metadata'
  | 'invalid-package-json'
  | 'missing-dependency'
  | 'missing-path'
  | 'missing-script'
  | 'provider-source-import-failed'
  | 'provider-source-missing'
  | 'target-not-directory'
  | 'target-not-found'
  | 'unsupported-target';

export type DoctorDiagnosticSeverity = 'error' | 'warning';
export type DoctorPolicyProfile = 'integration-monorepo' | 'public-package' | 'unknown';
export type DoctorRuleId =
  | 'integration.package.ankh.disallowed'
  | 'integration.package.private.required'
  | 'integration.package.workspaces.required'
  | 'package.ankh.capabilities.match-provider'
  | 'package.ankh.present.valid-shape'
  | 'package.ankh.provider-path.required'
  | 'package.ankh.required-for-provider'
  | 'package.cli.export.required'
  | 'package.cli.index.required'
  | 'package.cli.root-file.disallowed'
  | 'package.dependencies.ankh-workspace-alias.disallowed'
  | 'package.dependencies.ankhorage4-source.disallowed'
  | 'package.dependencies.changesets.required'
  | 'package.dependencies.devtools.required'
  | 'package.dependencies.paradox.required'
  | 'package.dependencies.types-bun.required'
  | 'package.dependencies.types-node.required'
  | 'package.dependencies.typescript.required'
  | 'package.imports.ankh-workspace-alias.disallowed'
  | 'package.imports.ankhorage4-source.disallowed'
  | 'package.json.bugs.required'
  | 'package.json.description.required'
  | 'package.json.exports.required'
  | 'package.json.files.required'
  | 'package.json.homepage.required'
  | 'package.json.keywords.required'
  | 'package.json.license.required'
  | 'package.json.name.required'
  | 'package.json.package-manager.bun'
  | 'package.json.package-manager.required'
  | 'package.json.private.public-package-disallowed'
  | 'package.json.publish-config.public'
  | 'package.json.publish-config.required'
  | 'package.json.repository.required'
  | 'package.json.type.module'
  | 'package.json.type.required'
  | 'package.json.version.required'
  | 'package.scripts.build.required'
  | 'package.scripts.changeset-status.required'
  | 'package.scripts.changeset.required'
  | 'package.scripts.docs.required'
  | 'package.scripts.format-check.required'
  | 'package.scripts.format.required'
  | 'package.scripts.knip.required'
  | 'package.scripts.lint-fix.required'
  | 'package.scripts.lint.required'
  | 'package.scripts.test.required'
  | 'package.scripts.typecheck.required'
  | 'package.scripts.version-packages.required'
  | 'provider.commands.match-capabilities'
  | 'provider.commands.match-handlers'
  | 'provider.source.importable'
  | 'provider.source.required'
  | 'repo.changelog.required'
  | 'repo.changeset.required'
  | 'repo.license.required'
  | 'repo.readme.required'
  | 'repo.workflows.required'
  | 'studio.dependencies.dnd.required'
  | 'studio.dependencies.runtime.required'
  | 'studio.imports.dnd.required'
  | 'studio.imports.runtime.required'
  | 'target.package-json.required'
  | 'target.path.directory'
  | 'target.path.exists'
  | 'target.profile.supported'
  | 'target.repo-markers.required';

export interface DoctorDiagnostic {
  readonly code: DoctorDiagnosticCode;
  readonly message: string;
  readonly path: string;
  readonly profile: DoctorPolicyProfile;
  readonly ruleId: DoctorRuleId;
  readonly severity: DoctorDiagnosticSeverity;
}

export function countErrorDiagnostics(diagnostics: readonly DoctorDiagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
}

export function countWarningDiagnostics(diagnostics: readonly DoctorDiagnostic[]): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
}
