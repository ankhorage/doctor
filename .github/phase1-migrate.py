from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    file = Path(path)
    content = file.read_text()
    count = content.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} occurrence(s), found {count}: {old!r}')
    file.write_text(content.replace(old, new))


replace_exact(
    'src/analysis.ts',
    "export type DoctorTargetCheck = 'package' | 'repo';",
    "export type DoctorTargetCheck = 'manifest' | 'package' | 'repo';",
)
replace_exact(
    'src/cliLayoutAnalysis.ts',
    "import type { DoctorDiagnostic, DoctorPolicyProfile } from './diagnostics.js';\n",
    "import type { DoctorDiagnostic, DoctorPolicyProfile } from './diagnostics.js';\nimport { analyzeAppManifestTarget } from './manifestAnalysis.js';\n",
)
replace_exact(
    'src/cliLayoutAnalysis.ts',
    "export async function analyzeDoctorTargetWithCliLayout(\n  request: DoctorAnalysisRequest,\n): Promise<DoctorAnalysisResult> {\n  const result = await analyzeDoctorTarget(request);",
    "export async function analyzeDoctorTargetWithCliLayout(\n  request: DoctorAnalysisRequest,\n): Promise<DoctorAnalysisResult> {\n  const manifestResult = await analyzeAppManifestTarget(request);\n  if (manifestResult !== null) {\n    return manifestResult;\n  }\n\n  const result = await analyzeDoctorTarget(request);",
)
replace_exact(
    'src/commands.ts',
    "import { analyzeDoctorTarget } from './analysis.js';",
    "import { analyzeDoctorTargetWithCliLayout } from './cliLayoutAnalysis.js';",
)
replace_exact(
    'src/commands.ts',
    "  readonly analyzeTarget: typeof analyzeDoctorTarget;",
    "  readonly analyzeTarget: typeof analyzeDoctorTargetWithCliLayout;",
)
replace_exact(
    'src/commands.ts',
    "    analyzeTarget: overrides.analyzeTarget ?? analyzeDoctorTarget,",
    "    analyzeTarget: overrides.analyzeTarget ?? analyzeDoctorTargetWithCliLayout,",
)
replace_exact(
    'src/commands.ts',
    "    summary: 'Auto-detect the applicable doctor policy profile and validate a local path.',",
    "    summary: 'Validate a repo, package, or app-manifest JSON path with the applicable Doctor profile.',",
)
replace_exact(
    'src/commands.ts',
    "    '  Pass [path], or omit it to validate the current working directory.',",
    "    '  Pass a repo/package directory or app-manifest JSON file, or omit [path] to inspect the current directory.',",
    expected=2,
)
replace_exact(
    'src/manifestAnalysis.ts',
    "import type { DoctorAnalysisRequest, DoctorAnalysisResult } from './analysis.js';",
    "import type {\n  DoctorAnalysisRequest,\n  DoctorAnalysisResult,\n  DoctorFixPlan,\n  DoctorPlannedChange,\n} from './analysis.js';",
)
replace_exact(
    'src/manifestAnalysis.ts',
    '  const plannedChanges = [];\n  const fixPlan =',
    '  const plannedChanges: DoctorPlannedChange[] = [];\n  const fixPlan: DoctorFixPlan | null =',
)
replace_exact(
    'tests/manifestAnalysis.test.ts',
    "    expect(diagnostics).toContainEqual(\n      expect.objectContaining({\n        ruleId: 'manifest.settings.auth-flow.removed',\n        severity: 'error',\n      }),\n    );",
    "    expect(\n      diagnostics.some(\n        (diagnostic) =>\n          diagnostic.ruleId === 'manifest.settings.auth-flow.removed' &&\n          diagnostic.severity === 'error',\n      ),\n    ).toBe(true);",
)
replace_exact(
    'tests/manifestAnalysis.test.ts',
    "    expect(invalidResult.diagnostics).toContainEqual(\n      expect.objectContaining({\n        code: 'invalid-app-manifest-json',\n        ruleId: 'manifest.json.valid',\n      }),\n    );\n    expect(legacyFixResult.diagnostics).toContainEqual(\n      expect.objectContaining({ ruleId: 'manifest.settings.auth-flow.removed' }),\n    );",
    "    expect(\n      invalidResult.diagnostics.some(\n        (diagnostic) =>\n          diagnostic.code === 'invalid-app-manifest-json' &&\n          diagnostic.ruleId === 'manifest.json.valid',\n      ),\n    ).toBe(true);\n    expect(\n      legacyFixResult.diagnostics.some(\n        (diagnostic) => diagnostic.ruleId === 'manifest.settings.auth-flow.removed',\n      ),\n    ).toBe(true);",
)
